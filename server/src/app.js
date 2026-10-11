import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import eventRoutes from "./routes/event.routes.js";
import publicRoutes from "./routes/public.routes.js";
import scannerRoutes from "./routes/scanner.routes.js";
import { razorpayWebhook } from "./controllers/payment.controller.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  // CLIENT_ORIGIN accepts a comma-separated list, since a real deployment
  // usually needs more than one: your production frontend URL, plus
  // Vercel's per-branch/PR preview URLs if you use those. Each must be an
  // exact origin (scheme + host + port), no trailing slash, no wildcard —
  // e.g. "https://badvenue.vercel.app,https://badvenue-git-dev.vercel.app".
  const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://192.168.1.7:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin,  callback) {
        // No origin header at all = same-origin request (curl, server-to-server,
        // Razorpay's webhook) — always allow those; they're not what CORS protects against.
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        logger.error(`CORS rejected origin: ${origin} (allowed: ${allowedOrigins.join(", ")})`);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  // Every HTTP request, one line each — method, path, status, response time.
  app.use(morgan("[:date[iso]] [HTTP    ] :method :url :status :response-time ms"));

  // IMPORTANT: the Razorpay webhook needs the raw request body to verify its
  // signature (HMAC over the exact bytes Razorpay sent). It must be
  // registered BEFORE express.json() below — once the JSON parser runs,
  // the raw bytes are gone and signature verification would always fail.
  app.post(
    "/api/public/payments/webhook",
    express.raw({ type: "application/json" }),
    razorpayWebhook
  );

  app.use(express.json());
  app.use(cookieParser());
  app.use("/uploads", express.static("uploads"));

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/events", eventRoutes);
  app.use("/api/public", publicRoutes);
  app.use("/api/scanner", scannerRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
