/**
 * ReaderView.jsx — eBook Reader Component (v2)
 *
 * PDF: Canvas rendering + transparent text layer for text selection
 * EPUB: Direct XHTML rendering with image support
 * TXT: Plain text rendering with pagination
 *
 * Features: text selection, floating action toolbar on select
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import './ReaderView.css';

// ---- Helper: base64 to ArrayBuffer ----
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---- Helper: base64 to Blob URL ----
function base64ToBlobUrl(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const byteArr = new Uint8Array(byteNums);
  const blob = new Blob([byteArr], { type: mimeType });
  return URL.createObjectURL(blob);
}

export default function ReaderView({
  book,
  fontSize,
  darkMode,
  zoomLevel,
  currentPage,
  onPageChange,
  onTextSelect,
  bookmarks,
}) {
  // ===================== Refs =====================
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);

  // ===================== State =====================
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [epubHtml, setEpubHtml] = useState(''); // For EPUB: sanitized HTML
  const [epubImages, setEpubImages] = useState({}); // For EPUB: image blob URLs
  const [txtPages, setTxtPages] = useState([]); // For TXT pagination

  // Floating toolbar state
  const [selectionBar, setSelectionBar] = useState(null); // { x, y, text, visible }
  const selectedTextRef = useRef('');

  const lastBookRef = useRef(null);

  // ===================== Load Book =====================
  useEffect(() => {
    if (!book) return;
    if (lastBookRef.current === book.filePath) return;
    lastBookRef.current = book.filePath;

    setLoading(true);
    setError('');
    setPdfDoc(null);
    setPdfTotalPages(0);
    setEpubHtml('');
    setEpubImages({});
    setTxtPages([]);

    async function load() {
      try {
        const buffer = base64ToArrayBuffer(book.data);
        if (book.format === 'pdf') await loadPDF(buffer);
        else if (book.format === 'epub') await loadEPUB(buffer, book.data);
        else if (book.format === 'txt') loadTXT(buffer);
      } catch (err) {
        setError(`加载失败: ${err.message}`);
        console.error('Book load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();

    return () => {
      if (pdfDoc) pdfDoc.destroy();
    };
  }, [book]);

  // ===================== PDF: Canvas + Text Layer =====================

  async function loadPDF(buffer) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    setPdfDoc(doc);
    setPdfTotalPages(doc.numPages);
    onPageChange(1, doc.numPages);
    await renderPDFPage(doc, 1);
  }

  async function renderPDFPage(doc, pageNum) {
    if (!canvasRef.current || !textLayerRef.current || rendering) return;
    setRendering(true);

    try {
      const page = await doc.getPage(pageNum);
      const scale = zoomLevel * 1.5;
      const viewport = page.getViewport({ scale });

      // ---- Render canvas ----
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      await page.render({ canvasContext: ctx, viewport }).promise;

      // ---- Render text layer ----
      const textLayer = textLayerRef.current;
      textLayer.innerHTML = '';
      textLayer.style.width = viewport.width + 'px';
      textLayer.style.height = viewport.height + 'px';

      const textContent = await page.getTextContent();
      const textItems = textContent.items;

      for (const item of textItems) {
        // pdf.js coordinate system: origin is bottom-left
        // We need to transform to CSS: origin is top-left
        const tx = pdfjsLib.Util.transform(
          viewport.transform,
          [item.transform[4], item.transform[5]]
        );
        const fontSize = Math.sqrt(
          item.transform[0] * item.transform[0] +
            item.transform[1] * item.transform[1]
        ) * scale;

        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.position = 'absolute';
        span.style.left = tx[0] + 'px';
        span.style.top = (tx[1] - fontSize) + 'px';
        span.style.fontSize = fontSize + 'px';
        span.style.fontFamily = item.fontName || 'sans-serif';
        span.style.color = 'transparent';
        span.style.pointerEvents = 'auto';
        span.style.whiteSpace = 'pre';
        span.style.transformOrigin = '0% 0%';

        // Apply item transform (rotation/scale)
        span.style.transform =
          `scaleX(${Math.abs(item.transform[0]) / item.width || 1})`;

        textLayer.appendChild(span);
      }
    } catch (err) {
      console.error('PDF render error:', err);
    } finally {
      setRendering(false);
    }
  }

  // Re-render when page/zoom changes
  useEffect(() => {
    if (pdfDoc && book?.format === 'pdf') {
      renderPDFPage(pdfDoc, currentPage);
    }
  }, [currentPage, zoomLevel, pdfDoc, book?.format]);

  // ===================== EPUB: HTML Rendering =====================

  async function loadEPUB(buffer, base64Data) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    // Extract images as blob URLs
    const images = {};
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const lower = name.toLowerCase();
      if (lower.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
        const data = await file.async('base64');
        const mime = lower.endsWith('.svg') ? 'image/svg+xml' :
                     lower.endsWith('.png') ? 'image/png' :
                     lower.endsWith('.gif') ? 'image/gif' :
                     lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        images[name] = `data:${mime};base64,${data}`;
      }
    }
    setEpubImages(images);

    // Find and render XHTML content files
    const contentFiles = [];
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const lower = name.toLowerCase();
      if (lower.endsWith('.xhtml') || lower.endsWith('.html') || lower.endsWith('.htm')) {
        contentFiles.push(name);
      }
    }

    if (contentFiles.length === 0) throw new Error('EPUB 文件中未找到可读内容');

    // Build combined HTML
    let combinedHtml = '';
    for (const fileName of contentFiles.sort()) {
      try {
        let html = await zip.file(fileName).async('string');

        // Remove scripts and dangerous tags
        html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
        html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
        html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
        html = html.replace(/<embed[\s\S]*?>/gi, '');

        // Fix image src references to use our blob URLs
        for (const [imgPath, blobUrl] of Object.entries(images)) {
          const escapedPath = imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          html = html.replace(new RegExp(escapedPath, 'gi'), blobUrl);
          // Also try basename matching
          const basename = imgPath.split('/').pop();
          html = html.replace(
            new RegExp(`src=["'](?:[^"']*/)?${basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'),
            `src="${blobUrl}"`
          );
        }

        // Extract body content (preserve inline styles but strip html/head/body tags)
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
          combinedHtml += bodyMatch[1] + '<hr style="border:none;border-top:1px dashed #ccc;margin:20px 0;"/>';
        } else {
          const cleaned = html
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/<html[^>]*>/gi, '')
            .replace(/<\/html>/gi, '')
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
            .replace(/<body[^>]*>/gi, '')
            .replace(/<\/body>/gi, '');
          combinedHtml += cleaned;
        }
      } catch (e) {
        console.warn('Skipped EPUB file:', fileName, e.message);
      }
    }

    // Build a clean HTML document
    const fullHtml = `
      <div class="epub-content" style="
        font-size: ${fontSize}px;
        line-height: 1.8;
        color: ${darkMode ? '#e4e6eb' : '#1a1a2e'};
        max-width: 100%;
        padding: 16px;
        user-select: text;
        -webkit-user-select: text;
      ">
        ${combinedHtml}
      </div>
    `;
    setEpubHtml(fullHtml);
    setPdfTotalPages(1);
    onPageChange(1, 1);
  }

  // ===================== TXT: Plain Text =====================

  function loadTXT(buffer) {
    let text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    if (text.includes('\ufffd')) {
      text = new TextDecoder('gbk').decode(new Uint8Array(buffer));
    }
    setTxtPages([text]);
    setPdfTotalPages(1);
    onPageChange(1, 1);
  }

  // ===================== Text Selection & Floating Bar =====================

  useEffect(() => {
    function handleMouseUp(e) {
      // Small delay to let browser finalize selection
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (text && text.length > 0) {
          // Check if selection is in our reader
          const container = containerRef.current;
          if (container && container.contains(selection.anchorNode)) {
            selectedTextRef.current = text;
            onTextSelect(text);

            // Get position for floating bar
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            setSelectionBar({
              x: rect.left - containerRect.left + rect.width / 2,
              y: rect.top - containerRect.top - 48,
              text: text.length > 60 ? text.substring(0, 60) + '...' : text,
              visible: true,
            });
          }
        } else {
          // Don't hide immediately - let click events on the bar process first
          setTimeout(() => {
            if (selectedTextRef.current === text || !selection?.toString().trim()) {
              setSelectionBar((prev) => prev ? { ...prev, visible: false } : null);
            }
          }, 300);
        }
      }, 10);
    }

    // Hide bar when clicking outside
    function handleClick(e) {
      const bar = document.querySelector('.selection-action-bar');
      if (bar && bar.contains(e.target)) return; // Don't hide if clicking the bar
      setSelectionBar(null);
    }

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onTextSelect]);

  // ===================== AI Actions (dispatched upward) =====================
  const handleAIAction = useCallback((mode) => {
    const text = selectedTextRef.current;
    if (!text) return;
    window.dispatchEvent(new CustomEvent('ai-action', { detail: { mode, text } }));
    setSelectionBar(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // ===================== Render =====================
  return (
    <div className="reader-view" ref={containerRef}>
      {/* Loading */}
      {loading && (
        <div className="reader-loading">
          <div className="spinner" />
          <span>加载中...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="reader-error">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => setError('')}>关闭</button>
        </div>
      )}

      {/* ---- PDF Renderer ---- */}
      {!loading && !error && book?.format === 'pdf' && (
        <div className="reader-pdf-container">
          <div className="reader-pdf-page" style={{ position: 'relative' }}>
            <canvas ref={canvasRef} className="reader-pdf-canvas" />
            <div ref={textLayerRef} className="reader-text-layer" />
          </div>
        </div>
      )}

      {/* ---- EPUB Renderer ---- */}
      {!loading && !error && book?.format === 'epub' && epubHtml && (
        <div
          className="reader-epub-container"
          dangerouslySetInnerHTML={{ __html: epubHtml }}
        />
      )}

      {/* ---- TXT Renderer ---- */}
      {!loading && !error && book?.format === 'txt' && txtPages.length > 0 && (
        <div
          className="reader-txt-container"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.8, padding: '20px 30px' }}
        >
          <pre className="reader-txt-content">{txtPages[0]}</pre>
        </div>
      )}

      {/* ---- Floating Selection Action Bar ---- */}
      {selectionBar && selectionBar.visible && (
        <div
          className="selection-action-bar"
          style={{
            left: Math.max(10, Math.min(selectionBar.x - 110, (containerRef.current?.offsetWidth || 800) - 240)),
            top: Math.max(4, selectionBar.y),
          }}
        >
          <span className="selection-text-preview" title={selectedTextRef.current}>
            {selectionBar.text}
          </span>
          <div className="selection-actions">
            <button onClick={() => handleAIAction('explain')} title="解释这段话">
              解释
            </button>
            <button onClick={() => handleAIAction('translate-zh')} title="翻译成中文">
              译中
            </button>
            <button onClick={() => handleAIAction('translate-en')} title="翻译成英文">
              译英
            </button>
            <button onClick={() => handleAIAction('summarize')} title="总结大意">
              总结
            </button>
            <button onClick={() => handleAIAction('knowledge')} title="提炼知识点">
              提炼
            </button>
            <button onClick={() => handleAIAction('ask')} title="针对内容提问">
              提问
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
