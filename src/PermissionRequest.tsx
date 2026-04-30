// PermissionRequest.tsx

import { useEffect, useState } from 'react';

export function PermissionRequest({ onGranted }: { onGranted: () => void }) {
  const [status, setStatus] = useState<'checking' | 'requesting' | 'granted' | 'denied'>('checking');

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(d => d.kind === 'videoinput');
      const hasMic = devices.some(d => d.kind === 'audioinput');
      
      if (hasCamera && hasMic) {
        setStatus('granted');
        onGranted();
      } else {
        setStatus('requesting');
      }
    } catch (err) {
      setStatus('requesting');
    }
  };

  const requestPermissions = async () => {
    try {
      // This will trigger the permission prompt on Pico
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      stream.getTracks().forEach(track => track.stop());
      setStatus('granted');
      onGranted();
    } catch (err) {
      setStatus('denied');
    }
  };

  if (status === 'granted') return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center">
      <div className="spatial-panel p-6 max-w-sm text-center">
        <div className="text-6xl mb-4">🎥</div>
        <h3 className="text-xl font-bold mb-2">Camera & Microphone Required</h3>
        <p className="text-white/60 text-sm mb-6">
          PICO needs camera access for video calls
        </p>
        <button
          onClick={requestPermissions}
          className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-full font-bold transition"
        >
          Allow Camera Access
        </button>
      </div>
    </div>
  );
}