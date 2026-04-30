/**
 * PersistentNav — the left sidenav shown on ALL pages.
 * Rendered by BrowsePage and CenterPanelPage (catalog/place-it modes).
 * Styled as a centered pill floating on the left edge.
 */

interface NavItem {
  icon:    string;
  label:   string;
  onClick: () => void;
  badge?:  number;
  active?: boolean;
}

interface PersistentNavProps {
  cartCount:        number;
  wishlistCount:    number;
  activeMode:       'browse' | 'catalog' | 'place-it';
  isCallActive?:    boolean;
  onBrowse:         () => void;
  onOpenCart:       () => void;
  onOpenWishlist:   () => void;
  onOpenAssistant:  () => void;
  onOpenCollab:     () => void;
  onOpenLighting?:  () => void;
  onOpenLayouts?:   () => void;
  onBack?:          () => void;   // ← shown as first item when provided
}

export default function PersistentNav({
  cartCount, wishlistCount, activeMode, isCallActive,
  onBrowse, onOpenCart, onOpenWishlist, onOpenAssistant, onOpenCollab,
  onOpenLighting, onOpenLayouts, onBack,
}: PersistentNavProps) {

  const items: NavItem[] = [
    { icon:'⊞',  label:'Browse',   onClick: onBrowse,         active: activeMode==='browse' },
    { icon:'♡',  label:'Wishlist', onClick: onOpenWishlist,   badge: wishlistCount },
    { icon:'🛒', label:'Cart',     onClick: onOpenCart,       badge: cartCount },
    { icon:'💡', label:'Lighting', onClick: onOpenLighting ?? (()=>{}) },
    { icon:'🗂', label:'Layouts',  onClick: onOpenLayouts  ?? (()=>{}) },
  ];

  return (
    /* The spatial-panel class gives the frosted glass in XR.
       border-radius 28px gives the pill shape.
       position:sticky + top:50% + translateY(-50%) centers it vertically
       without stretching to fill the full height.                          */
    <div className="browse-sidenav spatial-panel" style={{
      /* Override the patched full-height rule — we want a centered pill */
      height:    'auto',
      alignSelf: 'center',
      position:  'sticky',
      top:       '50%',
      transform: 'translateY(-50%)',
      borderRadius: 28,
      padding:   '0.75rem 0',
      marginLeft: '1rem',
      border:    '1px solid rgba(255,255,255,0.12)',
    }}>
      {/* Back chevron — rendered first, only when onBack is provided */}
      {onBack && (
        <button
          className="sidenav-btn sidenav-btn--back"
          title="Back to Browse"
          onClick={onBack}
          style={{ position: 'relative' }}
        >
          <span className="sidenav-icon" style={{ fontSize: '1rem', lineHeight: 1 }}>
            {/* Chevron left SVG — same weight as sidenav icons */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      )}

      {/* Thin divider below back button */}
      {onBack && (
        <div style={{
          width: 28, height: 1,
          background: 'rgba(255,255,255,0.10)',
          borderRadius: 1,
          margin: '0.1rem auto',
          flexShrink: 0,
        }} />
      )}

      {items.map(item => (
        <button
          key={item.label}
          className={`sidenav-btn${item.active ? ' sidenav-btn--active' : ''}`}
          title={item.label}
          onClick={item.onClick}
          style={{ position:'relative' }}
        >
          <span className="sidenav-icon">{item.icon}</span>
          {item.active && item.label==='Browse' && <div className="sidenav-dot" />}
          {(item.badge??0)>0 && (
            <span style={{
              position:'absolute', top:2, right:2,
              minWidth:16, height:16, borderRadius:8,
              background:'#ef4444', color:'#fff',
              fontSize:'0.55rem', fontWeight:800,
              display:'flex', alignItems:'center', justifyContent:'center',
              padding:'0 3px', border:'1.5px solid rgba(0,0,0,0.4)',
            }}>{item.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}