import mongoose from "mongoose";

const { Schema } = mongoose;

// Query projection is not serialization redaction: newly created documents and
// explicitly selected hashes still exist in memory. Only metadata may leave here.
// Internal verification reads document fields directly, never a serialized copy.
function serializeGrant(_doc, value) {
  return {
    _id: value._id,
    purpose: value.purpose,
    expiresAt: value.expiresAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

// No plaintext token is persisted. Expiry is enforced on every access, not by TTL cleanup.
const bookingAccessGrantSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    purpose: { type: String, enum: ["CHECKOUT", "TICKET"], required: true },
    // EMAIL grants are one-time exchange credentials. BROWSER and RECOVERY
    // grants may read tickets; CHECKOUT may only drive checkout/handoff.
    source: { type: String, enum: ["CHECKOUT", "BROWSER", "EMAIL", "RECOVERY"], select: false },
    tokenHash: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
      unique: true,
      select: false,
    },
    accessVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    consumedAt: { type: Date, default: null, select: false },
    authorizationUse: { type: Number, default: 0, select: false },
    handoffCount: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: { transform: serializeGrant },
    toObject: { transform: serializeGrant },
  }
);

export default mongoose.model("BookingAccessGrant", bookingAccessGrantSchema);
