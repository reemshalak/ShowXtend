/**
 * FloatingAssistantStandalone.tsx
 * Standalone window version - opens as separate spatial window in XR
 */

import FloatingAssistant from '../FloatingAssistant';
import { useEffect, useState } from 'react';
import { initScene } from '@webspatial/react-sdk';
import { isXRMode } from '../xrMode';
import { getSession } from '../collaboration';

const CALL_CHANNEL = 'call-channel';

export default function FloatingAssistantStandalone() {
  const [isCallActive, setIsCallActive] = useState(false);

  // Listen for call state from main window
  useEffect(() => {
    const ch = new BroadcastChannel(CALL_CHANNEL);
    ch.onmessage = (e) => {
      if (e.data?.type === 'call_active') {
        setIsCallActive(e.data.active);
      }
      if (e.data?.type === 'open_collab') {
        // Forward to main window
        const mainCh = new BroadcastChannel(CALL_CHANNEL);
        mainCh.postMessage({ type: 'open_collab' });
        mainCh.close();
      }
    };
    return () => ch.close();
  }, []);

  // Check initial call state
  useEffect(() => {
    setIsCallActive(!!getSession());
  }, []);



  const handleOpenCall = () => {
    const ch = new BroadcastChannel(CALL_CHANNEL);
    ch.postMessage({ type: 'open_collab' });
    ch.close();
  };

  return (
   <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <FloatingAssistant 
        onOpenCall={handleOpenCall} 
        isCallActive={isCallActive} 
      />
     
    </div>
  );
}