// src/hooks/useRemoteAction.ts
import { useEffect } from 'react';
import { getSession } from '../collaboration';

export function useRemoteAction(callback: (action: string, data: any) => void) {
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    const unsubscribe = session.onEvent((event, fromId) => {
      if ((event as any).type === 'control_action') {
        const { action, data } = event as any;
        console.log('📡 Remote action received:', action, data);
        callback(action, data);
      }
    });

    return unsubscribe;
  }, [callback]);
}