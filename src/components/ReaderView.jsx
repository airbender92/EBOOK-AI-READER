/**
 * ReaderView.jsx — eBook Reader Component (v3)
 *
 * PDF: ALL pages rendered in a vertical scroll container. Each page
 *      gets its own canvas + transparent text layer. Scroll freely.
 * EPUB: Direct XHTML rendering. Scrollable by nature.
 * TXT:  Plain text in a scrollable pre.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import './ReaderView.css';

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default function ReaderView({
  book, fontSize, darkMode, zoomLevel, currentPage,
  onPageChange, onTextSelect, bookmarks,
}) {
  const containerRef = useRef(null);       // outer scroll container
  const pagesContainerRef = useRef(null);  // inner div holding all pdf pages
  const pageRefs = useRef({});             // { pageNum: { canvas, textLayer } }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [epubHtml, setEpubHtml] = useState('');
  const [txtPages, setTxtPages] = useState([]);
  const [selectionBar, setSelectionBar] = useState(null);
  const selectedTextRef = useRef('');
  const lastBookRef = useRef(null);

  // ===================== Load Book =====================
  useEffect(() => {
    if (!book) return;
    if (lastBookRef.current === book.filePath) return;
    lastBookRef.current = book.filePath;
    setLoading(true); setError('');
    setPdfDoc(null); setPdfTotalPages(0);
    setEpubHtml(''); setTxtPages([]);
    pageRefs.current = {};

    (async () => {
      try {
        const buf = base64ToArrayBuffer(book.data);
        if (book.format === 'pdf') await loadPDF(buf);
        else if (book.format === 'epub') await loadEPUB(buf);
        else if (book.format === 'txt') loadTXT(buf);
      } catch (e) { setError(`加载失败: ${e.message}`); }
      finally { setLoading(false); }
    })();
    return () => { if (pdfDoc) pdfDoc.destroy(); };
  }, [book]);

  // ===================== PDF: All pages, vertical scroll =====================

  async function loadPDF(buffer) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    setPdfDoc(doc);
    setPdfTotalPages(doc.numPages);
    onPageChange(1, doc.numPages);
    // Render pages after the container mounts
    setTimeout(() => renderAllPages(doc, pdfjsLib), 50);
  }

  /** Render ALL PDF pages into the scroll container. */
  async function renderAllPages(doc, pdfjsLib) {
    const container = pagesContainerRef.current;
    if (!container) return;
    container.innerHTML = '';
    pageRefs.current = {};
    const scale = zoomLevel * 1.5;

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });

      // Create page wrapper
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page-wrapper';
      pageDiv.setAttribute('data-page', i);
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';

      // Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      pageDiv.appendChild(canvas);

      // Text layer for selection
      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-text-layer';
      textLayer.style.width = viewport.width + 'px';
      textLayer.style.height = viewport.height + 'px';

      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        const tx = pdfjsLib.Util.transform(viewport.transform, [item.transform[4], item.transform[5]]);
        const fs = Math.sqrt(item.transform[0]**2 + item.transform[1]**2) * scale;
        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.cssText = `position:absolute;left:${tx[0]}px;top:${tx[1]-fs}px;font-size:${fs}px;color:transparent;pointer-events:auto;white-space:pre;`;
        textLayer.appendChild(span);
      }
      pageDiv.appendChild(textLayer);

      container.appendChild(pageDiv);
      pageRefs.current[i] = { canvas, textLayer, div: pageDiv };
    }
  }

  // Re-render all PDF pages when zoom changes
  useEffect(() => {
    if (pdfDoc && book?.format === 'pdf') {
      renderAllPages(pdfDoc, null).catch(console.error);
    }
  }, [zoomLevel]);

  // Track visible page via scroll
  useEffect(() => {
    if (!containerRef.current || book?.format !== 'pdf') return;
    const el = containerRef.current;
    function onScroll() {
      const pages = el.querySelectorAll('.pdf-page-wrapper');
      if (!pages.length) return;
      let closest = 1;
      let minDist = Infinity;
      const midY = el.scrollTop + el.clientHeight / 2;
      pages.forEach((p) => {
        const rect = p.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const pageMid = (rect.top - elRect.top) + el.scrollTop + rect.height / 2;
        const dist = Math.abs(midY - pageMid);
        if (dist < minDist) { minDist = dist; closest = +p.dataset.page; }
      });
      onPageChange(closest, pdfTotalPages);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pdfTotalPages, book?.format]);

  // Jump to page / navigate pages in scroll mode
  useEffect(() => {
    function jumpTo(e) {
      if (!containerRef.current) return;
      const el = containerRef.current.querySelector(`[data-page="${e.detail}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function navBy(e) {
      if (!containerRef.current || !pdfTotalPages) return;
      const pages = containerRef.current.querySelectorAll('.pdf-page-wrapper');
      if (!pages.length) return;
      let cur = 1;
      const midY = containerRef.current.scrollTop + containerRef.current.clientHeight / 2;
      pages.forEach(p => {
        const rect = p.getBoundingClientRect();
        const cr = containerRef.current.getBoundingClientRect();
        const pm = (rect.top - cr.top) + containerRef.current.scrollTop + rect.height / 2;
        if (Math.abs(midY - pm) < Math.abs(midY - /* placeholder */ (pages[cur-1] ? 0 : 0))) cur = +p.dataset.page;
      });
      // Actually, let's use a simpler approach: find visible page and go +delta
      let visible = 1;
      pages.forEach(p => {
        const r = p.getBoundingClientRect();
        const cr = containerRef.current.getBoundingClientRect();
        if (r.top < cr.bottom && r.bottom > cr.top) visible = +p.dataset.page;
      });
      const target = Math.max(1, Math.min(pdfTotalPages, visible + e.detail));
      const el = containerRef.current.querySelector(`[data-page="${target}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener('jump-to-page', jumpTo);
    window.addEventListener('navigate-page', navBy);
    return () => {
      window.removeEventListener('jump-to-page', jumpTo);
      window.removeEventListener('navigate-page', navBy);
    };
  }, [pdfTotalPages]);

  // ===================== EPUB =====================
  async function loadEPUB(buffer) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const images = {};
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const lo = name.toLowerCase();
      if (lo.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
        const data = await file.async('base64');
        const mime = lo.endsWith('svg') ? 'image/svg+xml' : lo.endsWith('png') ? 'image/png' : lo.endsWith('gif') ? 'image/gif' : lo.endsWith('webp') ? 'image/webp' : 'image/jpeg';
        images[name] = `data:${mime};base64,${data}`;
      }
    }
    const contentFiles = Object.keys(zip.files).filter(f => !zip.files[f].dir && /\.(x?html?|htm)$/i.test(f));
    if (!contentFiles.length) throw new Error('未找到可读内容');

    let html = '';
    for (const fn of contentFiles.sort()) {
      let h = await zip.file(fn).async('string');
      h = h.replace(/<script[\s\S]*?<\/script>/gi, '');
      for (const [ip, bu] of Object.entries(images)) {
        h = h.replace(new RegExp(ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), bu);
        const bn = ip.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        h = h.replace(new RegExp(`src=["'](?:[^"']*/)?${bn}["']`, 'gi'), `src="${bu}"`);
      }
      const bm = h.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      html += (bm ? bm[1] : h.replace(/<[/]?(html|head|body)[^>]*>/gi, '')) + '<hr style="border:none;border-top:1px dashed #ccc;margin:20px 0"/>';
    }
    setEpubHtml(`<div class="epub-content" style="font-size:${fontSize}px;line-height:1.8;color:${darkMode?'#e4e6eb':'#1a1a2e'};padding:16px;user-select:text">${html}</div>`);
    onPageChange(1, 1);
  }

  // ===================== TXT =====================
  function loadTXT(buffer) {
    let text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
    if (text.includes('\ufffd')) text = new TextDecoder('gbk').decode(new Uint8Array(buffer));
    setTxtPages([text]); onPageChange(1, 1);
  }

  // ===================== Selection & Floating Bar =====================
  useEffect(() => {
    function onUp() {
      setTimeout(() => {
        const sel = window.getSelection(); const t = sel?.toString().trim();
        if (t && containerRef.current?.contains(sel.anchorNode)) {
          selectedTextRef.current = t; onTextSelect(t);
          const r = sel.getRangeAt(0).getBoundingClientRect();
          const cr = containerRef.current.getBoundingClientRect();
          setSelectionBar({ x: r.left-cr.left+r.width/2, y: r.top-cr.top-48, text: t.slice(0,60)+(t.length>60?'...':''), visible: true });
        } else setTimeout(() => setSelectionBar(p => p ? {...p, visible:false} : null), 300);
      }, 10);
    }
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [onTextSelect]);

  const handleAIAction = useCallback((mode) => {
    const t = selectedTextRef.current; if (!t) return;
    window.dispatchEvent(new CustomEvent('ai-action', { detail: { mode, text: t } }));
    setSelectionBar(null); window.getSelection()?.removeAllRanges();
  }, []);

  // ===================== Render =====================
  return (
    <div className="reader-view" ref={containerRef}>
      {loading && <div className="reader-loading"><div className="spinner"/><span>加载中...</span></div>}
      {error && <div className="reader-error"><p>{error}</p><button className="btn-secondary" onClick={()=>setError('')}>关闭</button></div>}

      {/* PDF: scroll container with all pages */}
      {!loading && !error && book?.format === 'pdf' && (
        <div className="reader-pdf-scroll" ref={pagesContainerRef} />
      )}

      {/* EPUB */}
      {!loading && !error && book?.format === 'epub' && epubHtml && (
        <div className="reader-epub-container" dangerouslySetInnerHTML={{ __html: epubHtml }} />
      )}

      {/* TXT */}
      {!loading && !error && book?.format === 'txt' && txtPages.length > 0 && (
        <div className="reader-txt-container" style={{ fontSize: fontSize+'px', lineHeight:1.8, padding:'20px 30px' }}>
          <pre className="reader-txt-content">{txtPages[0]}</pre>
        </div>
      )}

      {/* Floating toolbar */}
      {selectionBar && selectionBar.visible && (
        <div className="selection-action-bar" style={{ left: Math.max(10,Math.min(selectionBar.x-110,(containerRef.current?.offsetWidth||800)-240)), top: Math.max(4,selectionBar.y) }}>
          <span className="selection-text-preview" title={selectedTextRef.current}>{selectionBar.text}</span>
          <div className="selection-actions">
            {[['解释','explain'],['译中','translate-zh'],['译英','translate-en'],['总结','summarize'],['提炼','knowledge'],['提问','ask']].map(([l,m])=>(
              <button key={m} onClick={()=>handleAIAction(m)}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
