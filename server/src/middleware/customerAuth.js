
import {
  verifyToken,
  CUSTOMER_SESSION_COOKIE,
} from "../utils/token.js";

export function requireCustomer(req, res, next) {
  const token = req.cookies?.[CUSTOMER_SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Please log in to access your customer account.",
      },
    });
  }

  try {
    const payload = verifyToken(token);

    if (!payload.customerId || payload.role !== "customer") {
      return res.status(401).json({
        error: {
          code: "INVALID_SESSION",
          message: "Invalid customer session.",
        },
      });
    }

    req.customer = {
      customerId: payload.customerId,
      email: payload.email,
      name: payload.name,
    };

    next();
  } catch {
    return res.status(401).json({
      error: {
        code: "INVALID_SESSION",
        message: "Your session has expired. Please log in again.",
      },
    });
  }
}
