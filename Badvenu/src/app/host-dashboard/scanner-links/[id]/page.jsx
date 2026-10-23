"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Copy, Link2, ShieldCheck, Ban } from "lucide-react";
import Navbar from "../../../../components/Navbar";
import SubNav from "../../../../components/SubNav";
import Footer from "../../../../components/Footer";
import { getMyEvent } from "../../../../services/event.service";
import {
  createScannerLink,
  getScannerLinks,
  revokeScannerLink,
} from "../../../../services/scanner.service";
import { API_URL } from "../../../../lib/api";
import "./scanner-links.css";

export default function ScannerLinksPage() {
  const params = useParams();
  const eventId = String(params?.id || "");

  const [event, setEvent] = useState(null);
  const [links, setLinks] = useState([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const loadData = useCallback(async () => {
    if (!eventId) return;

    setLoading(true);
    setError("");

    try {
      const [eventData, linkData] = await Promise.all([
        getMyEvent(eventId),
        getScannerLinks(eventId),
      ]);

      setEvent(eventData?.event || eventData);
      setLinks(Array.isArray(linkData) ? linkData : linkData?.links || []);
    } catch (err) {
      setError(err.message || "Could not load scanner links.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate(eventObject) {
    eventObject.preventDefault();
    setError("");
    setNotice("");
    setNewUrl("");

    const cleanLabel = label.trim();

    if (!cleanLabel) {
      setError("Enter a name such as Front Gate or Entry Team.");
      return;
    }

    setCreating(true);

    try {
      const link = await createScannerLink(eventId, cleanLabel);

      if (!link?.token) {
        throw new Error(
          "The server created a link but did not return its activation token."
        );
      }

      const url = new URL("/scanner/activate", window.location.origin);
      url.searchParams.set("token", link.token);

      setNewUrl(url.toString());
      setNotice("Scanner link created. Copy it now and share it privately.");
      setLabel("");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not create the scanner link.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(newUrl);
      setNotice("Link copied. Share it only with your entry-team member.");
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  async function handleRevoke(linkId) {
    const confirmed = window.confirm(
      "Revoke this scanner link? The linked team member will lose access."
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await revokeScannerLink(eventId, linkId);
      setNotice("Scanner link revoked.");
      if (newUrl) setNewUrl("");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not revoke this scanner link.");
    }
  }

  return (
    <div className="app">
      <Navbar />
      <SubNav />

      <main className="scanner-links-page">
        <Link className="scanner-links-back" href="/host-dashboard">
          ← Back to dashboard
        </Link>

        <header className="scanner-links-heading">
          <span>BADVENU ORGANIZER TOOLS</span>
          <h1>Entry-team access</h1>
          <p>
            {event?.title
              ? `Manage scanner links for ${event.title}.`
              : "Create and manage event-specific scanner links."}
          </p>
        </header>

        {error && <p className="scanner-links-alert error" role="alert">{error}</p>}
        {notice && <p className="scanner-links-alert success" role="status">{notice}</p>}

        <section className="scanner-links-card">
          <h2>Create a team link</h2>
          <p>
            Give each entry-team member or gate a separate link so you can
            revoke access individually.
          </p>

          <form onSubmit={handleCreate} className="scanner-links-form">
            <label htmlFor="scanner-label">Team member or gate name</label>
            <input
              id="scanner-label"
              value={label}
              onChange={(eventObject) => setLabel(eventObject.target.value)}
              maxLength={100}
              placeholder="e.g. Main Gate"
              required
            />
            <button type="submit" disabled={creating || !eventId}>
              <Link2 size={17} />
              {creating ? "Creating..." : "Create scanner link"}
            </button>
          </form>

          {newUrl && (
            <div className="scanner-link-created">
              <label htmlFor="created-scanner-url">
                New activation link — copy and share privately
              </label>
              <input
                id="created-scanner-url"
                value={newUrl}
                readOnly
                onFocus={(eventObject) => eventObject.target.select()}
              />
              <button type="button" onClick={handleCopy}>
                <Copy size={16} /> Copy link
              </button>
              <p>
                This URL is a credential. Anyone who has it may activate the
                scanner until it expires or you revoke it.
              </p>
            </div>
          )}
        </section>

        <section className="scanner-links-card">
          <div className="scanner-links-list-heading">
            <h2>Existing links</h2>
            <button type="button" onClick={loadData} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <p>Loading scanner links...</p>
          ) : links.length === 0 ? (
            <p>No scanner links have been created for this event yet.</p>
          ) : (
            <div className="scanner-links-list">
              {links.map((link) => {
                const expired =
                  link.expiresAt && new Date(link.expiresAt) <= new Date();
                const active = link.status === "ACTIVE" && !expired;

                return (
                  <article className="scanner-link-row" key={link._id}>
                    <div className="scanner-link-info">
                      <strong>{link.label || "Unnamed scanner"}</strong>
                      <span className={active ? "status-active" : "status-inactive"}>
                        {expired && link.status === "ACTIVE"
                          ? "EXPIRED"
                          : link.status}
                      </span>
                      <small>
                        Expires:{" "}
                        {link.expiresAt
                          ? new Date(link.expiresAt).toLocaleString("en-IN")
                          : "Not available"}
                      </small>
                      <small>
                        Last used:{" "}
                        {link.lastSeenAt
                          ? new Date(link.lastSeenAt).toLocaleString("en-IN")
                          : "Not activated yet"}
                      </small>
                    </div>

                    {active && (
                      <button
                        type="button"
                        className="scanner-revoke-button"
                        onClick={() => handleRevoke(link._id)}
                      >
                        <Ban size={16} /> Revoke
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="scanner-links-security">
          <ShieldCheck size={17} />
          Team access is event-specific and can be revoked by the organizer.
          Links expire after 24 hours under the current backend configuration.
        </p>
      </main>

      <Footer />
    </div>
  );
}