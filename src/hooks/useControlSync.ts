// src/hooks/useControlSync.ts
import { useEffect, useState } from 'react';
import { getSession } from '../collaboration';

export function useControlSync() {
  const [hasControl, setHasControl] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkSession = setInterval(() => {
      const session = getSession();
      if (session && !isReady) {
        console.log('🎮 useControlSync: Session found, attaching listener');
        setIsReady(true);
        
        const unsubscribe = session.onEvent((event, fromId) => {
          if (event.type === 'control_granted' && event.grantedTo === session.participantId) {
            console.log('✅ useControlSync: I have control!');
            setHasControl(true);
          }
          if (event.type === 'control_revoked') {
            console.log('❌ useControlSync: Control revoked');
            setHasControl(false);
          }
        });
        
        clearInterval(checkSession);
        return unsubscribe;
      }
    }, 500);
    
    return () => clearInterval(checkSession);
  }, [isReady]);

  return { hasControl };
}