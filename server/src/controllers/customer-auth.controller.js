
import { createHmac, randomInt } from "node:crypto";
import Customer from "../models/Customer.js";
import CustomerOtp from "../models/CustomerOtp.js";
import Booking from "../models/Booking.js";
import {
    signCustomerToken,
    CUSTOMER_SESSION_COOKIE,
    customerCookieOptions,
} from "../utils/token.js";
import { sendCustomerLoginOtp } from "../utils/notifications.js";
import Ticket from "../models/Ticket.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hashOtp(email, code) {
    return createHmac("sha256", process.env.JWT_SECRET)
        .update(`${email}:${code}`)
        .digest("hex");
}

export async function requestCustomerOtp(req, res, next) {
    try {
        const email = normalizeEmail(req.body?.email);
        const name =
            typeof req.body?.name === "string" ? req.body.name.trim() : "";
        console.log("[OTP DEBUG]", {
            bodyKeys: Object.keys(req.body || {}),
            emailReceived: JSON.stringify(req.body?.email),
            emailNormalized: JSON.stringify(email),
        });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                error: { code: "INVALID_EMAIL", message: "Enter a valid email address." },
            });
        }

        if (name.length > 100) {
            return res.status(400).json({
                error: { code: "INVALID_NAME", message: "Name must be 100 characters or fewer." },
            });
        }

        const existingOtp = await CustomerOtp.findOne({
            email,
            purpose: "CUSTOMER_LOGIN",
        });

        if (
            existingOtp &&
            Date.now() - existingOtp.lastSentAt.getTime() < RESEND_WAIT_MS
        ) {
            return res.status(429).json({
                error: {
                    code: "OTP_COOLDOWN",
                    message: "Please wait before requesting another code.",
                },
            });
        }

        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await CustomerOtp.findOneAndUpdate(
            { email, purpose: "CUSTOMER_LOGIN" },
            {
                $set: {
                    name,
                    codeHash: hashOtp(email, code),
                    expiresAt,
                    attempts: 0,
                    lastSentAt: new Date(),
                },
            },
            { upsert: true, new: true, runValidators: true }
        );

        try {
            await sendCustomerLoginOtp({ to: email, code });
        } catch (emailError) {
            await CustomerOtp.deleteOne({ email, purpose: "CUSTOMER_LOGIN" });
            throw emailError;
        }

        return res.json({
            success: true,
            message: "If the email can receive messages, a sign-in code has been sent.",
            expiresInSeconds: OTP_TTL_MS / 1000,
            resendAfterSeconds: RESEND_WAIT_MS / 1000,
        });
    } catch (err) {
        next(err);
    }
}

