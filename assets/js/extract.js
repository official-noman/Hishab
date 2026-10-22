/* =========================================================
   Hishab — read statement files on the phone
   • CSV / TXT: plain text
   • PDF: text layer, with OCR fallback for scanned pages
   • Photos / screenshots: on-device OCR (English + Bangla)
   Nothing is uploaded. OCR runs locally with Tesseract.js.
   ========================================================= */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 12;
export const MAX_PDF_OCR_PAGES = 8;
const MAX_PDF_PAGES = 60;
const MAX_TEXT = 2_500_000;

const VENDOR = new URL('../vendor/', import.meta.url);
const IMAGE_RX = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;

export class ExtractError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.name = 'ExtractError';
    this.code = code;
    this.detail = detail;
  }
}

export function fileKind(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || IMAGE_RX.test(name)) return 'image';
  if (type.includes('csv') || /\.(csv|tsv)$/.test(name)) return 'csv';
  if (type.startsWith('text/') || /\.(txt|text|log)$/.test(name)) return 'text';
  return 'unknown';
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fix the small, predictable mistakes OCR makes around statements. */
export function cleanOcrText(input) {
  return String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|¦]/g, ' ')
    .replace(/\u000c/g, '\n')
    .replace(/\b(?:page|পৃষ্ঠা)\s*\d+\s*(?:of|\/)\s*\d+\b/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Read one file and return { text, kind, pages?, warnings[] }. */
export async function extractFile(file, onProgress = () => {}) {
  const kind = fileKind(file);
  if (kind === 'unknown') throw new ExtractError('unsupported');
  if (!file || !file.size) throw new ExtractError('empty');
  if (file.size > MAX_FILE_BYTES) throw new ExtractError('too-large');

  if (kind === 'csv' || kind === 'text') {
    onProgress(20, 'Reading file…');
    let text = await file.text();
    text = text.replace(/^\uFEFF/, '');
    onProgress(100, 'Text ready');
    return { text, kind, pages: 0, warnings: [] };
  }
  if (kind === 'pdf') return extractPdf(file, onProgress);
  return extractImage(file, onProgress);
}

/* ------------------------------ PDF ------------------------------ */
let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdf.min.mjs').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', VENDOR).href;
      return mod;
    });
  }
  return pdfjsPromise;
}

function itemsToWords(items) {
  const words = [];
  for (const item of items || []) {
    const text = String(item?.str || '').trim();
    if (!text) continue;
    const tr = item.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(tr[4]) || 0;
    const y = Number(tr[5]) || 0;
    const w = Number(item.width) || 0;
    const h = Number(item.height) || 10;
    words.push({
      text,
      x,
      y,
      w,
      h,
      left: x,
      top: y,
      right: x + w,
      height: h,
    });
  }
  return words;
}

function itemsToLines(items) {
  const lines = [];
  for (const item of items || []) {
    const str = String(item?.str || '');
    if (!str.trim()) continue;
    const tr = item.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(tr[4]) || 0;
    const y = Number(tr[5]) || 0;
    let line = lines.find((l) => Math.abs(l.y - y) <= 2.5);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, str });
    if (item.hasEOL && line.parts.length) line.break = true;
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n');
}

