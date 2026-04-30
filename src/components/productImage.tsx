// components/ProductImage.tsx
import { useEffect, useState, useRef } from 'react';
import { getImageUrl } from '../lib/imageHelper';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}

// Cache processed images to avoid reprocessing
const imageCache = new Map<string, string>();

export function ProductImage({ src, alt, className, style }: ProductImageProps) {
  const [processedSrc, setProcessedSrc] = useState('');
  const [error, setError] = useState(false);
  const [isWhiteProduct, setIsWhiteProduct] = useState(false);
  const isProcessing = useRef(false);
  
  const proxiedSrc = getImageUrl(src);

  useEffect(() => {
    if (!proxiedSrc) {
      setError(true);
      return;
    }

    // Check cache first
    if (imageCache.has(proxiedSrc)) {
      setProcessedSrc(imageCache.get(proxiedSrc)!);
      return;
    }

    if (isProcessing.current) return;
    isProcessing.current = true;

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Analyze if product is mostly white
      let whiteCount = 0;
      let totalPixels = data.length / 4;
      
      // Make white/light pixels transparent
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        
        // Count white-ish pixels (background)
        if (r > 240 && g > 240 && b > 240) {
          data[i+3] = 0; // Make transparent
          whiteCount++;
        }
      }
      
      // If more than 30% of image is white, it's likely a white product
      const whitePercentage = (whiteCount / totalPixels) * 100;
      
      ctx.putImageData(imageData, 0, 0);
      const resultUrl = canvas.toDataURL();
      
      // Cache anyway
      imageCache.set(proxiedSrc, resultUrl);
      setProcessedSrc(resultUrl);
      setIsWhiteProduct(whitePercentage > 30);
      isProcessing.current = false;
    };
    img.onerror = () => {
      setError(true);
      isProcessing.current = false;
    };
    img.src = proxiedSrc;
  }, [proxiedSrc]);

  if (!proxiedSrc || error) {
    return <span className={className} style={style}>🪑</span>;
  }

  if (processedSrc) {
    return (
      <img
        src={processedSrc}
        alt={alt}
        className={className}
        style={{
          ...style,
          // For white products, add a subtle border and shadow so they're visible
          ...(isWhiteProduct && {
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
            // backgroundColor: '#2a2a2a',
          }),
        }}
      />
    );
  }

  // Show nothing while loading (no spinner)
  return null;
}




// import { useEffect, useState, useRef } from 'react';
// import { getImageUrl } from '../lib/imageHelper';

// const imageCache = new Map<string, { src: string; isWhite: boolean }>();
// interface ProductImageProps {
//   src?: string;
//   alt: string;
//   className?: string;
//   style?: React.CSSProperties;
// }

// export function ProductImage({ src, alt, className, style }: ProductImageProps) {
//   const [processed, setProcessed] = useState<{ src: string; isWhite: boolean } | null>(null);
//   const [error, setError] = useState(false);
//   const isProcessing = useRef(false);
//   const proxiedSrc = getImageUrl(src);

//   useEffect(() => {
//     if (!proxiedSrc) { setError(true); return; }
//     if (imageCache.has(proxiedSrc)) {
//       setProcessed(imageCache.get(proxiedSrc)!);
//       return;
//     }
//     if (isProcessing.current) return;

//     isProcessing.current = true;
//     const img = new Image();
//     img.crossOrigin = 'Anonymous';
    
//     img.onload = () => {
//       const canvas = document.createElement('canvas');
//       canvas.width = img.width;
//       canvas.height = img.height;
//       const ctx = canvas.getContext('2d')!;
//       ctx.drawImage(img, 0, 0);
      
//       const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
//       // Initialize Worker
//       const worker = new Worker(new URL('./imageProcessor.worker.ts', import.meta.url));
      
//       worker.postMessage({ 
//         imageData, 
//         width: canvas.width, 
//         height: canvas.height 
//       }, [imageData.data.buffer]);

//       worker.onmessage = (e) => {
//         const { imageData: processedData, isWhite } = e.data;
//         ctx.putImageData(processedData, 0, 0);
//         const result = { src: canvas.toDataURL(), isWhite };
        
//         imageCache.set(proxiedSrc, result);
//         setProcessed(result);
//         isProcessing.current = false;
//         worker.terminate();
//       };
//     };

//     img.onerror = () => { setError(true); isProcessing.current = false; };
//     img.src = proxiedSrc;
//   }, [proxiedSrc]);

//   if (error) return <span className={className} style={style}>🪑</span>;
//   if (!processed) return null;

//   return (
//     <img
//       src={processed.src}
//       alt={alt}
//       className={className}
//       style={{
//         ...style,
//         ...(processed.isWhite && {
//           filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
//           backgroundColor: '#1a1a1a',
//           borderRadius: '8px'
//         }),
//       }}
//     />
//   );
// }