import Event from "../models/Event.js";
import Ticket from "../models/Ticket.js";
import ScannerLink from "../models/ScannerLink.js";
import { signScannerToken, SCANNER_SESSION_COOKIE, scannerCookieOptions } from "../utils/token.js";
import { verifyTicketCore } from "../utils/verify.js";
import { logger } from "../utils/logger.js";

// GET /api/public/scanner-links/:token/activate — opening the magic link.
// This IS the authentication event: no password, no account. Sets an
// httpOnly session cookie scoped to this one event.
export async function activateScannerLink(req, res, next) {
  try {
    const link = await ScannerLink.findOne({ token: req.params.token }).populate(
      "event",
      "title slug"
    );

    if (!link) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "This scanner link is invalid." } });
    }
    if (link.status !== "ACTIVE" || link.expiresAt < new Date()) {
      logger.scanner(`Activation rejected — link ${link._id} is ${link.status.toLowerCase()}/expired`);
      return res.status(403).json({
        error: {
          code: "LINK_REVOKED",
          message: "This scanner link has been deactivated or has expired.",
        },
      });
    }

    const sessionToken = signScannerToken(link);
    res.cookie(SCANNER_SESSION_COOKIE, sessionToken, scannerCookieOptions);

    link.lastSeenAt = new Date();
    await link.save();

    logger.scanner(`Link activated — ${link._id} (${link.label || "unlabeled"}) for "${link.event.title}"`);

    res.json({
      eventId: link.event._id,
      eventTitle: link.event.title,
      label: link.label,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/scanner/verify — team member scanning, scoped to their linked event only.
// Accepts an optional clientScanId/scannedAt/offline so online scans use the
// same idempotency + audit trail as synced offline ones.
export async function verifyAsScannerLink(req, res, next) {
  try {
    const { qrToken, clientScanId, scannedAt } = req.body;
    if (!qrToken || typeof qrToken !== "string") {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Missing ticket code." } });
    }

    const result = await verifyTicketCore({
      eventId: req.scannerLink.event,
      qrToken: qrToken.trim(),
      scannedByType: "TEAM_MEMBER",
      scannedById: req.scannerLink._id,
      clientScanId,
      scannedAt,
      offline: false,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/events/:id/verify — organizer scanning their own event directly (no link needed)
export async function verifyAsOrganizer(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }

    const { qrToken, clientScanId, scannedAt } = req.body;
    if (!qrToken || typeof qrToken !== "string") {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Missing ticket code." } });
    }

    const result = await verifyTicketCore({
      eventId: event._id,
      qrToken: qrToken.trim(),
      scannedByType: "HOST",
      scannedById: req.organizer.organizerId,
      clientScanId,
      scannedAt,
      offline: false,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// GET /api/scanner/offline-manifest — the "encrypted attendee list" from the
// PRD, cached client-side (IndexedDB) so scanning can continue if the venue
// loses connectivity. Deliberately minimal: just token/tier/status, no
// guest name/email/phone — the device never holds PII it doesn't need,
// which is most of what "encrypted attendee list" is protecting against in
// the first place. (True at-rest encryption of the cached copy itself is a
// deliberate scope cut for this version — see CHANGELOG.)
export async function getScannerOfflineManifest(req, res, next) {
  try {
    const tickets = await Ticket.find({ event: req.scannerLink.event }).select("qrToken tierName status");
    logger.sync(`Offline manifest served to scanner link ${req.scannerLink._id} — ${tickets.length} ticket(s)`);
    res.json({ eventId: req.scannerLink.event, tickets, generatedAt: new Date() });
  } catch (err) {
    next(err);
  }
}

// POST /api/scanner/sync-scans — batch upload of scans made while offline.
// Each is processed through the exact same verifyTicketCore as a live scan,
// so a ticket scanned offline is validated with the same atomicity
// guarantees once it reaches the server — the only difference is `offline:
// true` and a client-reported scannedAt instead of "now".
export async function syncScans(req, res, next) {
  try {
    const { scans } = req.body;
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No scans to sync." } });
    }

    logger.sync(`Syncing ${scans.length} offline scan(s) from scanner link ${req.scannerLink._id}`);

    const results = [];
    for (const scan of scans) {
      if (!scan.qrToken || !scan.clientScanId) continue;

      const result = await verifyTicketCore({
        eventId: req.scannerLink.event,
        qrToken: scan.qrToken,
        scannedByType: "TEAM_MEMBER",
        scannedById: req.scannerLink._id,
        clientScanId: scan.clientScanId,
        scannedAt: scan.scannedAt,
        offline: true,
      });

      results.push({ clientScanId: scan.clientScanId, result: result.result, replayed: !!result.replayed });
    }

    logger.sync(`Sync complete — ${results.length} scan(s) processed for scanner link ${req.scannerLink._id}`);
    res.json({ results });
  } catch (err) {
    next(err);
  }
}

// GET /api/events/:id/offline-manifest — same manifest, for the organizer's
// own self-scan page.
export async function getOrganizerOfflineManifest(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }

    const tickets = await Ticket.find({ event: event._id }).select("qrToken tierName status");
    logger.sync(`Offline manifest served to organizer for "${event.title}" — ${tickets.length} ticket(s)`);
    res.json({ eventId: event._id, tickets, generatedAt: new Date() });
  } catch (err) {
    next(err);
  }
}

// POST /api/events/:id/sync-scans — same batch sync, for the organizer's own scanner
export async function syncOrganizerScans(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || event.organizer.toString() !== req.organizer.organizerId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Event not found." } });
    }

    const { scans } = req.body;
    if (!Array.isArray(scans) || scans.length === 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No scans to sync." } });
    }

    logger.sync(`Syncing ${scans.length} offline scan(s) from organizer for "${event.title}"`);

    const results = [];
    for (const scan of scans) {
      if (!scan.qrToken || !scan.clientScanId) continue;

      const result = await verifyTicketCore({
        eventId: event._id,
        qrToken: scan.qrToken,
        scannedByType: "HOST",
        scannedById: req.organizer.organizerId,
        clientScanId: scan.clientScanId,
        scannedAt: scan.scannedAt,
        offline: true,
      });

      results.push({ clientScanId: scan.clientScanId, result: result.result, replayed: !!result.replayed });
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
}