async function extractPdf(file, onProgress) {
  onProgress(4, 'Opening PDF…');
  const pdfjs = await loadPdfjs();
  let data;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new ExtractError('read');
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
  } catch (err) {
    const msg = `${err?.name || ''} ${err?.message || ''}`;
    throw new ExtractError(/password/i.test(msg) ? 'password' : 'pdf');
  }

  const warnings = [];
  let text = '';
  const layoutPages = [];
  const pagesToRead = Math.min(doc.numPages, MAX_PDF_PAGES);
  try {
    for (let pageNo = 1; pageNo <= pagesToRead; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const pageText = itemsToLines(content.items);
      if (pageText) text += `${pageText}\n`;
      const viewport = page.getViewport({ scale: 1 });
      // PDF text coordinates grow upwards; normalize every page to top-down
      // screen coordinates so the table parser can use one row model.
      const words = itemsToWords(content.items).map((word) => ({
        ...word,
        y: viewport.height - word.y,
        top: viewport.height - word.y - word.h,
      }));
      if (words.length) {
        layoutPages.push({ page: pageNo, width: viewport.width, height: viewport.height, words });
      }
      onProgress(6 + Math.round((pageNo / pagesToRead) * 48), `Reading PDF page ${pageNo} of ${pagesToRead}…`);
      page.cleanup?.();
    }
    if (doc.numPages > pagesToRead) warnings.push('pdf-pages-limited');
  } finally {
    /* keep the document open for the OCR fallback below */
  }

  const dense = text.replace(/\s+/g, '');
  if (dense.length >= 40) {
    await doc.destroy?.();
    if (text.length > MAX_TEXT) {
      warnings.push('text-truncated');
      text = text.slice(0, MAX_TEXT);
    }
    onProgress(100, 'PDF text ready');
    return { text, kind: 'pdf', pages: doc.numPages, warnings, layout: { pages: layoutPages } };
  }

  // No usable text layer — treat the pages as scanned images and OCR them.
  const ocrPages = Math.min(doc.numPages, MAX_PDF_OCR_PAGES);
  if (doc.numPages > ocrPages) warnings.push('ocr-pages-limited');
  let ocrText = '';
  const ocrLayoutPages = [];
  try {
    for (let pageNo = 1; pageNo <= ocrPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.6, Math.max(1.7, 1800 / base.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;
      const pageResult = await ocrCanvasDetailed(canvas, (pct) => {
        const overall = 55 + Math.round(((pageNo - 1 + pct / 100) / ocrPages) * 44);
        onProgress(overall, `Reading scanned page ${pageNo} of ${ocrPages} — ${pct}%`);
      }, { tile: false });
      if (pageResult.text) ocrText += `${pageResult.text}\n`;
      if (pageResult.words.length) {
        ocrLayoutPages.push({
          page: pageNo,
          width: canvas.width,
          height: canvas.height,
          words: pageResult.words,
        });
      }
      page.cleanup?.();
    }
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError('ocr');
  } finally {
    await doc.destroy?.();
  }

  const clean = cleanOcrText(ocrText);
  if (!clean.trim()) throw new ExtractError('no-text');
  onProgress(100, 'Scanned PDF ready');
  return {
    text: clean.slice(0, MAX_TEXT),
    kind: 'pdf',
    pages: doc.numPages,
    scanned: true,
    warnings,
    layout: { pages: ocrLayoutPages },
  };
}

/* ------------------------------ images ------------------------------ */
export async function extractImage(file, onProgress) {
  onProgress(8, 'Preparing photo…');
  let canvas;
  try {
    canvas = await imageToCanvas(file);
  } catch {
    throw new ExtractError('image');
  }
  onProgress(20, 'Reading photo…');
  let result;
  try {
    result = await ocrCanvasDetailed(canvas, (pct) => {
      onProgress(20 + Math.round(pct * 0.78), `Reading photo — ${pct}%`);
    }, { tile: true });
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError('ocr');
  }
  const text = cleanOcrText(result.text);
  if (!text.trim()) throw new ExtractError('no-text');
  onProgress(100, 'Photo text ready');
  return {
    text: text.slice(0, MAX_TEXT),
    kind: 'image',
    pages: 1,
    warnings: [],
    layout: {
      pages: [{
        page: 1,
        width: canvas.width,
        height: canvas.height,
        words: result.words,
      }],
    },
  };
}

