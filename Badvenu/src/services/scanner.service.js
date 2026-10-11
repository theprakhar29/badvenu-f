
import { apiFetch } from "../lib/api";

export async function verifyEventTicket(eventId, qrToken) {
  const token = String(qrToken || "").trim();

  if (!eventId) {
    throw new Error("Event ID is missing.");
  }

  if (!token) {
    throw new Error("Please scan or enter a ticket QR code.");
  }

  const clientScanId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return apiFetch(`/api/events/${encodeURIComponent(eventId)}/verify`, {
    method: "POST",
    body: JSON.stringify({
      qrToken: token,
      clientScanId,
      scannedAt: new Date().toISOString(),
    }),
  });
}
