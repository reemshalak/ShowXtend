/**
 * FloatingCallOverlay — Draggable picture-in-picture call panel.
 * 
 * Apple Vision Pro glossy glass style
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSession } from './collaboration';
import { useControlPermission } from './ControlPermission';

//@ts-ignore
import './css/FloatingCallOverlay.css';

interface RTCPeerConnectionData {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  name: string;
  color: string;
}

interface FloatingCallOverlayProps {
  onLeave: () => void;
  roomCode: string;
}

export default function FloatingCallOverlay({ onLeave, roomCode }: FloatingCallOverlayProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Map<string, RTCPeerConnectionData>>(new Map());
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);

  const { hasControl, requestControl, revokeControl } = useControlPermission({
    onControlGranted: () => console.log('Control granted!'),
    onControlRevoked: () => console.log('Control revoked!')
  });

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth - 700, y: 80 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Map<string, RTCPeerConnectionData>>(new Map());
  const configuration = useRef({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  });

  const isPico = /Pico|PICO/.test(navigator.userAgent);
  const session = getSession();

  const handleCopyLink = () => {
    if (!roomCode) return;
    const link = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 660, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y)),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);


  // Add this effect to ensure local video is attached when stream changes
useEffect(() => {
  if (localVideoRef.current && localStream) {
    localVideoRef.current.srcObject = localStream;
    // Force play to ensure video starts
    localVideoRef.current.play().catch(e => console.warn('Play failed:', e));
  }
}, [localStream]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragging.current = true;
    dragOffset.current = {
      x: e.touches[0].clientX - pos.x,
      y: e.touches[0].clientY - pos.y,
    };
  }, [pos]);

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 660, e.touches[0].clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.touches[0].clientY - dragOffset.current.y)),
      });
    };
    const onEnd = () => { dragging.current = false; };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  }, []);

  // Camera / mic init
  useEffect(() => {
    let mounted = true;
    async function init() {
      setConnectionStatus('Checking camera…');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) return;
        setLocalStream(stream);
        setCameraAvailable(true);
        setConnectionStatus('Connected');
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        setCameraAvailable(false);
        try {
          const audio = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (!mounted) return;
          setLocalStream(audio);
          setConnectionStatus('Audio only');
        } catch {
          setConnectionStatus('No devices');
        }
      }
    }
    init();
    return () => { mounted = false; localStream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // WebRTC signaling
  useEffect(() => {
    if (!session || !localStream) return;

    const createPC = (id: string, name: string, color: string) => {
      const pc = new RTCPeerConnection(configuration.current);
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      pc.ontrack = (ev) => {
        const peer = peersRef.current.get(id);
        if (peer) { peer.stream = ev.streams[0]; setRemotePeers(new Map(peersRef.current)); }
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) session.send({ type: 'webrtc_candidate', targetId: id, candidate: ev.candidate } as any);
      };
      peersRef.current.set(id, { pc, stream: null, name, color });
      return pc;
    };

    const initiate = async (id: string, name: string, color: string) => {
      if (id === session.participantId || peersRef.current.has(id)) return;
      const pc = createPC(id, name, color);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      session.send({ type: 'webrtc_offer', targetId: id, offer: { type: offer.type, sdp: offer.sdp }, participantName: session.currentName, participantColor: session.participantColor } as any);
    };

    const unsub = session.onEvent(async (event, fromId) => {
      if (event.type === 'participant_join') {
        setTimeout(() => initiate(event.participant.id, event.participant.name, event.participant.color), 1000);
      }
      if (event.type === 'participant_leave') {
        peersRef.current.get(event.participantId)?.pc.close();
        peersRef.current.delete(event.participantId);
        setRemotePeers(new Map(peersRef.current));
      }
      if ((event as any).type === 'webrtc_offer') {
        const { targetId, offer, participantName, participantColor } = event as any;
        if (targetId !== session.participantId) return;
        let pc = peersRef.current.get(fromId)?.pc ?? createPC(fromId, participantName, participantColor);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        session.send({ type: 'webrtc_answer', targetId: fromId, answer: { type: ans.type, sdp: ans.sdp } } as any);
      }
      if ((event as any).type === 'webrtc_answer') {
        const { targetId, answer } = event as any;
        if (targetId !== session.participantId) return;
        await peersRef.current.get(fromId)?.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
      if ((event as any).type === 'webrtc_candidate') {
        const { targetId, candidate } = event as any;
        if (targetId !== session.participantId) return;
        try { await peersRef.current.get(fromId)?.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      }
    });

    session.send({ type: 'request_presence' });
    return () => { unsub(); peersRef.current.forEach((p) => p.pc.close()); peersRef.current.clear(); };
  }, [session, localStream]);

  // Track enable/disable
  useEffect(() => {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !micMuted; });
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
  }, [micMuted, cameraOff, localStream]);

  const remotes = Array.from(remotePeers.entries());

  if (!roomCode) return null;

  // Minimized pill
  if (minimized) {
    return (
      <div
        ref={panelRef}
        className="call-minimized"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className="call-minimized-pill" onClick={() => setMinimized(false)}>
          <div className="call-live-dot" />
          <span className="call-minimized-text">Live Call</span>
          <span className="call-minimized-room">{roomCode}</span>
          <span className="call-minimized-expand">↗ Expand</span>
        </div>
      </div>
    );
  }

  // Full call panel
  return (
    <div
      ref={panelRef}
      className="call-panel-container"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="call-panel">
        {/* Header */}
        <div
          className="call-header"
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          <div className="call-live-dot" />
          <span className="call-title">Live Call</span>

          <div className="call-room-code">
            <span className="call-room-code-icon">🔗</span>
            <span className="call-room-code-text">{roomCode}</span>
            <button
              onClick={handleCopyLink}
              className={`call-copy-btn ${copied ? 'copied' : ''}`}
            >
              {copied ? '✓' : 'Copy'}
            </button>
          </div>

          <div className="call-header-actions">
            <button
              className="call-minimize-btn"
              onClick={() => setMinimized(true)}
              title="Minimize"
            >−</button>
            <button
              className="call-end-btn"
              onClick={onLeave}
              title="End call"
            >✕</button>
          </div>
        </div>

        {/* Connection status */}
        <div className="call-status-bar">
          <span className="call-status-room">Room: {roomCode}</span>
          <span className={connectionStatus === 'Connected' ? 'call-status-connected' : 'call-status-disconnected'}>
            {connectionStatus}
          </span>
        </div>

        {/* Video grid */}
        <div className="call-video-grid">
          {/* Local tile */}
          <div className="call-video-tile">
            {localStream && localStream.getVideoTracks().length > 0 && !cameraOff ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="call-video call-video-mirror"
              />
            ) : (
              <div className="call-avatar">
                <div
                  className="call-avatar-circle"
                  style={{ background: session?.participantColor ?? '#38bdf8' }}
                >
                  {session?.currentName?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <p className="call-avatar-name">{session?.currentName ?? 'You'}</p>
              </div>
            )}
            <div className="call-video-label">
              You {micMuted && '🔇'}
            </div>
          </div>

          {/* Remote tiles */}
          <div className="call-remote-tiles">
            {remotes.length === 0 ? (
              <div className="call-waiting">
                <div className="call-spinner" />
                <span className="call-waiting-text">
                  Share the invite link above
                </span>
              </div>
            ) : (
              remotes.map(([id, peer]) => (
                <div key={id} className="call-video-tile">
                  {peer.stream && peer.stream.getVideoTracks().length > 0 ? (
                    <video
                      autoPlay
                      playsInline
                      className="call-video call-video-mirror"
                      ref={(el) => { if (el && peer.stream) el.srcObject = peer.stream; }}
                    />
                  ) : (
                    <div
                      className="call-avatar-circle"
                      style={{
                        width: 56, height: 56, fontSize: '1.4rem',
                        background: peer.color, margin: '0 auto'
                      }}
                    >
                      {peer.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="call-video-label">{peer.name}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="call-controls">
          <button
            onClick={() => setMicMuted(v => !v)}
            className={`call-control-btn ${micMuted ? 'call-control-btn-muted' : ''}`}
          >
            {micMuted ? '🔇' : '🎙️'}
          </button>

          <button
            onClick={() => setCameraOff(v => !v)}
            className={`call-control-btn ${cameraOff ? 'call-control-btn-muted' : ''}`}
          >
            {cameraOff ? '📷' : '📹'}
          </button>

          <button
            onClick={hasControl ? revokeControl : requestControl}
            className={`call-control-btn ${hasControl ? 'call-control-btn-active' : ''}`}
            title={hasControl ? "Revoke Control" : "Request Control"}
          >
            {hasControl ? '🎮' : '🎚️'}
          </button>

          <button onClick={onLeave} className="call-end-call-btn">
            End Call
          </button>
        </div>
      </div>
    </div>
  );
}