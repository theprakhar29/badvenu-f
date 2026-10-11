import { Router } from "express";
import { requireScannerLink } from "../middleware/scannerAuth.js";
import { verifyAsScannerLink, getScannerOfflineManifest, syncScans } from "../controllers/scan.controller.js";

const router = Router();

router.use(requireScannerLink);

router.post("/verify", verifyAsScannerLink);
router.get("/offline-manifest", getScannerOfflineManifest);
router.post("/sync-scans", syncScans);

export default router;
