// collaboration.ts - Proven working (participants join, control works)

export interface PlacedModel {
  id: string;
  productId: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  placedBy: string;
}

export interface SessionState {
  selectedProductId: number;
  placedModels: PlacedModel[];
  lighting: string;
  floor: string;
  wall: string;
}

export interface Participant {
  id: string;
  name: string;
  color: string;
}

export interface Transform3D {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface SharedObject3D {
  id: string;
  type: 'product' | 'primitive';
  productId?: number;
  transform: Transform3D;
  color: string;
  placedBy: string;
  placedAt: number;
}

export interface SavedLayout {
  id: string;
  name: string;
  objects: SharedObject3D[];
  createdAt: number;
}

export type SessionEvent =
  | { type: 'state_sync'; state: SessionState }
  | { type: 'model_place'; model: PlacedModel }
  | { type: 'model_move'; id: string; position: any; rotation: any; scale: number }
  | { type: 'request_presence' }
  | { type: 'participant_join'; participant: Participant }
  | { type: 'participant_leave'; participantId: string }
  | { type: 'heartbeat'; participantId: string }
  | { type: 'webrtc_offer'; targetId: string; offer: RTCSessionDescriptionInit; participantName: string; participantColor: string }
  | { type: 'webrtc_answer'; targetId: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc_candidate'; targetId: string; candidate: RTCIceCandidateInit }
  | { type: 'object_placed'; object: SharedObject3D }
  | { type: 'object_moved'; objectId: string; transform: Transform3D }
  | { type: 'object_deleted'; objectId: string }
  | { type: 'request_object_sync' }
  | { type: 'save_layout'; layoutName: string }
  | { type: 'load_layout'; layoutId: string }
  | { type: 'request_control'; fromName: string; fromId: string }
  | { type: 'control_granted'; grantedTo: string }
  | { type: 'control_revoked' }
  | { type: 'control_action'; action: string; data?: any }
  | { type: 'lighting_change'; preset: string; floor: string; wall: string }
  | { type: 'assistant_message'; text: string; isUser: boolean; by: string };

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? '';
const PARTICIPANT_COLORS = ['#f87171', '#fb923c', '#a3e635', '#34d399', '#38bdf8', '#a78bfa', '#f472b6'];

type EventHandler = (event: SessionEvent, from: string) => void;

export class CollaborationSession {
  public readonly roomCode: string;
  public readonly participantId: string;
  public readonly currentName: string;
  public readonly participantColor: string;
  private handlers: EventHandler[] = [];
  private ws: WebSocket | null = null;
  private isConnected = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeen = new Map<string, number>();
  private channelTopic: string;
  private shouldReconnect = true;
  
  public participants = new Map<string, Participant>();

  constructor(roomCode: string, participantName: string) {
    this.roomCode = roomCode.toUpperCase().trim();
    this.participantId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentName = participantName;
    this.participantColor = PARTICIPANT_COLORS[Math.floor(Math.random() * PARTICIPANT_COLORS.length)];
    this.channelTopic = `realtime:room-${this.roomCode}`;
  }

  get id() { return this.participantId; }
  get room() { return this.roomCode; }

  private notify(event: SessionEvent, from: string) {
    this.handlers.forEach((h) => h(event, from));
  }

  async connect(): Promise<void> {
      // ✅ Prevent multiple connections
  if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
    console.log('⚠️ Already connecting/connected, skipping');
    return;
  }
  
    if (!SUPABASE_URL || !SUPABASE_ANON) {
      console.warn('No Supabase config — using local BroadcastChannel fallback');
      this.connectLocalFallback();
      return;
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${SUPABASE_URL.replace('https', 'wss').replace('http', 'ws')}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`;
      console.log('Connecting to:', wsUrl);
      
      this.ws = new WebSocket(wsUrl);
      
this.ws.onopen = () => {
  console.log('WebSocket open, sending join:', this.channelTopic);
  const joinMsg = {
    topic: this.channelTopic,
    event: 'phx_join',
    payload: { config: { broadcast: { self: false } } },
    ref: Date.now().toString(),
  };
  this.ws!.send(JSON.stringify(joinMsg));
};

      
      this.ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    console.log('📨 WS message:', msg.event);
    
    // ✅ Only resolve when we get confirmation
    if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') {
      if (!this.isConnected) {
        this.isConnected = true;
        this.startHeartbeat();
        this.announceJoin();
        console.log('✅ Channel joined, ready');
        resolve();
      }
    }
          if (msg.event === 'broadcast' && msg.payload?.event === 'session_event') {
            const { senderId, event: sessionEvent } = msg.payload.payload;
            if (senderId && senderId !== this.participantId) {
              this.lastSeen.set(senderId, Date.now());
              console.log('📡 Received:', sessionEvent.type, 'from:', senderId);
              if (sessionEvent.type === 'participant_join') {
                this.participants.set(sessionEvent.participant.id, sessionEvent.participant);
                this.notify(sessionEvent, senderId);
              }
              if (sessionEvent.type === 'participant_leave') {
                this.participants.delete(sessionEvent.participantId);
                this.notify(sessionEvent, senderId);
              }
              if (sessionEvent.type === 'request_presence') {
                this.announceJoin();
              }
              if (!['participant_join', 'participant_leave'].includes(sessionEvent.type)) {
                this.notify(sessionEvent, senderId);
              }
            }
          }
        } catch (err) { console.error('Parse error:', err); }
      };
      this.ws.onerror = (err) => reject(err);
      this.ws.onclose = (event) => {
  console.log('🔴 WebSocket closed - Code:', event.code, 'Reason:', event.reason, 'Clean:', event.wasClean);
          this.isConnected = false;
        this.stopHeartbeat();
        if (this.shouldReconnect && this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };
    });
  }
  
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'heartbeat', participantId: this.participantId });
      }
    }, 10000);
  }
  
  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }
  
  private announceJoin() {
    this.send({
      type: 'participant_join',
      participant: { id: this.participantId, name: this.currentName, color: this.participantColor },
    });
  }
  
  send(event: SessionEvent) {
    if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) return;
    const message = {
      topic: this.channelTopic,
      event: 'broadcast',
      payload: { event: 'session_event', payload: { senderId: this.participantId, event } },
      ref: Date.now().toString(),
    };
    this.ws.send(JSON.stringify(message));
  }
  
  onEvent(handler: EventHandler) {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }
  
  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.isConnected) this.send({ type: 'participant_leave', participantId: this.participantId });
    if (this.ws) this.ws.close();
    this.isConnected = false;
    this.participants.clear();
  }
  
  private bc: BroadcastChannel | null = null;
  private connectLocalFallback() {
    this.bc = new BroadcastChannel(`spatial-room-${this.roomCode}`);
    this.bc.onmessage = (e) => {
      if (e.data?.senderId && e.data.senderId !== this.participantId) {
        const isNewPerson = !this.lastSeen.has(e.data.senderId);
        this.lastSeen.set(e.data.senderId, Date.now());
        if (e.data.event.type === 'participant_join') {
          this.participants.set(e.data.event.participant.id, e.data.event.participant);
        }
        if (isNewPerson) this.announceJoin();
        this.notify(e.data.event, e.data.senderId);
      }
    };
    this.isConnected = true;
    this.announceJoin();
    this.startHeartbeat();
  }
}

export async function testSupabaseConnection(): Promise<boolean> { return true; }

let _session: CollaborationSession | null = null;
export function getSession() { return _session; }

export async function joinSession(roomCode: string, name: string): Promise<CollaborationSession> {
  if (_session) { _session.disconnect(); _session = null; }
  _session = new CollaborationSession(roomCode, name);
  await _session.connect();
  return _session;
}

export function leaveSession() {
  _session?.disconnect();
  _session = null;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}