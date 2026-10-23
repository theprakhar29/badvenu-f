"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { activateScannerLink } from "../../../services/scanner.service";
import "./activate.css";

function ActivationContent() {
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Activating your scanner access...");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = params.get("token");

    if (!token) {
      setMessage("This activation URL is missing its token. Ask the organizer for a new link.");
      return;
    }

    let cancelled = false;

    async function activate() {
      try {
        const result = await activateScannerLink(token);

        if (cancelled) return;

        sessionStorage.setItem(
          "badvenu_scanner_event",
          JSON.stringify({
            eventId: result.eventId,
            eventTitle: result.eventTitle,
            label: result.label || "",
          })
        );

        router.replace("/scanner/team");
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error.message ||
              "This scanner link is invalid, expired or has been revoked. Ask the organizer for a new one."
          );
        }
      }
    }

    activate();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main className="scanner-activation-page">
      <div className="scanner-activation-card">
        <span className="scanner-activation-brand">BADVENU</span>
        <h1>Entry-team access</h1>
        <p role="status">{message}</p>
        {message !== "Activating your scanner access..." && (
          <button type="button" onClick={() => router.replace("/")}>
            Return to Badvenu
          </button>
        )}
      </div>
    </main>
  );
}

export default function ScannerActivationPage() {
  return (
    <Suspense
      fallback={
        <main className="scanner-activation-page">
          <div className="scanner-activation-card">Loading activation...</div>
        </main>
      }
    >
      <ActivationContent />
    </Suspense>
  );
}