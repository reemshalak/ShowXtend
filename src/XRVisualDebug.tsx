// components/XRVisualDebug.tsx
import { useEffect, useState } from 'react';

export function XRVisualDebug() {
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [dragStatus, setDragStatus] = useState<string>('No drag yet');
  
  useEffect(() => {
    const info: string[] = [];
    
    info.push(`🔍 XR Debug @ ${new Date().toLocaleTimeString()}`);
    
    // @ts-ignore
    if (window.xrScene) info.push('✅ window.xrScene found');
    else info.push('❌ window.xrScene missing');
    
    // @ts-ignore
    if (window.spatialScene) info.push('✅ window.spatialScene found');
    else info.push('❌ window.spatialScene missing');
    
    if (navigator.xr) info.push('✅ navigator.xr supported');
    else info.push('❌ navigator.xr missing');
    
    setDebugInfo(info);
    
    // Listen for custom drag events from your components
    const handleDragEvent = (e: CustomEvent) => {
      setDragStatus(`${e.detail.action}: ${e.detail.message || ''}`);
      setTimeout(() => {
        if (e.detail.action !== 'DRAG_END') {
          // Keep status for 2 seconds then revert
          setTimeout(() => setDragStatus('Ready'), 2000);
        }
      }, 2000);
    };
    
    window.addEventListener('xr-drag-event' as any, handleDragEvent);
    return () => window.removeEventListener('xr-drag-event' as any, handleDragEvent);
  }, []);
  
  return (
    <div style={{
      position: 'fixed',
      top: 10,
      left: 10,
      right: 10,
      background: 'rgba(0,0,0,0.85)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '11px',
      padding: '10px',
      borderRadius: '8px',
      zIndex: 9999,
      pointerEvents: 'none',
      border: '1px solid #0f0',
      backdropFilter: 'blur(4px)',
    }}>
      {debugInfo.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
      <div style={{ 
        marginTop: '8px', 
        paddingTop: '6px', 
        borderTop: '1px solid #333',
        color: dragStatus.includes('DRAG') ? '#ff0' : '#0f0'
      }}>
        🖱️ {dragStatus}
      </div>
      <div style={{ fontSize: '9px', color: '#888', marginTop: '6px' }}>
        Tap object → Drag to move
      </div>
    </div>
  );
}

// Helper function to dispatch drag events from your components
export function dispatchDragEvent(action: string, message?: string) {
  window.dispatchEvent(new CustomEvent('xr-drag-event', { 
    detail: { action, message } 
  }));
}
