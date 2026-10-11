import crypto from "node:crypto";
import Event from "../models/Event.js";
import ScannerLink from "../models/ScannerLink.js";
import { logger } from "../utils/logger.js";

const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24h — organizer can revoke sooner anytime

async function assertOwnedEvent(eventId, organizerId) {
  const event = await Event.findById(eventId);
  if (!event || event.organizer.toString() !== organizerId) {
    const err = new Error("Event not found.");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  return event;
}

// POST /api/events/:id/scanner-links — invite a team member (generate a magic link)
export async function createScannerLink(req, res, next) {
  try {
    const event = await assertOwnedEvent(req.params.id, req.organizer.organizerId);

    const token = crypto.randomBytes(24).toString("base64url");
    const link = await ScannerLink.create({
      event: event._id,
      organizer: req.organizer.organizerId,
      token,
      label: typeof req.body.label === "string" ? req.body.label.trim() || undefined : undefined,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + LINK_LIFETIME_MS),
    });

    logger.scanner(`Link created for "${event.title}" (${link.label || "unlabeled"}) — ${link._id}`);
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id/scanner-links — list this event's links (active + revoked, for visibility)
export async function listScannerLinks(req, res, next) {
  try {
    await assertOwnedEvent(req.params.id, req.organizer.organizerId);
    const links = await ScannerLink.find({ event: req.params.id }).sort({ createdAt: -1 });
    res.json(links);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/events/:id/scanner-links/:linkId/revoke — the kill switch
export async function revokeScannerLink(req, res, next) {
  try {
    await assertOwnedEvent(req.params.id, req.organizer.organizerId);

    const link = await ScannerLink.findOne({ _id: req.params.linkId, event: req.params.id });
    if (!link) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Scanner link not found." } });
    }

    link.status = "REVOKED";
    link.revokedAt = new Date();
    await link.save();

    logger.scanner(`Link REVOKED — ${link._id} (${link.label || "unlabeled"}) — kill switch engaged`);
    res.json(link);
  } catch (err) {
    next(err);
  }
}
