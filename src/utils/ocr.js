/**
 * ocr.js — Local OCR engine (WeChat-style text extraction)
 *
 * Uses Tesseract.js (a pure-JS port of the Tesseract OCR engine) so that
 * "提取图片里的文字" runs entirely on-device without needing a multimodal
 * LLM or internet access at runtime.
 *
 * Languages: `chi_sim` (简体中文) + `eng` (英文) — matches WeChat's
 * default screenshot-OCR behavior for mixed CN/EN content.
 *
 * All Tesseract assets (worker, core WASM, traineddata) are bundled locally
 * in dist/tesseract/ and loaded via the custom app:// protocol relative to
 * the page. Using a direct Worker keeps everything same-origin and avoids
 * cross-origin importScripts issues.
 *
 * The worker is created lazily on first use and reused across calls so
 * subsequent extractions are fast (no re-download of the language model).
 */
import { createWorker } from 'tesseract.js';

let workerPromise = null;

/**
 * Lazily create (and cache) a Tesseract worker for chi_sim + eng.
 * @param {(progress:number,status:string)=>void} [onProgress]
 */
async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;

  // Load Tesseract assets via the app's custom protocol, relative to the
  // current page (app://index.html). Using a direct Worker (not a Blob URL)
  // keeps the worker origin the same as the page, so importScripts and fetch
  // for the core script, WASM and language data are all same-origin and
  // served with correct MIME types by the protocol handler.
  const tesseractBase = './tesseract';

  workerPromise = createWorker(['chi_sim', 'eng'], 1, {
    workerPath: `${tesseractBase}/worker.min.js`,
    corePath: tesseractBase,
    langPath: `${tesseractBase}/tessdata`,
    workerBlobURL: false,
    gzip: true,            // traineddata files are stored gzipped
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress(m.progress, m.status);
      }
    },
  }).then(async (worker) => {
    // Tweak recognition params for better mixed CN/EN accuracy.
    try {
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
    } catch (_) { /* non-fatal */ }
    return worker;
  }).catch((err) => {
    // Allow the next call to retry if creation failed.
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/**
 * Extract text from an image.
 *
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob} image - data URL / element / blob
 * @param {{onProgress?:(p:number,s:string)=>void}} [opts]
 * @returns {Promise<{text:string,confidence:number}>}
 */
export async function extractText(image, opts = {}) {
  const worker = await getWorker(opts.onProgress);
  const { data } = await worker.recognize(image);
  const text = (data?.text || '').trim();
  return { text, confidence: typeof data?.confidence === 'number' ? data.confidence : 0 };
}

/**
 * Terminate and clear the cached worker (e.g. on app teardown).
 */
export async function terminateOCR() {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch (_) { /* ignore */ }
  workerPromise = null;
}
