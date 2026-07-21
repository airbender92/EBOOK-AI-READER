/**
 * ReaderView.jsx — eBook Reader (v4)
 * 
 * PDF: Canvas + extracted text below each page (visible & selectable).
 * EPUB: Direct XHTML rendering.
 * TXT: Plain text.
 * 
 * Selection: mouseup + selectionchange → floating toolbar (fixed positioned).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { extractText, terminateOCR } from '../utils/ocr';
import { saveReadingProgress } from '../utils/storage';
import './ReaderView.css';

function base64ToAB(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Convert a <canvas> or <img> element into a PNG data URL.
// Used by the image toolbar (copy / OCR / add-to-chat) — must NOT rely on
// `:hover` since the cursor is on the toolbar button by the time of the click.
async function elementToDataURL(el) {
  if (!el) return null;
  if (el.tagName === 'CANVAS') {
    try { return el.toDataURL('image/png'); } catch (_) { return null; }
  }
  if (el.tagName === 'IMG') {
    const src = el.src || '';
    if (src.startsWith('data:')) return src;
    try {
      const cv = document.createElement('canvas');
      cv.width = el.naturalWidth || el.width || 1;
      cv.height = el.naturalHeight || el.height || 1;
      cv.getContext('2d').drawImage(el, 0, 0);
      return cv.toDataURL('image/png');
    } catch (_) { return src || null; }
  }
  return null;
}

async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}

export default function ReaderView({ book, fontSize, darkMode, zoomLevel, currentPage, onPageChange, onTextSelect, bookmarks }) {
  const containerRef = useRef(null);
  const pagesRef = useRef(null);
  const barRef = useRef(null);
  const selRef = useRef('');
  const hoveredImageRef = useRef(null);   // tracks the last hovered <canvas>/<img> so button clicks can access it
  const imageMaskRef = useRef(null);      // the floating dashed-border overlay element

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [epubHtml, setEpubHtml] = useState('');
  const [txtPages, setTxtPages] = useState([]);
  const [bar, setBar] = useState({ on: false, text: '', pv: '', l: 0, t: 0 });

  // OCR (extract text from image) state
  const [ocrState, setOcrState] = useState({ loading: false, progress: 0, result: '', error: '', open: false });

  const lastBook = useRef(null);

  // ---- Load ----
  useEffect(() => {
    if (!book || lastBook.current === book.filePath) return;
    lastBook.current = book.filePath;
    setLoading(true); setError('');
    setPdfDoc(null); setPdfTotalPages(0); setEpubHtml(''); setTxtPages([]);
    (async () => {
      try {
        const buf = base64ToAB(book.data);
        if (book.format === 'pdf') await loadPDF(buf);
        else if (book.format === 'epub') await loadEPUB(buf);
        else loadTXT(buf);
      } catch (e) { setError(`加载失败: ${e.message}`); }
      finally { setLoading(false); }
    })();
    return () => { if (pdfDoc) pdfDoc.destroy(); };
  }, [book]);

  // ---- PDF ----
  async function loadPDF(buf) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    setPdfDoc(doc); setPdfTotalPages(doc.numPages);
    const targetPage = Math.max(1, Math.min(currentPage, doc.numPages));
    onPageChange(targetPage, doc.numPages);
    setTimeout(() => renderAllPages(doc, pdfjsLib).then(() => jumpToPage(targetPage)), 50);
  }

  function jumpToPage(page) {
    const el = containerRef.current?.querySelector(`[data-page="${page}"]`);
    if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  async function renderAllPages(doc, lib) {
    const c = pagesRef.current; if (!c) return;
    c.innerHTML = '';
    const scale = zoomLevel * 1.5;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale });
      const w = document.createElement('div'); w.className = 'pdf-page-wrapper'; w.dataset.page = i;
      w.style.maxWidth = vp.width + 'px';
      const cv = document.createElement('canvas'); cv.className = 'pdf-canvas';
      cv.width = vp.width; cv.height = vp.height;
      cv.style.cssText = 'width:100%;height:auto;display:block;';
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      w.appendChild(cv);

      // Extract text and split into paragraphs based on Y gaps
      const tc = await page.getTextContent();
      const items = [...tc.items].sort((a,b)=>{
        const d = b.transform[5]-a.transform[5];
        return Math.abs(d)>2?d:a.transform[4]-b.transform[4];
      });
      // Detect line height from first two items
      const ys = items.map(it=>it.transform[5]);
      let lineH = 12;
      for (let i=1; i<ys.length; i++) {
        const d = Math.abs(ys[i]-ys[i-1]);
        if (d>2 && d<50) { lineH = d; break; }
      }
      const paragraphGap = lineH * 1.5;

      const paragraphs = []; let curLine = '', curPara = [], lastY = null, lastFontSize = 0;
      for (const it of items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5];
        const fs = Math.sqrt(it.transform[0]**2+it.transform[1]**2);
        if (lastY !== null && Math.abs(y - lastY) > paragraphGap) {
          if (curPara.length) paragraphs.push(curPara.join(' '));
          curPara = [];
        }
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (curLine.trim()) curPara.push(curLine.trim());
          curLine = '';
        }
        if (lastFontSize && Math.abs(fs - lastFontSize) > 2) {
          // font change = new paragraph (headings etc.)
          if (curPara.length || curLine.trim()) { paragraphs.push([...curPara, curLine].join(' ').trim()); }
          curPara = []; curLine = '';
        }
        curLine += (curLine && !curLine.endsWith(' ') && it.str!==' ' ? ' ' : '') + it.str;
        lastY = y; lastFontSize = fs;
      }
      if (curLine.trim()) curPara.push(curLine.trim());
      if (curPara.length) paragraphs.push(curPara.join(' '));

      if (paragraphs.length) {
        const textWrap = document.createElement('div');
        textWrap.className = 'pdf-text-content';
        textWrap.style.cssText = `padding:8px;border-top:1px dashed ${darkMode?'#444':'#ddd'};`;
        for (const p of paragraphs) {
          if (!p.trim()) continue;
          const pd = document.createElement('div');
          pd.className = 'pdf-text-paragraph';
          pd.textContent = p.trim();
          pd.style.cssText = `font-size:${Math.max(12,14*zoomLevel)}px;line-height:1.8;color:${darkMode?'#d0d3d8':'#333'};cursor:text;padding:4px 6px;margin:2px 0;user-select:text;-webkit-user-select:text;`;
          textWrap.appendChild(pd);
        }
        w.appendChild(textWrap);
      }
      c.appendChild(w);
    }
  }

  useEffect(() => { if (pdfDoc && book?.format==='pdf') renderAllPages(pdfDoc,null).catch(console.error); }, [zoomLevel]);

  // ---- EPUB ----
  async function loadEPUB(buf) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const imgs = {};
    for (const [n,f] of Object.entries(zip.files)) {
      if (f.dir) continue;
      if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(n)) {
        const d = await f.async('base64');
        imgs[n] = `data:${/\.svg$/i.test(n)?'image/svg+xml':/\.png$/i.test(n)?'image/png':/\.gif$/i.test(n)?'image/gif':/\.webp$/i.test(n)?'image/webp':'image/jpeg'};base64,${d}`;
      }
    }
    const files = Object.keys(zip.files).filter(k=>!zip.files[k].dir&&/\.(x?html?|htm)$/i.test(k));
    if (!files.length) throw new Error('无内容');
    let h='';
    for (const fn of files.sort()) {
      let c=await zip.file(fn).async('string');
      c=c.replace(/<script[\s\S]*?<\/script>/gi,'');
      for (const [ip,bu] of Object.entries(imgs)) {
        c=c.replace(new RegExp(ip.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),bu);
        const bn=ip.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        c=c.replace(new RegExp(`src=["'](?:[^"']*/)?${bn}["']`,'gi'),`src="${bu}"`);
      }
      const bm=c.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      h+=(bm?bm[1]:c.replace(/<[/]?(html|head|body)[^>]*>/gi,''))+'<hr style="border:none;border-top:1px dashed #ccc;margin:20px 0"/>';
    }
    setEpubHtml(`<div style="font-size:${fontSize}px;line-height:1.8;color:${darkMode?'#e4e6eb':'#1a1a2e'};padding:16px;user-select:text;-webkit-user-select:text;cursor:text">${h}</div>`);
    onPageChange(1,1);
    restoreScrollRatio();
  }

  // ---- TXT ----
  function loadTXT(buf) {
    let t = new TextDecoder('utf-8').decode(new Uint8Array(buf));
    if (t.includes('\ufffd')) t = new TextDecoder('gbk').decode(new Uint8Array(buf));
    setTxtPages([t]); onPageChange(1,1);
    restoreScrollRatio();
  }

  // Restore saved scroll ratio for EPUB/TXT after content renders
  function restoreScrollRatio() {
    const ratio = book?.initialScrollRatio;
    if (ratio == null || !containerRef.current) return;
    setTimeout(() => {
      const c = containerRef.current;
      if (c && c.scrollHeight > c.clientHeight) {
        c.scrollTop = ratio * (c.scrollHeight - c.clientHeight);
      }
    }, 50);
  }

  // ============== SELECTION + HOVER + FLOATING BAR ==============

  // 1) Selection: mouseup / selectionchange fires when user manually selects text
  const showBarFromSel = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;
    if (!containerRef.current || !containerRef.current.contains(sel.anchorNode)) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    let top = rect.top; if (top < 40) top = rect.bottom;
    selRef.current = text;
    if (onTextSelect) onTextSelect(text);
    setBar({ on:true, text, pv:text.length>50?text.slice(0,50)+'...':text, l:rect.left+rect.width/2, t:top });
  }, [onTextSelect]);

  // 2) Hover: mousemove finds text block / image and shows bar
  // - Bar stays visible when mouse enters it (prevents flicker)
  // - Text: extract text from smallest text-bearing ancestor
  // - Image (canvas/img): show a dashed selection mask + toolbar with
  //   复制图片 / 提取文字(OCR) / 添加到对话. The hovered element is stored in
  //   hoveredImageRef so button click handlers don't depend on `:hover`
  //   (which fails once the cursor moves onto the toolbar).
  const barHoverRef = useRef(false);

  // Position/size the dashed mask overlay over a given element's bounding rect.
  function placeMask(el) {
    if (!imageMaskRef.current) return;
    if (!el) { imageMaskRef.current.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    const m = imageMaskRef.current;
    m.style.display = 'block';
    m.style.left = r.left + 'px';
    m.style.top = r.top + 'px';
    m.style.width = r.width + 'px';
    m.style.height = r.height + 'px';
  }

  useEffect(() => {
    const ct = containerRef.current;
    if (!ct) return;
    let prevBlock = null;

    function highlight(el) {
      if (prevBlock && prevBlock !== el) { prevBlock.style.background = ''; prevBlock.style.borderRadius = ''; }
      prevBlock = el;
      if (el) { el.style.background = 'rgba(79,110,247,0.08)'; el.style.borderRadius = '6px'; }
    }
    function clearHighlight() {
      if (prevBlock) { prevBlock.style.background = ''; prevBlock.style.borderRadius = ''; prevBlock = null; }
      placeMask(null);
      hoveredImageRef.current = null;
    }

    function findTarget(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || !ct?.contains(el)) return null;
      if (el.tagName === 'CANVAS' || el.tagName === 'IMG') return { type: 'image', el };
      let cur = el, best = null;
      while (cur && cur !== ct) {
        const tag = cur.tagName?.toLowerCase();
        const cls = cur.className || '';
        if (tag === 'p' || tag === 'li' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' ||
            cls.includes('pdf-text-paragraph')) {
          const t = cur.textContent?.trim() || '';
          if (t.length >= 5) return { type: 'text', el: cur, text: t };
        }
        if (!best) { const t = cur.textContent?.trim() || ''; if (t.length >= 10) best = { type: 'text', el: cur, text: t }; }
        cur = cur.parentElement;
      }
      return best;
    }

    function showBar(target) {
      const rect = target.el.getBoundingClientRect();
      if (target.type === 'image') {
        // Track the hovered image so click handlers can read it later.
        hoveredImageRef.current = target.el;
        placeMask(target.el);
        selRef.current = '__IMAGE__';
        if (onTextSelect) onTextSelect('__IMAGE__');
        let top = rect.top; if (top < 40) top = rect.bottom;
        setBar({ on: true, image: true, l: rect.left + rect.width/2, t: top, text: '', pv: '图片' });
      } else {
        selRef.current = target.text;
        if (onTextSelect) onTextSelect(target.text);
        // Place bar immediately above text, zero gap
        let top = rect.top;
        if (top < 40) top = rect.bottom;
        setBar({ on: true, image: false, l: rect.left + rect.width/2, t: top, text: target.text, pv: target.text.length > 50 ? target.text.slice(0, 50) + '...' : target.text });
      }
      highlight(target.el);
    }

    function onMove(e) {
      if (barHoverRef.current) return; // mouse is on the bar itself — freeze
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) return;
      const target = findTarget(e);
      if (!target) { clearHighlight(); return; }
      showBar(target);
    }
    function onLeave() {
      if (barHoverRef.current) return; // mouse entered the bar — don't hide
      clearHighlight();
      setBar(s => s.on ? { ...s, on: false } : s);
    }
    ct.addEventListener('mousemove', onMove, { passive: true });
    ct.addEventListener('mouseleave', onLeave);
    return () => { ct.removeEventListener('mousemove', onMove); ct.removeEventListener('mouseleave', onLeave); };
  }, [onTextSelect]);

  // Keep the image mask aligned to the hovered image while scrolling/resizing
  useEffect(() => {
    function update() {
      if (hoveredImageRef.current && bar.image) placeMask(hoveredImageRef.current);
      else if (!bar.on) placeMask(null);
    }
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [bar.image, bar.on]);

  const hideBar = useCallback(() => {
    setTimeout(() => { if (!barRef.current?.matches(':hover')) setBar(s=>s.on?{...s,on:false}:s); }, 150);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', showBarFromSel);
    document.addEventListener('selectionchange', showBarFromSel);
    return () => { document.removeEventListener('mouseup',showBarFromSel); document.removeEventListener('selectionchange',showBarFromSel); };
  }, [showBarFromSel]);

  useEffect(() => {
    function sc() { if (!barRef.current?.matches(':hover')) hideBar(); }
    function clk(e) { if (!barRef.current?.contains(e.target)) hideBar(); }
    document.addEventListener('scroll', sc, true);
    document.addEventListener('click', clk);
    return () => { document.removeEventListener('scroll', sc); document.removeEventListener('click', clk); };
  }, [hideBar]);

  const act = useCallback((mode) => {
    if (!selRef.current) return;
    if (selRef.current === '__IMAGE__') return; // image mode handled separately
    window.dispatchEvent(new CustomEvent('ai-action',{detail:{mode,text:selRef.current}}));
    setBar(s=>({...s,on:false})); window.getSelection()?.removeAllRanges();
  }, []);
  const cop = useCallback(async () => {
    if (!selRef.current) return;
    if (selRef.current === '__IMAGE__') {
      // Copy the hovered canvas/img to clipboard.
      // Use the tracked ref instead of `:hover` — the cursor is already on
      // the toolbar button by the time of the click, so :hover would be null.
      const el = hoveredImageRef.current;
      const dataURL = await elementToDataURL(el);
      if (!dataURL) {
        navigator.clipboard.writeText('[复制图片失败：无法读取图片数据]').catch(()=>{});
        setBar(s=>({...s,on:false})); placeMask(null); hoveredImageRef.current = null;
        return;
      }
      // Prefer the main-process clipboard: it reliably writes a real image
      // that pastes correctly in WeChat/QQ/etc. The renderer's async
      // clipboard API often falls back to text under custom protocols.
      let copied = false;
      if (window.electronAPI?.copyImage) {
        copied = await window.electronAPI.copyImage(dataURL);
      }
      if (!copied) {
        try {
          if (navigator.clipboard?.write && window.ClipboardItem) {
            const blob = await dataURLToBlob(dataURL);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          } else {
            await navigator.clipboard.writeText(dataURL);
          }
        } catch (_) {
          // Fallback: write the data URL as plain text
          navigator.clipboard.writeText(dataURL).catch(()=>{});
        }
      }
      setBar(s=>({...s,on:false})); placeMask(null); hoveredImageRef.current = null;
      return;
    }
    navigator.clipboard.writeText(selRef.current).catch(()=>{});
    setBar(s=>({...s,on:false})); window.getSelection()?.removeAllRanges();
  }, []);

  // OCR the hovered image locally with Tesseract.js (WeChat-style extraction).
  // Previously this dispatched the raw image to the AI chat model, which only
  // works for multimodal models and produced garbled text. We now run OCR
  // on-device and show the result in a dedicated modal.
  const ocrImage = useCallback(async () => {
    const el = hoveredImageRef.current;
    const dataURL = await elementToDataURL(el);
    if (!dataURL) { setBar(s=>({...s,on:false})); return; }
    setBar(s=>({...s,on:false})); placeMask(null); hoveredImageRef.current = null;
    setOcrState({ loading: true, progress: 0, result: '', error: '', open: true });
    try {
      const { text } = await extractText(dataURL, {
        onProgress: (p) => setOcrState(s => ({ ...s, progress: Math.round(p * 100) })),
      });
      setOcrState({ loading: false, progress: 100, result: text || '(未识别到文字)', error: '', open: true });
    } catch (err) {
      setOcrState({ loading: false, progress: 0, result: '', error: `识别失败：${err?.message || err}`, open: true });
    }
  }, []);

  // Clean up the OCR worker when the component unmounts.
  useEffect(() => () => { terminateOCR().catch(() => {}); }, []);

  // Add the hovered image to the AI conversation as an uploaded image.
  const addImageToChat = useCallback(async () => {
    const el = hoveredImageRef.current;
    const dataURL = await elementToDataURL(el);
    if (!dataURL) { setBar(s=>({...s,on:false})); return; }
    window.dispatchEvent(new CustomEvent('ai-action', {
      detail: { mode: 'add-image', text: '__IMAGE__', imageDataURL: dataURL }
    }));
    setBar(s=>({...s,on:false})); placeMask(null); hoveredImageRef.current = null;
  }, []);

  // ---- Page scroll tracking ----
  useEffect(() => {
    if (!containerRef.current || book?.format!=='pdf') return;
    const el = containerRef.current;
    function sc() {
      const ps = el.querySelectorAll('.pdf-page-wrapper'); if (!ps.length) return;
      let best=1, md=Infinity;
      const my = el.scrollTop + el.clientHeight/2;
      ps.forEach(p=>{ const d=Math.abs((p.offsetTop+p.offsetHeight/2)-my); if(d<md){md=d;best=+p.dataset.page;} });
      onPageChange(best, pdfTotalPages);
    }
    el.addEventListener('scroll', sc,{passive:true});
    return ()=>el.removeEventListener('scroll',sc);
  }, [pdfTotalPages, book?.format]);

  // ---- EPUB/TXT scroll progress tracking ----
  useEffect(() => {
    if (!containerRef.current || !book || book.format === 'pdf') return;
    const el = containerRef.current;
    let t;
    function sc() {
      clearTimeout(t);
      t = setTimeout(() => {
        const ratio = el.scrollHeight > el.clientHeight
          ? el.scrollTop / (el.scrollHeight - el.clientHeight)
          : 0;
        saveReadingProgress(book.filePath, 1, 1, ratio);
      }, 300);
    }
    el.addEventListener('scroll', sc, { passive: true });
    return () => { el.removeEventListener('scroll', sc); clearTimeout(t); };
  }, [book]);

  // ---- Jump to page ----
  useEffect(() => {
    const jump=e=>{ const el=containerRef.current?.querySelector(`[data-page="${e.detail}"]`); if(el)el.scrollIntoView({behavior:'smooth',block:'start'}); };
    const nav=e=>{
      const ps=containerRef.current?.querySelectorAll('.pdf-page-wrapper'); if(!ps?.length)return;
      let v=1; ps.forEach(p=>{const r=p.getBoundingClientRect(),cr=containerRef.current.getBoundingClientRect();if(r.top<cr.bottom&&r.bottom>cr.top)v=+p.dataset.page;});
      const t=Math.max(1,Math.min(pdfTotalPages,v+e.detail));
      const el=containerRef.current.querySelector(`[data-page="${t}"]`); if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
    };
    window.addEventListener('jump-to-page',jump); window.addEventListener('navigate-page',nav);
    return ()=>{window.removeEventListener('jump-to-page',jump);window.removeEventListener('navigate-page',nav);};
  }, [pdfTotalPages]);

  return (
    <div className="reader-view" ref={containerRef}>
      {loading && <div className="reader-loading"><div className="spinner"/><span>加载中...</span></div>}
      {error && <div className="reader-error"><p>{error}</p><button className="btn-secondary" onClick={()=>setError('')}>关闭</button></div>}

      {!loading && !error && book?.format==='pdf' && <div className="reader-pdf-scroll" ref={pagesRef}/>}
      {!loading && !error && book?.format==='epub' && epubHtml && <div className="reader-epub-container" dangerouslySetInnerHTML={{__html:epubHtml}}/>}
      {!loading && !error && book?.format==='txt' && txtPages.length>0 && (
        <pre className="reader-txt" style={{fontSize:fontSize+'px',lineHeight:1.8,padding:'20px 30px',margin:0,whiteSpace:'pre-wrap',color:darkMode?'#e4e6eb':'#1a1a2e',cursor:'text',userSelect:'text'}}>{txtPages[0]}</pre>
      )}

      {/* Image selection mask (dashed overlay) — fixed-positioned over the hovered image */}
      <div ref={imageMaskRef} className="img-selection-mask" aria-hidden="true" />

      {/* Floating bar — always in DOM, position:fixed, opacity toggle */}
      <div ref={barRef} className={`sel-bar${bar.on?' on':''}`}
        style={{left:bar.l+'px',top:bar.t+'px',transform:'translate(-50%,-100%)',pointerEvents:bar.on?'auto':'none'}}
        onMouseEnter={() => { barHoverRef.current = true; }}
        onMouseLeave={() => { barHoverRef.current = false; setBar(s => s.on ? { ...s, on: false } : s); placeMask(null); hoveredImageRef.current = null; }}>
        <span className="sel-prev" title={bar.text||bar.pv}>{bar.pv||bar.text}</span>
        <div className="sel-acts">
          {bar.image ? (
            <>
              <button onClick={ocrImage} disabled={ocrState.loading}>
                {ocrState.loading ? `识别中 ${ocrState.progress}%` : '提取文字'}
              </button>
              <button onClick={cop}>复制图片</button>
              <button onClick={addImageToChat} className="ask">添加到对话</button>
            </>
          ) : (
            <>
              <button onClick={()=>act('explain')}>解释</button>
              <button onClick={()=>act('translate-zh')}>译中</button>
              <button onClick={()=>act('translate-en')}>译英</button>
              <button onClick={cop}>复制</button>
              <button onClick={()=>act('ask')} className="ask">问AI</button>
            </>
          )}
        </div>
      </div>

      {/* OCR result modal (WeChat-style extracted-text panel) */}
      {ocrState.open && (
        <div className="ocr-modal-overlay" onClick={() => !ocrState.loading && setOcrState(s => ({ ...s, open: false }))}>
          <div className="ocr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ocr-modal-header">
              <span className="ocr-modal-title">提取文字</span>
              <button className="ocr-modal-close" onClick={() => !ocrState.loading && setOcrState(s => ({ ...s, open: false }))} disabled={ocrState.loading}>✕</button>
            </div>
            <div className="ocr-modal-body">
              {ocrState.loading ? (
                <div className="ocr-loading">
                  <div className="spinner" />
                  <span>正在识别文字… {ocrState.progress}%</span>
                </div>
              ) : ocrState.error ? (
                <div className="ocr-error">{ocrState.error}</div>
              ) : (
                <textarea className="ocr-result" value={ocrState.result} readOnly spellCheck={false} />
              )}
            </div>
            {!ocrState.loading && !ocrState.error && (
              <div className="ocr-modal-footer">
                <button className="ocr-footer-btn" onClick={() => { navigator.clipboard.writeText(ocrState.result).catch(()=>{}); }}>复制文字</button>
                <button className="ocr-footer-btn primary" onClick={() => {
                  window.dispatchEvent(new CustomEvent('ai-action', { detail: { mode: 'explain', text: ocrState.result } }));
                  setOcrState(s => ({ ...s, open: false }));
                }}>发送到 AI</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
