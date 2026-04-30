/**
 * HistoryPage — Second WebSpatial panel for transcript history.
 *
 * Opened by VoicePage next to the main panel via window.open + initScene.
 * Receives transcripts via BroadcastChannel and also loads any previously
 * saved transcripts from localStorage on mount.
 *
 * Background is transparent (inherits from html.is-spatial in index.css).
 * Each transcript entry is a glass card via --xr-background-material: translucent.
 */

import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "./VoicePage";

const BROADCAST_CHANNEL = "elevenlabs-transcripts";
const STORAGE_KEY = "elevenlabs-transcript-history";

export default function HistoryPage() {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  // Load persisted transcripts on mount
  useEffect(() => {
    try {
      const stored: TranscriptEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (stored.length > 0) setTranscripts(stored);
    } catch {}
  }, []);

  // Listen for new transcripts from the main panel
  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channel.onmessage = (e) => {
      if (e.data?.type === "transcript" && e.data.entry) {
        setTranscripts((prev) => [...prev, e.data.entry].slice(-50));
      }
    };
    return () => channel.close();
  }, []);

  // Auto-scroll to newest entry
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  return (
    <div className="history-page-root">
      <div className="history-header" enable-xr>
        <h2 className="history-title">Transcript History</h2>
        {transcripts.length > 0 && (
          <button
            className="history-clear-btn"
            onClick={() => {
              setTranscripts([]);
              try { localStorage.removeItem(STORAGE_KEY); } catch {}
            }}
          >
            Clear
          </button>
        )}
      </div>

      {transcripts.length === 0 ? (
        <div className="history-empty">
          <p>Transcripts will appear here</p>
        </div>
      ) : (
        <div ref={feedRef} className="history-feed" enable-xr-monitor>
          {transcripts.map((t) => (
            <div key={t.id} enable-xr className="history-card">
              <span className="history-card-time">
                {new Date(t.ts).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <p className="history-card-text">{t.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
