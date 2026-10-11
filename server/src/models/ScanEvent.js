import mongoose from "mongoose";

const { Schema } = mongoose;

const scanEventSchema = new Schema(
  {
    ticket: { type: Schema.Types.ObjectId, ref: "Ticket" }, // null if the scanned code didn't match any ticket
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    qrToken: { type: String, required: true }, // the raw scanned value, kept even on INVALID for diagnostics

    result: {
      type: String,
      enum: ["VALID", "ALREADY_USED", "INVALID", "NOT_AUTHORIZED"],
      required: true,
    },

    scannedByOrganizer: { type: Schema.Types.ObjectId, ref: "Organizer" },
    scannedByScannerLink: { type: Schema.Types.ObjectId, ref: "ScannerLink" },

    // Client-generated UUID — the idempotency key. If a sync batch is
    // retried (e.g. the network drops mid-upload), replaying a scan with
    // the same clientScanId returns the original stored result instead of
    // re-evaluating it, so a retry can never double-process a scan.
    clientScanId: { type: String, required: true, unique: true, index: true },

    scannedAt: { type: Date, required: true }, // when the scan actually happened (client-reported)
    syncedAt: { type: Date, default: Date.now }, // when the server received/processed it
    offline: { type: Boolean, default: false }, // true if this was queued offline and synced later
  },
  { timestamps: true }
);

export default mongoose.model("ScanEvent", scanEventSchema);
