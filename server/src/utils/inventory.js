import Event from "../models/Event.js";
import Booking from "../models/Booking.js";

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function holdExpiryDate() {
  return new Date(Date.now() + HOLD_DURATION_MS);
}

/**
 * Attempts to reserve one line item using optimistic concurrency:
 * read the tier's current reservedQty/soldQty, confirm there's enough
 * room, then update *only if* those values haven't changed since the
 * read (via $elemMatch on the exact current values). If another request
 * reserved stock in between, modifiedCount comes back 0 and we retry.
 *
 * This is a standard compare-and-swap pattern — no reliance on
 * version-sensitive aggregation syntax, so it's safe across MongoDB
 * versions without needing a live instance to verify against.
 */
async function reserveTierOnce(eventId, item) {
  const event = await Event.findOne(
    { _id: eventId, "pricingTiers._id": item.pricingTierId },
    { "pricingTiers.$": 1 }
  );

  if (!event || !event.pricingTiers?.length) {
    const err = new Error(`Ticket type "${item.tierName}" no longer exists.`);
    err.status = 400;
    err.code = "INVALID_TIER";
    throw err;
  }

  const tier = event.pricingTiers[0];
  const available = tier.totalQty - tier.reservedQty - tier.soldQty;

  if (available < item.quantity) {
    const err = new Error(`Not enough "${item.tierName}" tickets left. Please adjust your quantity.`);
    err.status = 409;
    err.code = "INSUFFICIENT_INVENTORY";
    throw err;
  }

  const result = await Event.updateOne(
    {
      _id: eventId,
      pricingTiers: {
        $elemMatch: {
          _id: item.pricingTierId,
          reservedQty: tier.reservedQty,
          soldQty: tier.soldQty,
        },
      },
    },
    { $inc: { "pricingTiers.$.reservedQty": item.quantity } }
  );

  return result.modifiedCount === 1;
}

/**
 * Atomically reserves inventory for each line item in a booking, retrying
 * briefly on lost races (two guests reading the same tier at the same
 * instant). If a later item in a multi-item booking can't be reserved,
 * rolls back whatever was already reserved earlier in the same request so
 * a failed booking never leaves phantom holds behind.
 */
export async function reserveInventory(eventId, items) {
  const reserved = [];

  try {
    for (const item of items) {
      let success = false;

      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        success = await reserveTierOnce(eventId, item);
      }

      if (!success) {
        const err = new Error(
          `Not enough "${item.tierName}" tickets left. Please adjust your quantity.`
        );
        err.status = 409;
        err.code = "INSUFFICIENT_INVENTORY";
        throw err;
      }

      reserved.push(item);
    }
  } catch (err) {
    // Whether we failed via a thrown business error (invalid tier,
    // insufficient stock) or exhausted retries above, always roll back
    // anything already reserved earlier in this same request.
    await releaseInventoryItems(eventId, reserved);
    throw err;
  }

  return reserved;
}

export async function releaseInventoryItems(eventId, items) {
  for (const item of items) {
    await Event.updateOne(
      { _id: eventId, "pricingTiers._id": item.pricingTierId },
      { $inc: { "pricingTiers.$.reservedQty": -item.quantity } }
    );
  }
}

export async function releaseInventory(booking) {
  await releaseInventoryItems(booking.event, booking.items);
}

/** Moves held inventory from "reserved" to "sold" once payment is confirmed. */
export async function confirmInventory(booking) {
  for (const item of booking.items) {
    await Event.updateOne(
      { _id: booking.event, "pricingTiers._id": item.pricingTierId },
      {
        $inc: {
          "pricingTiers.$.reservedQty": -item.quantity,
          "pricingTiers.$.soldQty": item.quantity,
        },
      }
    );
  }
}

/**
 * Sweeps expired PENDING holds for one event and releases their inventory.
 * This is a lazy/on-read cleanup rather than a scheduled job — fine for a
 * prototype, but a real deployment should replace this with a proper cron
 * or queue-based job (e.g. node-cron, BullMQ) so holds get released even if
 * nobody happens to view the event page.
 */
export async function releaseExpiredHolds(eventId) {
  const expired = await Booking.find({
    event: eventId,
    status: "PENDING",
    holdExpiresAt: { $lt: new Date() },
  });

  for (const booking of expired) {
    await releaseInventory(booking);
    booking.status = "EXPIRED";
    await booking.save();
  }
}
