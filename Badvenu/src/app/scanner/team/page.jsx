"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getScannerOfflineManifest,
  verifyScannerTicket,
} from "../../../services/scanner.service";
import "./team.css";

const RESULT_DETAILS = {
  VALID: {
    title: "Entry approved",
    message: "Ticket verified successfully.",
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
    message: "This ticket does not belong to the linked event.",
    color: "#b91c1c",
  },
};

export default function TeamScannerPage() {
  const router = useRouter();
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const processedTokensRef = useRef(new Set());
  const mountedRef = useRef(false);

  const [eventInfo, setEventInfo] = useState(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const manifest = await getScannerOfflineManifest();

        if (cancelled) return;

        let stored = null;
        try {
          stored = JSON.parse(
            sessionStorage.getItem("badvenu_scanner_event") || "null"
          );
        } catch {
          stored = null;
        }

        setEventInfo({
          eventId: manifest.eventId,
          eventTitle: stored?.eventTitle || "Authorized event",
          label: stored?.label || "",
        });
      } catch (error) {
        if (!cancelled) {
          setAccessError(
            error.message ||
              "Scanner access is unavailable. Ask the organizer for a fresh link."
          );
        }
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  const verifyToken = useCallback(async (rawToken, source = "manual") => {
    const token = String(rawToken || "").trim();

    if (!token || processingRef.current) return;
    if (processedTokensRef.current.has(token)) return;

    processingRef.current = true;
    processedTokensRef.current.add(token);
    setProcessing(true);
    setResult(null);
    setCameraError("");

    try {
      const response = await verifyScannerTicket(token);
      const code = String(response?.result || "").toUpperCase();
      const details = RESULT_DETAILS[code] || {
        title: "Unrecognized result",
        message: "The server returned an unexpected scan result.",
        color: "#475569",
      };

      const ticket = response?.ticket;

      setResult({
        ...details,
        code,
        tierName: ticket?.tierName || "",
      });

      setHistory((previous) =>
        [
          {
            id: `${Date.now()}-${Math.random()}`,
            code,
            title: details.title,
            color: details.color,
            tierName: ticket?.tierName || "",
            source,
            time: new Date().toLocaleTimeString(),
          },
          ...previous,
        ].slice(0, 10)
      );

      setManualToken("");
    } catch (error) {
      // Permit retry after a network/server error.
      processedTokensRef.current.delete(token);

      setResult({
        title: "Could not verify ticket",
        message: error.message || "Please check the connection and try again.",
        color: "#b91c1c",
        code: "ERROR",
      });
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, []);

  useEffect(() => {
    if (checkingAccess || accessError) return;

    mountedRef.current = true;
    let cancelled = false;

    async function startCamera() {
      let scanner;

      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const element = document.getElementById("badvenu-team-qr-reader");
        if (!element) throw new Error("The camera scanner element is missing.");

        scanner = new Html5Qrcode("badvenu-team-qr-reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => verifyToken(decodedText, "camera"),
          () => {}
        );

        if (!cancelled && mountedRef.current) {
          setCameraReady(true);
          setCameraError("");
        }
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          setCameraError(
            error.message ||
              "Camera unavailable. Use manual entry or check browser permissions."
          );
        }
      }

      if (cancelled && scanner) {
        try {
          if (scanner.isScanning) await scanner.stop();
        } catch {}
        try {
          scanner.clear();
        } catch {}
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
            if (scanner.isScanning) await scanner.stop();
          } catch {}
          try {
            scanner.clear();
          } catch {}
        })();
      }
    };
  }, [checkingAccess, accessError, verifyToken]);

  function resetScanner() {
    setResult(null);
    setManualToken("");
    processedTokensRef.current.clear();
  }

  function handleManualSubmit(event) {
    event.preventDefault();
    verifyToken(manualToken, "manual");
  }

  if (checkingAccess) {
    return <main className="team-scanner-page"><p>Checking scanner access...</p></main>;
  }

  if (accessError) {
    return (
      <main className="team-scanner-page">
        <section className="team-scanner-card">
          <h1>Scanner access unavailable</h1>
          <p role="alert">{accessError}</p>
          <button onClick={() => router.replace("/")}>Return to Badvenu</button>
        </section>
      </main>
    );
  }

  return (
    <main className="team-scanner-page">
      <div className="team-scanner-container">
        <header className="team-scanner-header">
          <span>BADVENU ENTRY TEAM</span>
          <h1>Ticket Scanner</h1>
          <h2>{eventInfo?.eventTitle}</h2>
          {eventInfo?.label && <p>Team: {eventInfo.label}</p>}
          <p>Scan a guest's ticket QR code to verify event entry.</p>
        </header>

        <section className="team-scanner-card">
          <h2>Scan ticket</h2>
          <div id="badvenu-team-qr-reader" className="team-scanner-camera" />

          {cameraReady && (
            <p className="team-scanner-status">
              Camera ready — hold the QR code inside the frame.
            </p>
          )}

          {cameraError && <p className="team-scanner-error" role="alert">{cameraError}</p>}

          <div className="team-scanner-divider">OR ENTER CODE MANUALLY</div>

          <form onSubmit={handleManualSubmit}>
            <label htmlFor="team-ticket-token">Ticket QR token</label>
            <input
              id="team-ticket-token"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              autoComplete="off"
              placeholder="Paste the ticket QR token"
            />
            <button type="submit" disabled={processing || !manualToken.trim()}>
              {processing ? "Verifying..." : "Verify ticket"}
            </button>
          </form>
        </section>

        {result && (
          <section className="team-scanner-result" style={{ borderColor: result.color }}>
            <h2 style={{ color: result.color }}>{result.title}</h2>
            <p>{result.message}</p>
            {result.tierName && <p>Ticket type: <strong>{result.tierName}</strong></p>}
            <button type="button" onClick={resetScanner}>Scan next ticket</button>
          </section>
        )}

        <section className="team-scanner-history">
          <h2>Recent scans</h2>
          {history.length === 0 ? (
            <p>No tickets scanned yet.</p>
          ) : (
            history.map((scan) => (
              <article key={scan.id}>
                <div>
                  <strong>{scan.title}</strong>
                  <p>{scan.time} · {scan.source}{scan.tierName ? ` · ${scan.tierName}` : ""}</p>
                </div>
                <span style={{ color: scan.color }}>{scan.code}</span>
              </article>
            ))
          )}
        </section>

        <p className="team-scanner-footer">
          Keep this device secure. If access is no longer needed, ask the organizer
          to revoke this scanner link.
        </p>
      </div>
    </main>
  );
}