const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

const MAX_TEXT_CHARS = 12000;

function normalizeExtractedText(text) {
  const normalized = String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (normalized.length <= MAX_TEXT_CHARS) return normalized;
  return normalized.slice(0, MAX_TEXT_CHARS);
}

function inferExtension(name) {
  const n = String(name || '').toLowerCase();
  const idx = n.lastIndexOf('.');
  if (idx === -1) return '';
  return n.slice(idx + 1);
}

async function extractTextFromPdf(buffer) {
  let parseError = null;
  try {
    const result = await pdfParse(buffer);
    const text = normalizeExtractedText(result?.text || '');
    if (text) return text;
  } catch (error) {
    parseError = error;
  }

  // Fallback parser for PDFs that fail in pdf-parse.
  try {
    // pdfjs-dist is ESM-only in this repo. Use dynamic import.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const api = pdfjs?.default || pdfjs;
    if (!api?.getDocument) throw new Error('pdfjs-dist unavailable');

    // In Node, run without a worker to avoid workerSrc/config issues.
    const loadingTask = api.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true
    });
    const doc = await loadingTask.promise;
    const pageTexts = [];
    const maxPages = Math.min(doc.numPages || 0, 40);

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(pageNo);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      const line = (content?.items || [])
        .map((i) => (typeof i?.str === 'string' ? i.str : ''))
        .join(' ')
        .trim();
      if (line) pageTexts.push(line);
    }

    const fallbackText = normalizeExtractedText(pageTexts.join('\n'));
    if (fallbackText) return fallbackText;

    // If we got here, PDF opened but had no text layer (common for scanned PDFs).
    // Try a lightweight OCR fallback for first 2 pages.
    try {
      // eslint-disable-next-line global-require
      const { createCanvas } = require('@napi-rs/canvas');
      const ocrPages = Math.min(doc.numPages || 0, 2);
      const ocrTexts = [];
      for (let pageNo = 1; pageNo <= ocrPages; pageNo += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await doc.getPage(pageNo);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: ctx, viewport }).promise;
        const png = canvas.toBuffer('image/png');
        // eslint-disable-next-line no-await-in-loop
        const ocr = await Tesseract.recognize(png, 'eng');
        const t = normalizeExtractedText(ocr?.data?.text || '');
        if (t) ocrTexts.push(t);
      }
      const ocrText = normalizeExtractedText(ocrTexts.join('\n'));
      if (ocrText) return ocrText;
    } catch (_) {
      // ignore OCR failures and fall through to unified message
    }
  } catch (_) {
    // handled below with unified message
  }

  const msg = String(parseError?.message || '').toLowerCase();
  if (msg.includes('password') || msg.includes('encrypted')) {
    throw new Error('PDF is password-protected and cannot be analyzed.');
  }
  throw new Error(parseError?.message ? `PDF text extraction failed: ${parseError.message}` : 'PDF text extraction failed.');
}

async function extractTextFromDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(result?.value || '');
  } catch (_) {
    throw new Error('DOCX text extraction failed.');
  }
}

function extractTextFromTxt(buffer) {
  return normalizeExtractedText(buffer.toString('utf8'));
}

async function extractTextFromImage(buffer) {
  try {
    const result = await Tesseract.recognize(buffer, 'eng');
    return normalizeExtractedText(result?.data?.text || '');
  } catch (_) {
    throw new Error('Image OCR extraction failed.');
  }
}

async function extractAttachmentText({ fileBuffer, mimeType, fileName }) {
  const mime = String(mimeType || '').toLowerCase();
  const ext = inferExtension(fileName);

  if (!Buffer.isBuffer(fileBuffer)) {
    return { ok: false, reason: 'invalid_file', message: 'Attachment is not a valid file.' };
  }

  try {
    let extracted = '';
    const isImage =
      mime.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

    if (mime === 'text/plain' || ext === 'txt') {
      extracted = extractTextFromTxt(fileBuffer);
    } else if (
      mime === 'application/pdf' ||
      ext === 'pdf'
    ) {
      extracted = await extractTextFromPdf(fileBuffer);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      extracted = await extractTextFromDocx(fileBuffer);
    } else if (isImage) {
      extracted = await extractTextFromImage(fileBuffer);
    } else {
      return {
        ok: false,
        reason: 'unsupported',
        message: 'Unsupported file type. Supported types: PDF, DOCX, TXT, JPG, PNG, GIF, WEBP.'
      };
    }

    if (!extracted || extracted.length < 10) {
      return { ok: false, reason: 'no_text', message: 'No readable text found in this attachment.' };
    }

    return { ok: true, text: extracted };
  } catch (error) {
    const message = String(error?.message || '').trim();
    return {
      ok: false,
      reason: 'extract_failed',
      message: message || 'Text extraction failed for this attachment.'
    };
  }
}

module.exports = {
  extractAttachmentText
};
