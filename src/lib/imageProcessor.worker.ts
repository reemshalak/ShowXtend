// imageProcessor.worker.ts
self.onmessage = (e) => {
  const { imageData, width, height } = e.data;
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const queue: number[] = []; // Store indices for speed

  // Add edge pixels
  for (let x = 0; x < width; x++) {
    queue.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    queue.push(y * width, y * width + (width - 1));
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    if (visited[idx]) continue;

    const pixelIdx = idx * 4;
    if (data[pixelIdx] > 240 && data[pixelIdx + 1] > 240 && data[pixelIdx + 2] > 240) {
      visited[idx] = 1;
      data[pixelIdx + 3] = 0;

      const x = idx % width;
      const y = Math.floor(idx / width);

      if (x > 0) queue.push(idx - 1);
      if (x < width - 1) queue.push(idx + 1);
      if (y > 0) queue.push(idx - width);
      if (y < height - 1) queue.push(idx + width);
    }
  }

  // Detect white product on the remaining pixels
  let productWhite = 0, totalProduct = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      totalProduct++;
      if (data[i] > 220 && data[i+1] > 220 && data[i+2] > 220) productWhite++;
    }
  }

 (self as any).postMessage({ 
  imageData, 
  isWhite: (productWhite / totalProduct) > 0.4 
}, [imageData.data.buffer]);
};