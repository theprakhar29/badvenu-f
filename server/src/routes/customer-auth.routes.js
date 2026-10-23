
import { Router } from "express";
import {
  requestCustomerOtp,
  verifyCustomerOtp,
  logoutCustomer,
  getCustomerMe,
  getCustomerBookings,
} from "../controllers/customer-auth.controller.js";
import { requireCustomer } from "../middleware/customerAuth.js";

const router = Router();

router.post("/request-otp", requestCustomerOtp);
router.post("/verify-otp", verifyCustomerOtp);

router.get("/me", requireCustomer, getCustomerMe);
router.get("/bookings", requireCustomer, getCustomerBookings);

router.post("/logout", requireCustomer, logoutCustomer);

export default router;
