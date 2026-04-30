/**
 * RightPanelPage — Standalone XR scene for the right assistant panel.
 *
 * Opened by CenterPanelPage via window.open('/panel-right').
 * Broadcasts assistant/collab clicks via control_action when user has control.
 */

import { useEffect, useState } from 'react';
import RightPanel from './RightPanel';
import { getSession } from './collaboration';

const ASSISTANT_WINDOW = 'catalog-assistant';
const COLLAB_WINDOW = 'catalog-collab';

export default function RightPanelPage() {
  const [hasControl, setHasControl] = useState(false);

  // Attach control listener for XR mode
  useEffect(() => {
    const checkSession = setInterval(() => {
      const session = getSession();
      if (session) {
        console.log('🎮 RightPanel: Session found, attaching listener');
        
        const unsubscribe = session.onEvent((event, fromId) => {
          console.log('📡 RightPanel event:', event.type);
          
          if (event.type === 'control_granted' && event.grantedTo === session.participantId) {
            console.log('✅ RightPanel: I have control!');
            setHasControl(true);
          }
          
          if (event.type === 'control_revoked') {
            console.log('❌ RightPanel: Control revoked');
            setHasControl(false);
          }
        });
        
        clearInterval(checkSession);
        return unsubscribe;
      }
    }, 500);
    
    return () => clearInterval(checkSession);
  }, []);

  const handleAssistantClick = () => {
    // Open assistant window
    window.open('/assistant', ASSISTANT_WINDOW);
    
    // Broadcast if user has control
    const session = getSession();
    if (hasControl && session) {
      console.log('📤 RightPanel: Broadcasting open_assistant');
      session.send({ type: 'control_action', action: 'open_assistant' } as any);
    }
  };

  const handleCollabClick = () => {
    // Open collab window
    window.open('/collab', COLLAB_WINDOW);
    
    // Broadcast if user has control
    const session = getSession();
    if (hasControl && session) {
      console.log('📤 RightPanel: Broadcasting open_collab');
      session.send({ type: 'control_action', action: 'open_collab' } as any);
    }
  };

  return (
    <div className="xr-single-panel-root">
      <RightPanel 
        onAssistantClick={handleAssistantClick}
        onCollabClick={handleCollabClick}
      />
    </div>
  );
}