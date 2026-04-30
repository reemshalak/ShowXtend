/**
 * VoicePage — Main panel.
 *
 * XR mode (PICO standalone):
 *   - Transparent background via html.is-spatial
 *   - "ElevenLabs" title + circular mic button only
 *   - Opens /history as a second WebSpatial scene
 *   - Syncs transcripts via BroadcastChannel + localStorage
 *
 * Desktop browser:
 *   - Dark background
 *   - "ElevenLabs" title + mic button on the left
 *   - Transcript history panel on the right, inline on the same page
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { initScene } from "@webspatial/react-sdk";
import { isXRMode } from "./xrMode";

const ELEVENLABS_API_KEY = (import.meta as any).env?.VITE_ELEVENLABS_API_KEY || "";
const HISTORY_WINDOW_NAME = "elevenlabs-history";
const BROADCAST_CHANNEL = "elevenlabs-transcripts";
const STORAGE_KEY = "elevenlabs-transcript-history";

async function transcribeAudio(apiKey: string, audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("file", audioBlob, "recording.webm");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs STT ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { text?: string };
  if (!data.text?.trim()) throw new Error("No transcript returned");
  return data.text.trim();
}

export type TranscriptEntry = { id: string; text: string; ts: number };

export default function VoicePage() {
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // XR only: open history as a separate spatial scene
  useEffect(() => {
    if (!isXRMode) return;

    channelRef.current = new BroadcastChannel(BROADCAST_CHANNEL);

    initScene(HISTORY_WINDOW_NAME, (cfg) => ({
      ...cfg,
      defaultSize: { width: 500, height: 700 },
    }));
    window.open("/history", HISTORY_WINDOW_NAME);

    return () => {
      channelRef.current?.close();
    };
  }, []);

  // Desktop only: auto-scroll transcript feed
  useEffect(() => {
    if (isXRMode) return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  const publishTranscript = useCallback((entry: TranscriptEntry) => {
    // Always update local state (used for desktop inline history)
    setTranscripts((prev) => [...prev, entry].slice(-50));

    if (isXRMode) {
      // Persist so history panel can load on mount
      try {
        const existing: TranscriptEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, entry].slice(-50)));
      } catch {}
      // Notify history panel in real-time
      channelRef.current?.postMessage({ type: "transcript", entry });
    }
  }, []);

  const stopAndTranscribe = useCallback(
    async (recorder: MediaRecorder) => {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        if (recorder.state !== "inactive") recorder.stop();
        else resolve();
      });
      recorder.stream?.getTracks().forEach((t) => t.stop());

      const chunks = chunksRef.current.splice(0);
      const blob = new Blob(chunks, { type: chunks[0]?.type ?? "audio/webm" });

      if (blob.size < 200) {
        setError("Recording too short — hold the button longer.");
        return;
      }

      setIsTranscribing(true);
      setError(null);
      try {
        if (!ELEVENLABS_API_KEY) throw new Error("No ElevenLabs API key — set VITE_ELEVENLABS_API_KEY in .env");
        const text = await transcribeAudio(ELEVENLABS_API_KEY, blob);
        publishTranscript({ id: `${Date.now()}-${Math.random()}`, text, ts: Date.now() });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transcription failed");
      } finally {
        setIsTranscribing(false);
      }
    },
    [publishTranscript],
  );

  const handleToggle = useCallback(async () => {
    setError(null);

    if (isRecording) {
      setIsRecording(false);
      const recorder = mediaRecorderRef.current;
      if (recorder) stopAndTranscribe(recorder);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
    } catch (e) {
      if (e instanceof DOMException) {
        if (e.name === "NotAllowedError") {
          setError("Microphone access denied — please allow microphone access when prompted.");
        } else if (e.name === "NotFoundError") {
          setError("No microphone found on this device.");
        } else {
          setError(`Microphone error: ${e.message}`);
        }
      } else {
        setError(e instanceof Error ? e.message : "Failed to access microphone");
      }
    }
  }, [isRecording, stopAndTranscribe]);

  const isBusy = isTranscribing;
  const hasApiKey = !!ELEVENLABS_API_KEY;

  const statusText = isRecording
    ? "Recording… tap to stop"
    : isTranscribing
      ? "Transcribing…"
      : hasApiKey
        ? "Tap to speak"
        : "Missing VITE_ELEVENLABS_API_KEY in .env";

  const micPanel = (
    <div className="voice-mic-panel">
      {/* Title */}
      <h1 className="elevenlabs-title">WebSpatial</h1>

      {/* Mic button with fog glow */}
      <div className="mic-wrapper" enable-xr-monitor>
        <div className={`fog-ring ${isRecording ? "fog-ring--rainbow" : "fog-ring--grey"}`} />
        {/*
          enable-xr is on a <div>, not <button>, so the XR renderer
          applies the material to a plain box element without browser
          button defaults interfering with border-radius.
          borderRadius is also set inline (highest specificity) so the
          XR material layer reads the circular shape directly.
        */}
        <div
          enable-xr
          role="button"
          tabIndex={isBusy || !hasApiKey ? -1 : 0}
          onClick={isBusy || !hasApiKey ? undefined : handleToggle}
          onKeyDown={(e) => {
            if (!isBusy && hasApiKey && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              handleToggle();
            }
          }}
          className={`mic-circle ${isRecording ? "mic-circle--active" : "mic-circle--idle"} ${isBusy || !hasApiKey ? "mic-circle--disabled" : ""}`}
          style={{
            // Only --xr-back (z-depth) is set for XR — no --xr-background-material.
            // Adding a material hands shape rendering to the XR system which
            // ignores CSS border-radius, making it square.
            // The button's circular look is handled entirely by CSS classes,
            // and the fog ring div provides the glow effect around it.
            ...(isXRMode && {
              "--xr-back": "40",
            } as React.CSSProperties),
          }}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          aria-pressed={isRecording}
          aria-disabled={isBusy || !hasApiKey}
        >
          <span className="mic-icon">🎙</span>
        </div>
      </div>

      <p className="status-text">{statusText}</p>
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  // XR: only show the mic panel — history is a separate scene
  if (isXRMode) {
    return <div className="voice-page-root">{micPanel}</div>;
  }

  // Desktop: mic panel + inline history side by side
  return (
    <div className="voice-page-desktop">
      {micPanel}

      <div className="desktop-history-panel">
        <div className="history-header">
          <h2 className="history-title">Transcript History</h2>
          {transcripts.length > 0 && (
            <button className="history-clear-btn" onClick={() => setTranscripts([])}>
              Clear
            </button>
          )}
        </div>

        {transcripts.length === 0 ? (
          <div className="history-empty">
            <p>Transcripts will appear here</p>
          </div>
        ) : (
          <div ref={feedRef} className="history-feed">
            {transcripts.map((t) => (
              <div key={t.id} className="history-card">
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
    </div>
  );
}
