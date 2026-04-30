/**
 * RightPanel — Assistant card + delivery info.
 * Clicking Sheri opens the AI assistant panel.
 * "Join Session" button opens the collab lobby.
 */

interface RightPanelProps {
  onAssistantClick?: () => void;
  onCollabClick?: () => void;
}

export default function RightPanel({ onAssistantClick, onCollabClick }: RightPanelProps = {}) {
  return (
    <div enable-xr className="spatial-panel right-panel">

      {/* Assistant card — clickable to open AI assistant */}
      <div
        className="assistant-card"
        style={{ cursor: onAssistantClick ? 'pointer' : 'default' }}
        onClick={onAssistantClick}
        title="Chat with Sheri"
      >
        <p className="assistant-prompt">Ask her anything about the product</p>
        <div className="assistant-avatar">👩‍💼</div>
        <h4 className="assistant-name">Sheri Nalls</h4>
        <p className="assistant-role">Customer service · AI</p>
      </div>

      {/* Warranty info card */}
      <div className="info-card">
        <span className="info-card-text">You have 10 year limited warranty</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1rem' }}>+</span>
      </div>

      {/* Delivery options */}
      <div className="spatial-panel" style={{ padding: '1rem', borderRadius: '14px' }}>
        <p className="delivery-section-title">How to get it</p>
        <div className="delivery-options">
          <div className="delivery-row">
            <span className="delivery-icon">🚚</span>
            <div className="delivery-info">
              <div className="delivery-label">Delivery</div>
              <div className="delivery-sub">Check delivery availability</div>
            </div>
            <span className="delivery-arrow">›</span>
          </div>
          <div className="delivery-row">
            <span className="delivery-icon">🏪</span>
            <div className="delivery-info">
              <div className="delivery-label">In store</div>
              <div className="delivery-sub">Check in-store stock</div>
            </div>
            <span className="delivery-arrow">›</span>
          </div>
        </div>
      </div>

      {/* Join spatial session */}
      {onCollabClick && (
        <button
          className="collab-create-btn"
          onClick={onCollabClick}
          style={{ marginTop: '0.25rem', fontSize: '0.82rem', padding: '0.6rem' }}
        >
          👥 Join shared session
        </button>
      )}

    </div>
  );
}
