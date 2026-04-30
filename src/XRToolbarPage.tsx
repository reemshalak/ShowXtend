// src/XRToolbarPage.tsx
import { useEffect, useState } from 'react';
import { getSession } from './collaboration';

export default function XRToolbarPage() {
  const [hasControl, setHasControl] = useState(false);

  useEffect(() => {
    const check = setInterval(() => {
      const session = getSession();
      if (!session) return;
      const unsub = session.onEvent((event) => {
        if (event.type === 'control_granted' && event.grantedTo === session.participantId) {
          setHasControl(true);
        }
        if (event.type === 'control_revoked') setHasControl(false);
      });
      clearInterval(check);
      return unsub;
    }, 500);
    return () => clearInterval(check);
  }, []);

  const openCall = () => {
    window.open('/collab', 'catalog-collab');
  };

  const openAssistant = () => {
  //  window.open('/assistant', 'catalog-assistant');
  };

  return (
    <div className="xr-toolbar-window">
      <div className="xr-toolbar-buttons">
        <button className="xr-toolbar-btn" onClick={openCall} title="Join Call">
          📞
        </button>
        <button className="xr-toolbar-btn" onClick={openAssistant} title="AI Assistant">
          👩‍💼
        </button>
      </div>
      {hasControl && (
        <div className="xr-toolbar-badge">
          🎮 Control active
        </div>
      )}
    </div>
  );
}