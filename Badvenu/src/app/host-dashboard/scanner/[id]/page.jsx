
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { verifyEventTicket } from "../../../../services/scanner.service.js";
import "./scanner.css";

const RESULT_DETAILS = {
  VALID: {
    title: "Ticket verified",
    message: "Entry approved. This ticket has been checked in.",
    color: "#15803d",
  },
  ALREADY_USED: {
    title: "Ticket already used",
    message: "This ticket has already been checked in.",
    color: "#b45309",
  },
  INVALID: {
    title: "Invalid ticket",
    message: "This QR code does not identify a valid ticket.",
    color: "#b91c1c",
  },
  NOT_AUTHORIZED: {
    title: "Wrong event",
    message: "This ticket does not belong to this event.",
    color: "#b91c1c",
  },
};

export default function EventScannerPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.id;

  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const processedTokensRef = useRef(new Set());
  const mountedRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const verifyToken = useCallback(
    async (rawToken, source = "manual") => {
      const token = String(rawToken || "").trim();

      if (!token || !eventId || processingRef.current) return;
      if (processedTokensRef.current.has(token)) return;

      processingRef.current = true;
      processedTokensRef.current.add(token);

      if (mountedRef.current) {
        setProcessing(true);
        setResult(null);
        setCameraError("");
      }

      try {
        const response = await verifyEventTicket(eventId, token);
        const code = String(response?.result || "").toUpperCase();

        const details = RESULT_DETAILS[code] || {
          title: "Unknown response",
          message: "The server returned an unrecognized scan result.",
          color: "#475569",
        };

        const ticket = response?.ticket;

        const scan = {
          id: `${Date.now()}-${Math.random()}`,
          code,
          title: details.title,
          color: details.color,
          tierName: ticket?.tierName || "",
          source,
          time: new Date().toLocaleTimeString(),
        };

        if (mountedRef.current) {
          setResult({
            ...details,
            code,
            tierName: ticket?.tierName || "",
            source,
          });

          setHistory((previous) => [scan, ...previous].slice(0, 10));
          setManualToken("");
        }
      } catch (error) {
        // Allow retry after a network or server error.
        processedTokensRef.current.delete(token);

        if (mountedRef.current) {
          setResult({
            title: "Could not verify ticket",
            message:
              error?.message ||
              "A network error occurred. Please try again.",
            color: "#b91c1c",
            code: "ERROR",
          });
        }
      } finally {
        processingRef.current = false;

        if (mountedRef.current) {
          setProcessing(false);
        }
      }
    },
    [eventId]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function startCamera() {
      let scanner;

      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (cancelled) return;

        const reader = document.getElementById("badvenu-qr-reader");

        if (!reader) {
          throw new Error("The QR scanner element could not be found.");
        }

        scanner = new Html5Qrcode("badvenu-qr-reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            verifyToken(decodedText, "camera");
          },
          () => {
            // Normal QR decode failures occur while the camera is searching.
          }
        );

        if (!cancelled && mountedRef.current) {
          setCameraReady(true);
          setCameraError("");
        }
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          setCameraError(
            error?.message ||
              "Unable to start the camera. Check browser permissions or use manual entry."
          );
        }
      }

      if (cancelled && scanner) {
        try {
          if (scanner.isScanning) {
            await scanner.stop();
          }
        } catch {
          // Camera may already be stopped.
        }

        try {
          scanner.clear();
        } catch {
          // Ignore cleanup errors.
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      mountedRef.current = false;

      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (scanner) {
        void (async () => {
          try {
            if (scanner.isScanning) {
              await scanner.stop();
            }
          } catch {
            // Camera may already be stopped.
          }

          try {
            scanner.clear();
          } catch {
            // Ignore cleanup errors.
          }
        })();
      }
    };
  }, [verifyToken]);

  function resetScanner() {
    setResult(null);
    setManualToken("");
    processedTokensRef.current.clear();
  }

  function handleManualSubmit(event) {
    event.preventDefault();
    verifyToken(manualToken, "manual");
  }

  return (
    <main className="scanner-page">
      <div className="scanner-container">
        <button
          type="button"
          onClick={() => router.push("/host-dashboard")}
          className="scanner-back"
        >
          ← Back to dashboard
        </button>

        <header className="scanner-header">
          <p className="scanner-eyebrow">Badvenu Organizer Tools</p>

          <h1 className="scanner-title">Ticket Scanner</h1>

          <p className="scanner-description">
            Scan a guest&apos;s ticket QR code to verify entry for this event.
          </p>

          <p className="scanner-event-id">
            Event ID: {String(eventId || "")}
          </p>
        </header>

        <section className="scanner-card">
          <h2 className="scanner-section-title">Scan ticket</h2>

          <div
            id="badvenu-qr-reader"
            className="scanner-camera"
          />

          {cameraReady && (
            <p className="scanner-status" style={{ color: "#15803d" }}>
              Camera ready. Hold the ticket QR code inside the scanning frame.
            </p>
          )}

          {cameraError && (
            <p className="scanner-error" role="alert">
              {cameraError}
            </p>
          )}

          <div className="scanner-divider">
            <span>OR ENTER CODE MANUALLY</span>
          </div>

          <form onSubmit={handleManualSubmit}>
            <label htmlFor="ticket-token" className="scanner-label">
              Ticket QR token
            </label>

            <input
              id="ticket-token"
              type="text"
              autoComplete="off"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              placeholder="Paste the ticket QR token"
              className="scanner-input"
            />

            <button
              type="submit"
              disabled={processing || !manualToken.trim()}
              className="scanner-button scanner-button-full"
            >
              {processing ? "Verifying ticket..." : "Verify ticket"}
            </button>
          </form>
        </section>

        {result && (
          <section
            aria-live="polite"
            className="scanner-result"
            style={{
              borderColor: result.color,
              backgroundColor: `${result.color}0D`,
            }}
          >
            <p
              className="scanner-result-title"
              style={{ color: result.color }}
            >
              {result.title}
            </p>

            <p className="scanner-result-message">{result.message}</p>

            {result.tierName && (
              <p className="scanner-result-message">
                Ticket type: <strong>{result.tierName}</strong>
              </p>
            )}

            <button
              type="button"
              onClick={resetScanner}
              className="scanner-button"
              style={{
                marginTop: 16,
                background: "#fff",
                color: "#172033",
                border: "1px solid #cbd5e1",
              }}
            >
              Scan next ticket
            </button>
          </section>
        )}

        <section>
          <div className="scanner-history-heading">
            <h2>Recent scans</h2>
            <span className="scanner-history-count">
              Latest {history.length} attempts
            </span>
          </div>

          {history.length === 0 ? (
            <p className="scanner-history-empty">
              No tickets scanned yet.
            </p>
          ) : (
            <div className="scanner-history-list">
              {history.map((scan) => (
                <div key={scan.id} className="scanner-history-item">
                  <div>
                    <p className="scanner-history-name">{scan.title}</p>

                    <p className="scanner-history-meta">
                      {scan.time} · {scan.source}
                      {scan.tierName ? ` · ${scan.tierName}` : ""}
                    </p>
                  </div>

                  <span
                    className="scanner-history-code"
                    style={{ color: scan.color }}
                  >
                    {scan.code}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
