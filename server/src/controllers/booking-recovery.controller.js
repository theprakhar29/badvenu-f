import { createHmac, randomInt } from "node:crypto";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import BookingAccessGrant from "../models/BookingAccessGrant.js";
import BookingRecoveryOtp from "../models/BookingRecoveryOtp.js";
import { ACCESS_PURPOSE, createBookingAccessGrant } from "../utils/bookingAccess.js";
import { sendCustomerLoginOtp } from "../utils/notifications.js";

const TTL = 10 * 60 * 1000, WAIT = 60 * 1000, MAX = 5, WINDOW = 60 * 60 * 1000;
const generic = { success: true, message: "If the booking details are eligible, a recovery code has been sent." };
const email = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const hash = (value, code) => createHmac("sha256", process.env.JWT_SECRET).update(`${value}:${code}`).digest("hex");
export function makeBookingRecoveryHandlers({ BookingModel = Booking, GrantModel = BookingAccessGrant, OtpModel = BookingRecoveryOtp, transaction = (work) => BookingModel.db.transaction(work), sendOtp = sendCustomerLoginOtp, hashOtp = hash } = {}) {
async function requestBookingRecovery(req, res) {
  const bookingId = req.body?.bookingId, recipient = email(req.body?.email), now = new Date();
  if (!mongoose.isObjectIdOrHexString(bookingId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return res.status(202).json(generic);
  const booking = await BookingModel.findOne({ _id: bookingId, status: "CONFIRMED", guestEmail: recipient }).select("_id guestEmail");
  if (!booking) return res.status(202).json(generic);
  const prior = await OtpModel.findOne({ booking: booking._id, email: recipient });
  if (prior && (+now - +prior.lastSentAt < WAIT || (+now - +prior.windowStartedAt < WINDOW && prior.requestCount >= MAX))) return res.status(202).json(generic);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const windowReset = !prior || +now - +prior.windowStartedAt >= WINDOW;
  // A replacement challenge may rotate a code, but never resets a live
  // challenge's brute-force counter. That counter is durable across instances.
  await OtpModel.findOneAndUpdate({ booking: booking._id, email: recipient }, { $set: { codeHash: hashOtp(recipient, code), expiresAt: new Date(+now + TTL), lastSentAt: now, windowStartedAt: windowReset ? now : prior.windowStartedAt, ...(windowReset ? { attempts: 0 } : {}) }, $setOnInsert: { booking: booking._id, email: recipient, attempts: 0, requestCount: 0 }, $inc: { requestCount: 1 } }, { upsert: true });
  try { await sendOtp({ to: booking.guestEmail, code }); } catch { await OtpModel.deleteOne({ booking: booking._id, email: recipient, codeHash: hashOtp(recipient, code) }); }
  return res.status(202).json(generic);
}
async function verifyBookingRecovery(req, res, next) {
  try {
    const bookingId = req.body?.bookingId, recipient = email(req.body?.email), code = String(req.body?.code || "").trim(), now = new Date();
    if (!mongoose.isObjectIdOrHexString(bookingId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !/^\d{6}$/.test(code)) throw Object.assign(new Error("Recovery code is invalid or expired."), { status: 400, code: "RECOVERY_INVALID" });
    const result = await transaction(async (session) => {
      const otp = await OtpModel.findOne({ booking: bookingId, email: recipient }).select("+codeHash").session(session);
      if (!otp || otp.expiresAt <= now || otp.attempts >= MAX) throw Object.assign(new Error("Recovery code is invalid or expired."), { status: 400, code: "RECOVERY_INVALID" });
      const codeHash = hashOtp(recipient, code);
      if (codeHash !== otp.codeHash) { await OtpModel.updateOne({ _id: otp._id, attempts: { $lt: MAX } }, { $inc: { attempts: 1 } }, { session }); throw Object.assign(new Error("Recovery code is invalid or expired."), { status: 400, code: "RECOVERY_INVALID" }); }
      const consumed = await OtpModel.findOneAndDelete({ _id: otp._id, codeHash, expiresAt: { $gt: now }, attempts: { $lt: MAX } }, { session });
      if (!consumed) throw Object.assign(new Error("Recovery code is invalid or expired."), { status: 400, code: "RECOVERY_INVALID" });
      const booking = await BookingModel.findOne({ _id: bookingId, status: "CONFIRMED", guestEmail: recipient }).select("+accessVersion").session(session);
      if (!booking) throw Object.assign(new Error("Recovery code is invalid or expired."), { status: 400, code: "RECOVERY_INVALID" });
      const expiresAt = new Date(+now + 7 * 86400000), issued = createBookingAccessGrant({ booking, purpose: ACCESS_PURPOSE.TICKET, source: "RECOVERY", expiresAt, now });
      await GrantModel.create([issued.grant], { session });
      return { bookingId: String(booking._id), ticketAccessToken: issued.token, ticketAccessExpiresAt: expiresAt };
    });
    res.json(result);
  } catch (err) { next(err); }
}
return { requestBookingRecovery, verifyBookingRecovery }; }
const handlers = makeBookingRecoveryHandlers();
export const { requestBookingRecovery, verifyBookingRecovery } = handlers;
