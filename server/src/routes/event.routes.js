import { Router } from "express";
import {
  createEvent,
  listMyEvents,
  updateStatus,
  getMyEvent,
  getEventStats,
  updateFormFields,
  uploadBanner,
} from "../controllers/event.controller.js";
import {
  createScannerLink,
  listScannerLinks,
  revokeScannerLink,
} from "../controllers/scannerLink.controller.js";
import {
  verifyAsOrganizer,
  getOrganizerOfflineManifest,
  syncOrganizerScans,
} from "../controllers/scan.controller.js";
import { requireOrganizer } from "../middleware/auth.js";
import { uploadBannerMiddleware } from "../middleware/upload.js";

const router = Router();

router.use(requireOrganizer);

router.get("/mine", listMyEvents);
router.get("/:id/stats", getEventStats);
router.post("/", createEvent);
router.get("/:id", getMyEvent);
router.patch("/:id/status", updateStatus);
router.put("/:id/form-fields", updateFormFields);
router.post("/:id/banner", uploadBannerMiddleware, uploadBanner);

router.get("/:id/scanner-links", listScannerLinks);
router.post("/:id/scanner-links", createScannerLink);
router.patch("/:id/scanner-links/:linkId/revoke", revokeScannerLink);

router.post("/:id/verify", verifyAsOrganizer);
router.get("/:id/offline-manifest", getOrganizerOfflineManifest);
router.post("/:id/sync-scans", syncOrganizerScans);

export default router;
