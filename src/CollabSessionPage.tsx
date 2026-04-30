import { useEffect, useState } from 'react';
import { joinSession, leaveSession, generateRoomCode, testSupabaseConnection, getSession } from './collaboration';
import FloatingCallOverlay from './FloatingCallOverlay';

// The channel name must match exactly what CenterPanelPage is listening to
const SESSION_CHANNEL = 'session-join-channel';

interface CollabSessionPageProps {
  onSessionReady?: (roomCode: string, name: string) => void;
  onClose?: () => void;
}

export default function CollabSessionPage({ onSessionReady, onClose }: CollabSessionPageProps = {}) {
  const [screen, setScreen] = useState<'lobby' | 'session'>('lobby');
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [name, setName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    testSupabaseConnection().then((connected: boolean) => {
      if (!connected) setError('⚠️ Cannot connect to Supabase Realtime.');
    });
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return setError('Enter your name first');
    const code = generateRoomCode();
    console.log('🎯 Creating room with code:', code);
    setRoomCode(code);
    setConnecting(true);
    try {
      await joinSession(code, name.trim());
      
      // ── RESTORED BROADCAST ──────────────────────────────────────────────
      // This tells the main window (CenterPanelPage) to join the same room
      const bc = new BroadcastChannel(SESSION_CHANNEL);
      bc.postMessage({ 
        type: 'session_joined', 
        roomCode: code, 
        name: name.trim() 
      });
      bc.close();
      // ────────────────────────────────────────────────────────────────────

      console.log('✅ Successfully joined room (create):', code);
      setScreen('session');
      onSessionReady?.(code, name.trim());

      // Room creator = host: auto-grant control to self after a short delay
      // so CenterPanelPage has time to attach its session listener
      setTimeout(() => {
        const s = getSession();
        if (s) s.send({ type: 'control_granted', grantedTo: s.participantId } as any);
      }, 1000);
    } catch (e) {
      console.error('❌ Failed to join:', e);
      setError('Connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim()) return setError('Enter your name first');
    const code = joinInput.toUpperCase().trim();
    if (code.length < 4) return setError('Enter a valid room code');
    console.log('🔗 Joining room with code:', code);
    setRoomCode(code);
    setConnecting(true);
    try {
      await joinSession(code, name.trim());

      // ── RESTORED BROADCAST ──────────────────────────────────────────────
      // This tells the main window (CenterPanelPage) to join the same room
      const bc = new BroadcastChannel(SESSION_CHANNEL);
      bc.postMessage({ 
        type: 'session_joined', 
        roomCode: code, 
        name: name.trim() 
      });
      bc.close();
      // ────────────────────────────────────────────────────────────────────

      console.log('✅ Successfully joined room (join):', code);
      setScreen('session');
      onSessionReady?.(code, name.trim());
    } catch (e) {
      console.error('❌ Failed to join:', e);
      setError('Connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleLeave = () => {
    leaveSession();
    setScreen('lobby');
    setRoomCode('');
    onClose?.();
  };

  if (connecting) {
    return (
      <div className="call-side-panel call-lobby">
        <div className="call-side-header">
          <span className="call-side-title">📞 Connecting...</span>
          <button className="call-close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <p>Connecting to room {roomCode}...</p>
        </div>
      </div>
    );
  }

  if (screen === 'session') {
    return <FloatingCallOverlay onLeave={handleLeave} roomCode={roomCode} />;
  }

  return (
    <div className="call-side-panel call-lobby">
      <div className="call-side-header">
        <span className="call-side-title">📞 Join Call</span>
        {onClose && <button className="call-close-btn" onClick={onClose}>✕</button>}
      </div>
      <div className="call-lobby-content">
        <div className="call-lobby-avatar">🎥</div>
        <input 
          className="collab-input" 
          placeholder="Your name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
        />
        <button 
          className="collab-create-btn" 
          onClick={handleCreate} 
          disabled={connecting || !name.trim()}
        >
          + Create new call
        </button>
        <div className="collab-divider">or join existing</div>
        <input 
          className="collab-input" 
          placeholder="Enter room code" 
          value={joinInput} 
          onChange={(e) => setJoinInput(e.target.value.toUpperCase())} 
        />
        <button 
          className="collab-join-btn" 
          onClick={handleJoin} 
          disabled={connecting || !name.trim() || !joinInput}
        >
          Join
        </button>
        {error && <p className="collab-error">{error}</p>}
      </div>
    </div>
  );
}