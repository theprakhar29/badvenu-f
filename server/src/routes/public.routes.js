import { Router } from "express";
import { listPublishedEvents, getPublishedEventBySlug } from "../controllers/event.controller.js";
import { createBooking, confirmBooking, getBooking } from "../controllers/booking.controller.js";
import { createPaymentOrder } from "../controllers/payment.controller.js";
import { activateScannerLink } from "../controllers/scan.controller.js";

const router = Router();

router.get("/events", listPublishedEvents);
router.get("/events/:slug", getPublishedEventBySlug);
router.post("/events/:slug/bookings", createBooking);

router.get("/bookings/:id", getBooking);
router.post("/bookings/:id/payment-order", createPaymentOrder);
router.post("/bookings/:id/confirm", confirmBooking);

router.get("/scanner-links/:token/activate", activateScannerLink);

export default router;
