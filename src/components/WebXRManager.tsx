// components/WebXRManager.tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { sceneStore } from '../sceneStore';

export function WebXRManager() {
  const containerRef = useRef<HTMLDivElement>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const objectsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    
    const init = async () => {
      // Setup Three.js
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x111111);
      
      camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(containerRef.current!.clientWidth, containerRef.current!.clientHeight);
      renderer.xr.enabled = true;
      containerRef.current!.appendChild(renderer.domElement);
      
      // Add lights
      const ambientLight = new THREE.AmbientLight(0x404040);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(1, 2, 1);
      scene.add(dirLight);
      
      // Add grid helper
      const gridHelper = new THREE.GridHelper(10, 20, 0x888888, 0x444444);
      scene.add(gridHelper);
      
      // Start XR session
      if (navigator.xr) {
        try {
          const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor'],
          });
          xrSessionRef.current = session;
          renderer.xr.setSession(session);
          
          session.addEventListener('end', () => {
            xrSessionRef.current = null;
          });
          
          // Animation loop
          renderer.setAnimationLoop((timestamp, frame) => {
            renderer.render(scene, camera);
          });
          
          console.log('✅ WebXR session started');
        } catch (err) {
          console.error('Failed to start XR session:', err);
        }
      }
      
      // Listen for objects from sceneStore
      sceneStore.subscribe((objects) => {
        objects.forEach(obj => {
          if (!objectsRef.current.has(obj.id)) {
            // Create mesh
            let geometry;
            switch (obj.type) {
              case 'sphere': geometry = new THREE.SphereGeometry(0.35, 32, 32); break;
              case 'cone': geometry = new THREE.ConeGeometry(0.3, 0.8, 32); break;
              default: geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            }
            const material = new THREE.MeshStandardMaterial({ color: obj.color });
            const mesh = new THREE.Mesh(geometry, material);
            objectsRef.current.set(obj.id, mesh);
            scene.add(mesh);
          }
          
          const mesh = objectsRef.current.get(obj.id);
          if (mesh) {
            mesh.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
            mesh.rotation.set(obj.transform.rotation.x, obj.transform.rotation.y, obj.transform.rotation.z);
            mesh.scale.set(obj.transform.scale.x, obj.transform.scale.y, obj.transform.scale.z);
          }
        });
        
        // Remove objects no longer in store
        objectsRef.current.forEach((mesh, id) => {
          if (!objects.find(o => o.id === id)) {
            scene.remove(mesh);
            objectsRef.current.delete(id);
          }
        });
      });
    };
    
    init();
    
    return () => {
      xrSessionRef.current?.end();
      renderer?.dispose();
    };
  }, []);
  
  return <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />;
}