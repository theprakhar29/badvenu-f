import mongoose from "mongoose";

const { Schema } = mongoose;

const bookingItemSchema = new Schema({
  pricingTierId: { type: Schema.Types.ObjectId, required: true },
  tierName: { type: String, required: true }, // snapshot at booking time
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
});

const formResponseSchema = new Schema({
  fieldKey: { type: String, enum: ["PHONE", "AGE", "CUSTOM_QUESTION"], required: true },
  value: { type: String, required: true },
});

const deliveryLogSchema = new Schema({
  channel: { type: String, enum: ["EMAIL", "SMS"], required: true },
  purpose: {
    type: String,
    enum: ["TICKET_DELIVERY", "PAYMENT_FAILED"],
    default: "TICKET_DELIVERY",
  },
  to: { type: String, required: true },
  status: { type: String, enum: ["SENT", "FAILED"], default: "SENT" },
  error: { type: String }, // set when status is FAILED — the send itself errored (bad creds, etc.)
  sentAt: { type: Date, default: Date.now },
});

const paymentSchema = new Schema(
  {
    provider: { type: String, default: "razorpay" },
    orderId: { type: String }, // Razorpay order ID
    paymentId: { type: String }, // Razorpay payment ID, set once paid
    signature: { type: String },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created" },
  },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },

    // Guest contact — captured per booking, no account required (per PRD).
    guestName: { type: String, required: true, trim: true },
    guestEmail: { type: String, trim: true, lowercase: true },
    guestPhone: { type: String, trim: true },

    items: [bookingItemSchema],
    formResponses: [formResponseSchema],
    deliveryLog: [deliveryLogSchema],
    payment: paymentSchema,

    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "EXPIRED", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    holdExpiresAt: { type: Date },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Booking", bookingSchema);
