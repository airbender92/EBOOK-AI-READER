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
import './ReaderView.css';

function base64ToAB(b64) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export default function ReaderView({ book, fontSize, darkMode, zoomLevel, currentPage, onPageChange, onTextSelect, bookmarks }) {
  const containerRef = useRef(null);
  const pagesRef = useRef(null);
  const barRef = useRef(null);
  const selRef = useRef('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [epubHtml, setEpubHtml] = useState('');
  const [txtPages, setTxtPages] = useState([]);
  const [bar, setBar] = useState({ on: false, text: '', pv: '', l: 0, t: 0 });

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
    onPageChange(1, doc.numPages);
    setTimeout(() => renderAllPages(doc, pdfjsLib), 50);
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
  }

  // ---- TXT ----
  function loadTXT(buf) {
    let t = new TextDecoder('utf-8').decode(new Uint8Array(buf));
    if (t.includes('\ufffd')) t = new TextDecoder('gbk').decode(new Uint8Array(buf));
    setTxtPages([t]); onPageChange(1,1);
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
  // - Image (canvas/img): show "识别图中文字" + "复制图片"
  const barHoverRef = useRef(false);

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
  const cop = useCallback(() => {
    if (!selRef.current) return;
    if (selRef.current === '__IMAGE__') {
      // Copy the underlying canvas/img to clipboard
      const sel = document.querySelector('.sel-bar');
      // We tracked the highlighted element via bg color; fallback: find canvas under last mouse pos
      const cv = document.querySelector('canvas:hover') || document.querySelector('img:hover');
      if (cv) {
        if (cv.tagName === 'CANVAS') {
          cv.toBlob(b => b && navigator.clipboard.write?.([new ClipboardItem({'image/png': b})]).catch(()=>{}));
        } else {
          // For img: fetch the data URL
          const url = cv.src;
          if (url) navigator.clipboard.writeText(url).catch(()=>{});
        }
      }
      setBar(s=>({...s,on:false}));
      return;
    }
    navigator.clipboard.writeText(selRef.current).catch(()=>{});
    setBar(s=>({...s,on:false})); window.getSelection()?.removeAllRanges();
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

      {/* Floating bar — always in DOM, position:fixed, opacity toggle */}
      <div ref={barRef} className={`sel-bar${bar.on?' on':''}`}
        style={{left:bar.l+'px',top:bar.t+'px',transform:'translate(-50%,-100%)',pointerEvents:bar.on?'auto':'none'}}
        onMouseEnter={() => { barHoverRef.current = true; }}
        onMouseLeave={() => { barHoverRef.current = false; setBar(s => s.on ? { ...s, on: false } : s); }}>
        <span className="sel-prev" title={bar.text||bar.pv}>{bar.pv||bar.text}</span>
        <div className="sel-acts">
          {bar.image ? (
            <>
              <button onClick={cop}>复制图片</button>
              <button onClick={()=>{ window.dispatchEvent(new CustomEvent('ai-action',{detail:{mode:'ask',text:'__IMAGE__',image:document.querySelector('canvas:hover,img:hover')}})); setBar(s=>({...s,on:false})); }} className="ask">识别文字</button>
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
    </div>
  );
}
