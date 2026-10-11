import Event from "../models/Event.js";
import Booking from "../models/Booking.js";
import { eventDraftSchema, statusSchema, formFieldsSchema } from "../utils/validation.js";
import { slugify } from "../utils/slugify.js";
import { releaseExpiredHolds } from "../utils/inventory.js";
import { logger } from "../utils/logger.js";
import fs from "node:fs";
import path from "node:path";
import Ticket from "../models/Ticket.js";

// POST /api/events — create a draft event (organizer only)
export async function createEvent(req, res, next) {
  try {
    const parsed = eventDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
      });
    }
    const data = parsed.data;

    const event = await Event.create({
      organizer: req.organizer.organizerId,
      title: data.title,
      slug: slugify(data.title),
      description: data.description,
      venueName: data.venueName,
      venueAddress: data.venueAddress,
      city: data.city,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      capacity: data.capacity,
      status: "DRAFT",
      pricingTiers: data.pricingTiers,
    });

    res.status(201).json(event);
    logger.event(`Draft created: "${event.title}" (${event._id}) by organizer ${req.organizer.organizerId}`);
  } catch (err) {
    next(err);
  }
}

// GET /api/events/mine — list the logged-in organizer's events
export async function listMyEvents(req, res, next) {
  try {
    const events = await Event.find({ organizer: req.organizer.organizerId }).sort({
      createdAt: -1,
    });
    res.json(events);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/events/:id/status — publish/pause/close (organizer, owner only)
export async function updateStatus(req, res, next) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }

    if (parsed.data.status === "PUBLISHED") {
      if (!event.pricingTiers.length || !event.startAt) {
        return res.status(409).json({
          error: {
            code: "INCOMPLETE_EVENT",
            message: "Add a date and at least one pricing tier before publishing.",
          },
        });
      }
    }

    event.status = parsed.data.status;
    await event.save();
    logger.event(`"${event.title}" (${event._id}) status changed -> ${event.status}`);
    res.json(event);
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id — fetch one of the organizer's own events (any status),
// used by the Form Builder step and the dashboard's "edit" flows.
export async function getMyEvent(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }
    res.json(event);
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id/stats
// Organizer-only event statistics for the dashboard.
export async function getEventStats(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);

    if (
      !event ||
      event.organizer.toString() !== req.organizer.organizerId
    ) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Event not found.",
        },
      });
    }

    // Release expired ticket holds before calculating statistics.
    await releaseExpiredHolds(event._id);

    // Re-fetch event because inventory numbers may have changed.
    const freshEvent = await Event.findById(event._id);

    if (!freshEvent) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Event not found.",
        },
      });
    }

    /*
     * Ticket capacity is calculated from pricing tiers.
     *
     * Example:
     * General = 100
     * VIP = 50
     *
     * Total capacity = 150
     */
    const totalTickets = freshEvent.pricingTiers.reduce(
      (total, tier) => total + Number(tier.totalQty || 0),
      0
    );

    const ticketsSold = freshEvent.pricingTiers.reduce(
      (total, tier) => total + Number(tier.soldQty || 0),
      0
    );

    const ticketsReserved = freshEvent.pricingTiers.reduce(
      (total, tier) => total + Number(tier.reservedQty || 0),
      0
    );

    const ticketsRemaining = Math.max(
      totalTickets - ticketsSold - ticketsReserved,
      0
    );
    const checkedInTickets = await Ticket.countDocuments({
      event: freshEvent._id,
      status: "USED",
    });

    const attendancePercentage =
      ticketsSold > 0
        ? Number(((checkedInTickets / ticketsSold) * 100).toFixed(2))
        : 0;
    /*
     * Revenue should come only from CONFIRMED bookings.
     *
     * PENDING bookings are temporary holds and should not
     * be counted as collected revenue.
     */
    const revenueResult = await Booking.aggregate([
      {
        $match: {
          event: freshEvent._id,
          status: "CONFIRMED",
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: "$totalAmount",
          },
          confirmedBookings: {
            $sum: 1,
          },
        },
      },
    ]);

    const revenueData = revenueResult[0] || {
      totalRevenue: 0,
      confirmedBookings: 0,
    };

    res.json({
      eventId: freshEvent._id,

      totalTickets,

      ticketsSold,

      ticketsReserved,

      ticketsRemaining,

      confirmedBookings:
        revenueData.confirmedBookings,

      totalRevenue:
        revenueData.totalRevenue,
      checkedInTickets,
      attendancePercentage,
      currency: "INR",

      salesPercentage:
        totalTickets > 0
          ? Number(
            (
              (ticketsSold / totalTickets) *
              100
            ).toFixed(2)
          )
          : 0,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/events/:id/form-fields — toggle preset checkout fields
// (Phone / Age / Custom Question) on or off, per the Form Builder spec.
export async function updateFormFields(req, res, next) {
  try {
    const parsed = formFieldsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
      });
    }

    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }

    event.formFields = parsed.data.formFields;
    await event.save();
    res.json(event);
  } catch (err) {
    next(err);
  }
}

// POST /api/events/:id/banner — upload/replace the event's custom banner image.
// Expects multipart/form-data with a single "banner" file field
// (handled by the uploadBannerMiddleware in the route).
export async function uploadBanner(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }

    if (!req.file) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "No image file was uploaded." },
      });
    }

    // Clean up the previous banner file, if any, so uploads don't accumulate.
    if (event.bannerUrl) {
      const oldPath = path.resolve("." + event.bannerUrl);
      fs.unlink(oldPath, () => { }); // best-effort, ignore errors
    }

    event.bannerUrl = `/uploads/banners/${req.file.filename}`;
    await event.save();
    res.json(event);
  } catch (err) {
    next(err);
  }
}

// GET /api/public/events — published events, for the home page listing
export async function listPublishedEvents(req, res, next) {
  try {
    const { city, q } = req.query;
    const filter = { status: "PUBLISHED" };
    if (city) filter.city = new RegExp(`^${city}$`, "i");
    if (q) filter.title = new RegExp(q, "i");

    const events = await Event.find(filter).sort({ startAt: 1 }).limit(24);
    res.json(events);
  } catch (err) {
    next(err);
  }
}

// GET /api/public/events/:slug — a single published event, for the public event page
export async function getPublishedEventBySlug(req, res, next) {
  try {
    const event = await Event.findOne({ slug: req.params.slug, status: "PUBLISHED" });
    if (!event) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }
    // Free up any expired holds, then re-fetch so the numbers we return
    // reflect the sweep (the in-memory `event` above is now stale).
    await releaseExpiredHolds(event._id);
    const fresh = await Event.findById(event._id);
    res.json(fresh);
  } catch (err) {
    next(err);
  }
}
