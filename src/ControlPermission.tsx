import { useEffect, useState } from 'react';
import { getSession } from './collaboration';

interface ControlPermissionProps {
  onControlGranted: () => void;
  onControlRevoked: () => void;
}

export function useControlPermission({ onControlGranted, onControlRevoked }: ControlPermissionProps) {
  const [hasControl, setHasControl] = useState(false);
  const [controlRequestedBy, setControlRequestedBy] = useState<string | null>(null);
  const session = getSession();

  useEffect(() => {
    if (!session) return;

    const unsubscribe = session.onEvent((event, fromId) => {
      console.log('🎮 Control event:', event.type, 'from:', fromId);
      
      if (event.type === 'request_control') {
        setControlRequestedBy(event.fromName);
        const allow = confirm(`${event.fromName} wants to control your experience. Allow?`);
        if (allow) {
          console.log('🎮 Granting control to:', fromId);
          session.send({ type: 'control_granted', grantedTo: fromId });
          setControlRequestedBy(null);
        }
      }
      
      if (event.type === 'control_granted' && event.grantedTo === session.participantId) {
        console.log('✅ I HAVE BEEN GRANTED CONTROL');
        setHasControl(true);
        onControlGranted();
      }
      
      if (event.type === 'control_revoked') {
        console.log('❌ CONTROL REVOKED');
        setHasControl(false);
        onControlRevoked();
      }
    });

    return unsubscribe;
  }, [session, onControlGranted, onControlRevoked]);

  const requestControl = () => {
    if (!session) return;
    console.log('📞 Requesting control...');
    session.send({ 
      type: 'request_control', 
      fromName: session.currentName, 
      fromId: session.participantId 
    });
  };

  const revokeControl = () => {
    if (!session) return;
    console.log('📞 Revoking control...');
    session.send({ type: 'control_revoked' });
    setHasControl(false);
    onControlRevoked();
  };

  return { hasControl, controlRequestedBy, requestControl, revokeControl };
}