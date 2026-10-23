
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

export async function createScannerLink(eventId, label) {
  return apiFetch(`/api/events/${encodeURIComponent(eventId)}/scanner-links`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function getScannerLinks(eventId) {
  return apiFetch(`/api/events/${encodeURIComponent(eventId)}/scanner-links`);
}

export async function revokeScannerLink(eventId, linkId) {
  return apiFetch(
    `/api/events/${encodeURIComponent(eventId)}/scanner-links/${encodeURIComponent(linkId)}/revoke`,
    { method: "PATCH" }
  );
}

export async function activateScannerLink(token) {
  return apiFetch(
    `/api/public/scanner-links/${encodeURIComponent(token)}/activate`
  );
}

export async function verifyScannerTicket(qrToken) {
  const token = String(qrToken || "").trim();

  if (!token) {
    throw new Error("Please scan or enter a ticket QR code.");
  }

  const clientScanId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return apiFetch("/api/scanner/verify", {
    method: "POST",
    body: JSON.stringify({
      qrToken: token,
      clientScanId,
      scannedAt: new Date().toISOString(),
    }),
  });
}

export async function getScannerOfflineManifest() {
  return apiFetch("/api/scanner/offline-manifest");
}