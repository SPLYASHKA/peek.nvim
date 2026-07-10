import { pdfRectToCanvas } from './pdf-cord.ts';

// Lazy load PDF.js at runtime to avoid build issues
let pdfjsLib: any = null;
let pdfJsLoading: Promise<any> | null = null;

async function ensurePdfJsLoaded() {
  if (pdfjsLib) return pdfjsLib;

  if (pdfJsLoading) {
    return await pdfJsLoading;
  }

  pdfJsLoading = (async () => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
    script.type = 'module';

    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // @ts-ignore
    pdfjsLib = window.pdfjsLib;

    if (!pdfjsLib) {
      throw new Error('PDF.js failed to load');
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    return pdfjsLib;
  })();

  return await pdfJsLoading;
}

const pdfCache = new Map<string, Promise<any>>();
let pdfVaultMap: Record<string, string[]> | null = null;

export function setPdfMap(map: Record<string, string[]>) {
  pdfVaultMap = map;
}

async function getPdfDocument(url: string) {
  if (pdfCache.has(url)) {
    return pdfCache.get(url);
  }

  const lib = await ensurePdfJsLoaded();

  const loadingTask = lib.getDocument({
    url: url,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdfPromise = loadingTask.promise;
  pdfCache.set(url, pdfPromise);

  return pdfPromise;
}

function resolvePdfUrlVault(pdfName: string): string {
  if (!pdfVaultMap) return pdfName;

  const paths = pdfVaultMap[pdfName];
  if (!paths || paths.length === 0) return pdfName;

  return paths[0];
}

function resolvePdfUrl(pdfUrl: string): string {
  if (
    pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://') || pdfUrl.startsWith('file://')
  ) {
    return pdfUrl;
  }

  const base = document.getElementById('peek-base') as HTMLBaseElement;

  if (base && base.href) {
    const baseUrl = new URL(base.href);
    const resolvedUrl = new URL(pdfUrl, baseUrl);
    return resolvedUrl.href;
  }

  return pdfUrl;
}

interface RectCoords {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const MIN_DISPLAY_WIDTH = 300;
const MIN_DISPLAY_HEIGHT = 300;

async function renderPdfCrop(
  pdfUrl: string,
  pageNum: number,
  rectCords: RectCoords,
  scale = 1,
  flipY = true,
): Promise<HTMLCanvasElement> {
  const { x1, y1, x2, y2 } = rectCords;

  const pdf = await getPdfDocument(pdfUrl);
  const page = await pdf.getPage(pageNum);

  const viewport = page.getViewport({ scale: scale });
  const rect = pdfRectToCanvas(page, x1, y1, x2, y2, scale, flipY);

  const canvas = document.createElement('canvas');
  canvas.width = rect.cropWidth;
  canvas.height = rect.cropHeight;
  canvas.classList.add('pdf-crop-canvas');

  const ctx = canvas.getContext('2d');

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
    transform: [1, 0, 0, 1, -rect.cropX, -rect.cropY],
  };

  await page.render(renderContext).promise;

  return canvas;
}

async function renderPdfCropElement(pdfContainer: HTMLElement, scale = 1): Promise<void> {
  if (pdfContainer.dataset.rendered === 'true' || pdfContainer.dataset.rendering === 'true') {
    return;
  }

  if (pdfContainer.querySelector('.pdf-crop-canvas')) {
    pdfContainer.dataset.rendered = 'true';
    return;
  }

  pdfContainer.dataset.rendering = 'true';

  const pdfUrl = pdfContainer.dataset.pdfUrl;
  const pageNum = parseInt(pdfContainer.dataset.pageNum || '1', 10);
  const rectData = pdfContainer.dataset.rect;

  if (!pdfUrl || !rectData) {
    pdfContainer.dataset.rendering = 'false';
    return;
  }

  const inVaultUrl = resolvePdfUrlVault(pdfUrl);
  const resolvedUrl = resolvePdfUrl(inVaultUrl);

  const href = `${resolvedUrl}#page=${pageNum}`;
  pdfContainer.style.cursor = 'pointer';
  pdfContainer.addEventListener('click', () => {
    window.open(href, '_blank');
  });

  try {
    const rectCords: RectCoords = JSON.parse(rectData);
    const adaptedScale = adaptScale(rectCords, scale);
    const canvas = await renderPdfCrop(resolvedUrl, pageNum, rectCords, adaptedScale);

    if (!pdfContainer.querySelector('.pdf-crop-canvas')) {
      pdfContainer.appendChild(canvas);
    }

    pdfContainer.dataset.rendered = 'true';
    pdfContainer.dataset.rendering = 'false';
  } catch (err) {
    pdfContainer.textContent = `Error loading PDF: ${
      err instanceof Error ? err.message : 'Unknown error'
    }`;
    pdfContainer.dataset.rendering = 'false';
  }
}

function adaptScale(rectCords, scale) {
  const cropWidth = Math.abs(rectCords.x2 - rectCords.x1);
  const cropHeight = Math.abs(rectCords.y2 - rectCords.y1);

  const scaleX = MIN_DISPLAY_WIDTH / cropWidth;
  const scaleY = MIN_DISPLAY_HEIGHT / cropHeight;

  return Math.max(scale, scaleX, scaleY);
}

export function initPdfRenderer(): void {
  document.querySelectorAll('.pdf-crop').forEach((el) => {
    renderPdfCropElement(el as HTMLElement);
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && (node as HTMLElement).classList.contains('pdf-crop')) {
            renderPdfCropElement(node as HTMLElement);
          }
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

export function getPdfMorphdomOptions() {
  return {
    onBeforeElChildrenUpdated(_fromEl: HTMLElement, toEl: HTMLElement): boolean {
      if (toEl.classList.contains('pdf-crop') && toEl.dataset.rendered === 'true') {
        return false;
      }
      return true;
    },
    onNodeAdded(node: Node): Node {
      if (node instanceof HTMLElement && node.classList.contains('pdf-crop')) {
        if (!node.dataset.rendered && !node.dataset.rendering) {
          renderPdfCropElement(node);
        }
      }
      return node;
    },
  };
}
