/**
 * Converts PDF coordinates to canvas coordinates
 */
export function pdfRectToCanvas(
  page: any, 
  x1: number, 
  y1: number, 
  x2: number, 
  y2: number, 
  scale = 1, 
  flipY = true
) {
  // Get page height without scale
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  // Flip Y coordinates if needed (PDF origin is bottom-left)
  y1 = flipY ? (pageHeight - y1) : y1;
  y2 = flipY ? (pageHeight - y2) : y2;

  // Normalize coordinates
  const xMin = Math.min(x1, x2);
  const xMax = Math.max(x1, x2);
  const yMin = Math.min(y1, y2);
  const yMax = Math.max(y1, y2);

  const cropX = xMin * scale;
  const cropY = yMin * scale;
  const cropWidth = (xMax - xMin) * scale;
  const cropHeight = (yMax - yMin) * scale;

  return { cropX, cropY, cropWidth, cropHeight };
}
