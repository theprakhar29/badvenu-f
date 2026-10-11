import mongoose from "mongoose";

const { Schema } = mongoose;

const scannerLinkSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    organizer: { type: Schema.Types.ObjectId, ref: "Organizer", required: true },

    // Opaque, unguessable — this is the entire "credential." Opening a URL
    // containing it is the authentication event; no account/password.
    token: { type: String, required: true, unique: true, index: true },

    label: { type: String, trim: true }, // e.g. "Front Gate", "Staff: Priya"
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("ScannerLink", scannerLinkSchema);
