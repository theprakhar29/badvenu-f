import crypto from "node:crypto";
import Ticket from "../models/Ticket.js";
import ScanEvent from "../models/ScanEvent.js";
import { logger } from "./logger.js";

/**
 * Validates a scanned QR token against one specific event and, if valid,
 * atomically marks the ticket used. Every attempt — valid, already-used,
 * invalid, or wrong-event — is recorded as a ScanEvent, both for audit
 * purposes and because that record is what makes offline-sync retries safe
 * (see clientScanId below).
 *
 * The UNUSED -> USED transition uses the same compare-and-swap pattern as
 * the inventory reservation in v1.2 (findOneAndUpdate with the expected
 * current state in the filter): if two scanners hit the same ticket at the
 * same instant, only one update matches `status: "UNUSED"` and succeeds —
 * the other gets back null and correctly reports ALREADY_USED instead of
 * both letting the person in.
 */
export async function verifyTicketCore({
  eventId,
  qrToken,
  scannedByType,
  scannedById,
  clientScanId,
  scannedAt,
  offline = false,
}) {
  // Idempotent replay: if this exact client-generated scan was already
  // processed (a retried offline-sync batch, or a flaky network retry),
  // return the original result instead of re-evaluating. Without this, a
  // retry could show ALREADY_USED for a scan that was actually the first
  // and only real attempt.
  if (clientScanId) {
    const existing = await ScanEvent.findOne({ clientScanId });
    if (existing) {
      const ticket = existing.ticket ? await Ticket.findById(existing.ticket) : null;
      logger.sync(`Replayed scan ${clientScanId} — returning original result (${existing.result})`);
      return { result: existing.result, ticket, replayed: true };
    }
  }

  const effectiveScannedAt = scannedAt ? new Date(scannedAt) : new Date();
  const scanId = clientScanId || crypto.randomUUID();

  async function record(result, ticket) {
    await ScanEvent.create({
      ticket: ticket?._id,
      event: eventId,
      qrToken,
      result,
      scannedByOrganizer: scannedByType === "HOST" ? scannedById : undefined,
      scannedByScannerLink: scannedByType === "TEAM_MEMBER" ? scannedById : undefined,
      clientScanId: scanId,
      scannedAt: effectiveScannedAt,
      offline,
    });
    return { result, ticket };
  }

  const ticket = await Ticket.findOne({ qrToken });

  if (!ticket) {
    logger.scan(`INVALID — no ticket for code ${qrToken.slice(0, 8)}…${offline ? " (offline)" : ""}`);
    return record("INVALID", null);
  }

  if (ticket.event.toString() !== eventId.toString()) {
    logger.scan(`NOT_AUTHORIZED — ticket ${ticket._id} scanned for the wrong event`);
    return record("NOT_AUTHORIZED", ticket);
  }

  if (ticket.status === "VOID") {
    logger.scan(`INVALID — ticket ${ticket._id} is voided`);
    return record("INVALID", ticket);
  }

  if (ticket.status === "USED") {
    logger.scan(`ALREADY_USED — ticket ${ticket._id} (${ticket.tierName})${offline ? " (offline)" : ""}`);
    return record("ALREADY_USED", ticket);
  }

  const updateFields = { status: "USED", usedAt: effectiveScannedAt };
  if (scannedByType === "HOST") updateFields.usedByOrganizer = scannedById;
  if (scannedByType === "TEAM_MEMBER") updateFields.usedByScannerLink = scannedById;

  const updated = await Ticket.findOneAndUpdate(
    { _id: ticket._id, status: "UNUSED" },
    updateFields,
    { new: true }
  );

  if (!updated) {
    // Lost the race — someone else's scan landed first between our read and write.
    const latest = await Ticket.findById(ticket._id);
    logger.scan(`ALREADY_USED (race) — ticket ${ticket._id} scanned elsewhere first`);
    return record("ALREADY_USED", latest);
  }

  logger.scan(`VALID — ticket ${updated._id} (${updated.tierName})${offline ? " (offline)" : ""} — entry approved`);
  return record("VALID", updated);
}
