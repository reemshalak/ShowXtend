/**
 * XRObjectToolbarWindow  /xr-object-toolbar?id=<id>&emoji=<e>&label=<l>&color=<c>
 *
 * 180×310 spatial window — toolbar for one placed object.
 * Talks to XRModelWindow via toolbarChannel(id).
 */

import { useEffect, useState } from 'react';
import { onToolbar, postToolbar, type ToolbarMsg } from './XRModelBridge';

const PALETTE = [
  '#c8b89a','#f5f0e8','#8b7355','#2c2420',
  '#ef4444','#f59e0b','#3b82f6','#10b981',
  '#7c3aed','#ec4899','#0f766e','#92400e',
];

export default function XRObjectToolbarWindow() {
  const p         = new URLSearchParams(window.location.search);
  const id        = p.get('id') ?? '';
  const [color,      setColor]      = useState(p.get('color') ?? '#c8b89a');
  const [scale,      setScale]      = useState(1);
  const [emoji,      setEmoji]      = useState(p.get('emoji') ?? '📦');
  const [label,      setLabel]      = useState(p.get('label') ?? 'Object');
  const [showColors, setShowColors] = useState(false);
  const [gone,       setGone]       = useState(false);

  useEffect(() => {
    if (!id) return;
    return onToolbar(id, (msg: ToolbarMsg) => {
      if (msg.type === 'state') {
        setColor(msg.color); setScale(msg.scale);
        setEmoji(msg.emoji); setLabel(msg.label);
      }
      if (msg.type === 'close') {
        setGone(true);
        setTimeout(() => { try { window.close(); } catch {} }, 150);
      }
    });
  }, [id]);

  const send = (msg: ToolbarMsg) => postToolbar(id, msg);

  if (gone) return (
    <div enable-xr style={{ width:'100%',height:'100%',display:'flex',
      alignItems:'center',justifyContent:'center',background:'transparent' }}>
      <span style={{ fontSize:'1.2rem',opacity:0.25 }}>✓</span>
    </div>
  );

  return (
    <div enable-xr style={{
      width:'100%', height:'100%', display:'flex', flexDirection:'column',
      alignItems:'center', padding:'0.7rem 0.55rem 0.6rem', gap:'0.38rem',
      background:'rgba(8,8,20,0.94)', backdropFilter:'blur(32px)',
      borderRadius:18, border:'1px solid rgba(255,255,255,0.09)',
      boxSizing:'border-box', overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{ textAlign:'center', width:'100%', lineHeight:1 }}>
        <div style={{ fontSize:'1.4rem' }}>{emoji}</div>
        <div style={{ fontSize:'0.57rem', fontWeight:700, color:'rgba(255,255,255,0.45)',
          textTransform:'uppercase', letterSpacing:'0.07em', marginTop:3,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
        <div style={{ width:11, height:11, borderRadius:'50%', background:color,
          margin:'4px auto 0', border:'1.5px solid rgba(255,255,255,0.22)' }} />
      </div>

      <hr style={{ width:'88%', border:'none', borderTop:'1px solid rgba(255,255,255,0.07)', margin:0 }} />

      {/* Scale row */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', width:'88%' }}>
        <button onClick={() => send({ type:'scale', delta:-0.2 })} style={S()}>−</button>
        <div style={{ flex:1, textAlign:'center', fontSize:'0.58rem',
          color:'rgba(255,255,255,0.42)', fontWeight:600 }}>{scale.toFixed(1)}×</div>
        <button onClick={() => send({ type:'scale', delta:0.2 })} style={S()}>+</button>
      </div>

      {/* Colour */}
      <button onClick={() => setShowColors(v=>!v)} style={S(showColors,'88%')}>
        <span style={{ marginRight:'0.25rem' }}>🎨</span>
        <span style={{ fontSize:'0.58rem' }}>Colour</span>
      </button>
      {showColors && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, width:'88%' }}>
          {PALETTE.map(c => (
            <button key={c} onClick={() => { send({ type:'color', color:c }); setShowColors(false); }}
              style={{ aspectRatio:'1', borderRadius:'50%', background:c, cursor:'pointer', padding:0,
                border: c===color ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.13)' }} />
          ))}
        </div>
      )}

      {/* Duplicate */}
      <button onClick={() => send({ type:'duplicate' })} style={S(false,'88%')}>
        <span style={{ marginRight:'0.25rem' }}>⧉</span>
        <span style={{ fontSize:'0.58rem' }}>Duplicate</span>
      </button>

      <div style={{ flex:1 }} />

      {/* Delete */}
      <button onClick={() => send({ type:'delete' })} style={S(false,'88%',true)}>
        <span style={{ marginRight:'0.25rem' }}>🗑</span>
        <span style={{ fontSize:'0.58rem' }}>Delete</span>
      </button>
    </div>
  );
}

function S(active=false, width: string|number='auto', danger=false): React.CSSProperties {
  return {
    width, padding:'0.36rem 0', borderRadius:10, flexShrink:0, cursor:'pointer',
    border:`1px solid ${danger?'rgba(239,68,68,0.42)':active?'rgba(99,102,241,0.6)':'rgba(255,255,255,0.1)'}`,
    background: danger?'rgba(239,68,68,0.13)':active?'rgba(99,102,241,0.22)':'rgba(255,255,255,0.05)',
    color: danger?'#fca5a5':'#fff', fontSize:'0.82rem',
    display:'flex', alignItems:'center', justifyContent:'center',
  };
}