export async function verifyCustomerOtp(req, res, next) {
    try {
        const email = normalizeEmail(req.body?.email);
        const code =
            typeof req.body?.code === "string" ? req.body.code.trim() : "";

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
            return res.status(400).json({
                error: {
                    code: "INVALID_INPUT",
                    message: "Enter a valid email and six-digit code.",
                },
            });
        }

        const otpRecord = await CustomerOtp.findOne({
            email,
            purpose: "CUSTOMER_LOGIN",
        });

        if (!otpRecord || otpRecord.expiresAt.getTime() <= Date.now()) {
            return res.status(400).json({
                error: {
                    code: "OTP_EXPIRED",
                    message: "This code is invalid or expired. Request a new one.",
                },
            });
        }

        if (otpRecord.attempts >= MAX_ATTEMPTS) {
            return res.status(429).json({
                error: {
                    code: "OTP_ATTEMPTS_EXCEEDED",
                    message: "Too many attempts. Request a new code.",
                },
            });
        }

        const submittedHash = hashOtp(email, code);

        if (submittedHash !== otpRecord.codeHash) {
            otpRecord.attempts += 1;
            await otpRecord.save();

            return res.status(400).json({
                error: {
                    code: "OTP_INVALID",
                    message: "The sign-in code is incorrect.",
                },
            });
        }

        // Consume the OTP before issuing a session so it cannot be reused.
        const consumed = await CustomerOtp.findOneAndDelete({
            _id: otpRecord._id,
            codeHash: submittedHash,
            expiresAt: { $gt: new Date() },
            attempts: { $lt: MAX_ATTEMPTS },
        });

        if (!consumed) {
            return res.status(400).json({
                error: {
                    code: "OTP_INVALID",
                    message: "This code is no longer valid. Request a new one.",
                },
            });
        }

        let customer = await Customer.findOne({ email });

        if (!customer) {
            const name = consumed.name?.trim();

            if (!name) {
                return res.status(400).json({
                    error: {
                        code: "NAME_REQUIRED",
                        message: "Enter your name and request a new sign-in code.",
                    },
                });
            }

            customer = await Customer.create({
                name,
                email,
                emailVerified: true,
            });
        } else if (!customer.emailVerified) {
            customer.emailVerified = true;
            await customer.save();
        }

        // Link only confirmed guest bookings with this verified email.
        // Existing customer-linked bookings are not reassigned.
        await Booking.updateMany(
            {
                customer: { $exists: false },
                guestEmail: email,
                status: "CONFIRMED",
            },
            { $set: { customer: customer._id } }
        );

        const token = signCustomerToken(customer);
        res.cookie(CUSTOMER_SESSION_COOKIE, token, customerCookieOptions);

        return res.json({
            success: true,
            customer: {
                id: customer._id,
                name: customer.name,
                email: customer.email,
                emailVerified: customer.emailVerified,
            },
        });
    } catch (err) {
        next(err);
    }
}

export function logoutCustomer(req, res) {
    res.clearCookie(CUSTOMER_SESSION_COOKIE, {
        ...customerCookieOptions,
        maxAge: undefined,
    });

    return res.json({ success: true });
}



export async function getCustomerMe(req, res, next) {
  try {
    const customer = await Customer.findById(req.customer.customerId);

    if (!customer) {
      return res.status(401).json({
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer account not found. Please sign in again.",
        },
      });
    }

    return res.json({
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        emailVerified: customer.emailVerified,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerBookings(req, res, next) {
  try {
    const customerId = req.customer.customerId;

    const bookings = await Booking.find({ customer: customerId })
      .populate("event", "title slug startAt venueName city")
      .sort({ createdAt: -1 })
      .lean();

    if (bookings.length === 0) {
      return res.json({ bookings: [] });
    }

    const bookingIds = bookings.map((booking) => booking._id);

    const tickets = await Ticket.find({
      booking: { $in: bookingIds },
    })
      .select("booking tierName status usedAt qrDataUrl createdAt")
      .lean();

    const ticketsByBooking = new Map();

    for (const ticket of tickets) {
      const key = ticket.booking.toString();

      if (!ticketsByBooking.has(key)) {
        ticketsByBooking.set(key, []);
      }

      ticketsByBooking.get(key).push({
        id: ticket._id,
        tierName: ticket.tierName,
        status: ticket.status,
        usedAt: ticket.usedAt ?? null,
        qrDataUrl: ticket.qrDataUrl,
        createdAt: ticket.createdAt,
      });
    }

    const result = bookings.map((booking) => ({
      id: booking._id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      items: booking.items,
      totalAmount: booking.totalAmount,
      status: booking.status,
      confirmedAt: booking.confirmedAt ?? null,
      createdAt: booking.createdAt,
      event: booking.event
        ? {
            id: booking.event._id,
            title: booking.event.title,
            slug: booking.event.slug,
            startAt: booking.event.startAt,
            venueName: booking.event.venueName,
            city: booking.event.city,
          }
        : null,
      tickets: ticketsByBooking.get(booking._id.toString()) ?? [],
    }));

    return res.json({ bookings: result });
  } catch (err) {
    next(err);
  }
}