async function imageToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('image'));
    });
    await img.decode?.().catch(() => {});

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('image');

    // Keep the original pixels for the OCR pass. Tesseract handles both light
    // and dark screenshots, while pre-scaling and colour filters soften the
    // thin digits in narrow bKash columns.
    const scale = Math.max(1, Math.min(2, 1600 / Math.max(w, h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('image');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------ OCR ------------------------------ */
let tesseractLoading = null;
let ocrLogger = null;
const ocrWorkers = new Map();
const ocrWorkerPromises = new Map();

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoading) return tesseractLoading;
  tesseractLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('tesseract.min.js', VENDOR).href;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new ExtractError('ocr'));
    };
    script.onerror = () => reject(new ExtractError('ocr'));
    document.head.appendChild(script);
  });
  return tesseractLoading;
}

async function getOcrWorker(lang = 'eng') {
  if (ocrWorkers.has(lang)) return ocrWorkers.get(lang);
  if (!ocrWorkerPromises.has(lang)) {
    ocrWorkerPromises.set(lang, (async () => {
      const Tesseract = await loadTesseract();
      const worker = await Tesseract.createWorker(lang, 1, {
        workerPath: new URL('tesseract-worker.min.js', VENDOR).href,
        corePath: new URL('tesseract-core', VENDOR).href,
        langPath: new URL('tessdata', VENDOR).href,
        workerBlobURL: false,
        gzip: true,
        cacheMethod: 'none',
        logger: (message) => {
          if (!ocrLogger) return;
          if (message?.status === 'recognizing text') {
            ocrLogger(Math.max(1, Math.min(100, Math.round((message.progress || 0) * 100))));
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      ocrWorkers.set(lang, worker);
      return worker;
    })());
  }
  try {
    return await ocrWorkerPromises.get(lang);
  } catch (err) {
    ocrWorkerPromises.delete(lang);
    throw err instanceof ExtractError ? err : new ExtractError('ocr');
  }
}

/** Read one canvas and keep the word boxes, not just the flat text. */
async function ocrCanvasDetailed(canvas, onProgress = () => {}, options = {}) {
  const lang = options.lang || 'eng';
  // Screenshots are only ~700px wide, so the table text is tiny. Read them in
  // overlapping bands at 8x. This matches the resolution used by the bKash
  // regression fixtures and keeps decimals and the narrow Out/In/Charge columns.
  const tileHeight = options.tile === false ? 0 : 260;
  const overlap = 50;
  const scale = options.tile === false ? 1 : 8;
  const worker = await getOcrWorker(lang);
  ocrLogger = onProgress;

  const allWords = [];
  try {
    if (!tileHeight || canvas.height <= tileHeight * 1.4) {
      const result = await worker.recognize(canvas, {}, { tsv: true, text: true });
      const words = tsvToWords(result?.data?.tsv);
      return {
        text: (words.length ? wordsToText(words) : '') || result?.data?.text || '',
        words,
      };
    }

    const tiles = [];
    for (let y = 0; y < canvas.height; y += tileHeight - overlap) {
      const h = Math.min(tileHeight, canvas.height - y);
      if (h < 36) break;
      tiles.push({ y, h });
    }

    for (let t = 0; t < tiles.length; t += 1) {
      const { y, h } = tiles[t];
      const tile = document.createElement('canvas');
      tile.width = Math.round(canvas.width * scale);
      tile.height = Math.round(h * scale);
      const ctx = tile.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, tile.width, tile.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, tile.width, tile.height);

      const result = await worker.recognize(tile, {}, { tsv: true, text: true });
      for (const word of tsvToWords(result?.data?.tsv)) {
        const mapped = {
          ...word,
          x: word.x / scale,
          y: y + word.y / scale,
          w: word.w / scale,
          h: word.h / scale,
          left: word.left / scale,
          top: y + word.top / scale,
          right: word.right / scale,
          height: word.height / scale,
        };
        const duplicate = allWords.findIndex((existing) => (
          Math.abs(existing.top - mapped.top) < Math.max(existing.h, mapped.h) * 0.8
          && wordOverlap(existing, mapped) > 0.55
        ));
        if (duplicate < 0) allWords.push(mapped);
        else if ((mapped.conf || 0) > (allWords[duplicate].conf || 0)) allWords[duplicate] = mapped;
      }
      onProgress(Math.round(((t + 1) / tiles.length) * 100));
    }
  } finally {
    ocrLogger = null;
  }

  allWords.sort((a, b) => a.y - b.y || a.x - b.x);
  return { text: wordsToText(allWords), words: allWords };
}

async function ocrCanvas(canvas, onProgress = () => {}) {
  const result = await ocrCanvasDetailed(canvas, onProgress, { tile: false });
  return result.text;
}

function wordOverlap(a, b) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  if (right <= left) return 0;
  return (right - left) / Math.max(1, Math.min(a.right - a.left, b.right - b.left));
}

function tsvToWords(tsv) {
  if (!tsv || typeof tsv !== 'string') return [];
  const words = [];
  for (const row of tsv.split('\n')) {
    const cols = row.split('\t');
    if (cols.length < 12 || cols[0] !== '5') continue;
    const text = cols.slice(11).join(' ').trim();
    if (!text) continue;
    const left = Number(cols[6]);
    const top = Number(cols[7]);
    const width = Number(cols[8]);
    const height = Number(cols[9]);
    const conf = Number(cols[10]);
    if (!Number.isFinite(top) || !Number.isFinite(left)) continue;
    words.push({
      text,
      x: left,
      y: top,
      w: width || 0,
      h: height || 10,
      conf: Number.isFinite(conf) ? conf : 0,
      left,
      top,
      height: height || 10,
      right: left + (width || 0),
    });
  }
  return words;
}

function tsvToText(tsv) {
  return wordsToText(tsvToWords(tsv));
}

function wordsToText(words) {
  if (!words || !words.length) return '';

  words.sort((a, b) => a.top - b.top || a.left - b.left);
  const rows = [];
  for (const word of words) {
    let row = rows.find((r) => Math.abs(r.y - word.top) <= Math.max(7, Math.min(14, word.height * 0.8)));
    if (!row) {
      row = { y: word.top, words: [] };
      rows.push(row);
    }
    row.words.push(word);
    row.y = Math.min(row.y, word.top);
  }

  const rawLines = rows
    .sort((a, b) => a.y - b.y)
    .map((row) => row.words
      .sort((a, b) => a.left - b.left)
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);

  // Phone screenshots start with a title and an account line. Drop those
  // leading metadata rows so they do not get attached to the first transaction.
  let start = 0;
  while (
    start < rawLines.length
    && start < 4
    && !hasDate(rawLines[start])
    && !hasAmount(rawLines[start])
    && isOcrMeta(rawLines[start])
  ) {
    start += 1;
  }
  const lines = rawLines.slice(start);

  // A card screenshot often has the description and amount on one visual row,
  // then the date on the row below. Join those pieces before parsing.
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (!hasDate(line)) {
      let combined = line;
      let j = i + 1;
      while (j < lines.length && j <= i + 2 && !hasDate(lines[j])) {
        combined = `${combined} ${lines[j]}`.trim();
        j += 1;
      }
      if (j < lines.length && hasDate(lines[j]) && hasAmount(combined)) {
        out.push(`${combined} ${lines[j]}`.trim());
        i = j;
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

function hasDate(line) {
  return /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s./-]+[A-Za-z]{3,12}[\s./-]+\d{2,4})\b/.test(line);
}

function hasAmount(line) {
  return /\d[\d,]*\.\d{1,2}\b/.test(line);
}

function isOcrMeta(line) {
  const text = line.trim();
  if (!text) return true;
  if (/^(bkash|bikash|nagad|rocket|bank|brac|dbbl|city|islami|statement|account|a\/c|acct|period|date\b|description\b|transaction|balance\b|opening\b|closing\b|summary\b)/i.test(text)) {
    return true;
  }
  // Status bar: time, battery percentage, only digits and symbols.
  return /^[\d\s:+\-().%]+$/.test(text);
}

export async function stopOcr() {
  const workers = [...ocrWorkers.values()];
  ocrWorkers.clear();
  ocrWorkerPromises.clear();
  ocrLogger = null;
  for (const worker of workers) {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}
