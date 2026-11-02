import mongoose from "mongoose";
const { Schema } = mongoose;
const schema = new Schema({
  booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 }, lastSentAt: { type: Date, default: Date.now },
  windowStartedAt: { type: Date, default: Date.now }, requestCount: { type: Number, default: 1 },
}, { timestamps: true });
schema.index({ booking: 1, email: 1 }, { unique: true });
export default mongoose.model("BookingRecoveryOtp", schema);
