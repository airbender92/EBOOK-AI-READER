/**
 * AIPanel.jsx — AI Conversation Panel (v3)
 * Supports: text chat, image upload (paste/select), dragover, history persisted.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { callAI } from '../utils/doubao';
import './AIPanel.css';

const AI_MODES = [
  { id: 'explain', label: '解释', prompt: (t) => `请详细解释以下内容：\n\n"${t}"` },
  { id: 'translate-zh', label: '译中', prompt: (t) => `请翻译成中文：\n\n"${t}"` },
  { id: 'translate-en', label: '译英', prompt: (t) => `Translate into English:\n\n"${t}"` },
  { id: 'summarize', label: '总结', prompt: (t) => `请总结以下段落核心要点：\n\n"${t}"` },
  { id: 'knowledge', label: '提炼', prompt: (t) => `请提炼关键知识点：\n\n"${t}"` },
  { id: 'ask', label: '提问', prompt: (t) => `关于以下内容，请提出3个深度问题并逐一回答：\n\n"${t}"` },
];

export default function AIPanel({ selectedText, aiMode, settings, book, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contextText, setContextText] = useState('');
  const [images, setImages] = useState([]);       // [{ dataURL, name }]
  const [dragOver, setDragOver] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const initializedRef = useRef(false);

  // Load / persist history
  useEffect(() => {
    (async () => {
      if (!book || !window.electronAPI) return;
      const key = `chat-history-${sanitizeKey(book.filePath)}.json`;
      const h = await window.electronAPI.readStorage(key);
      if (h) setMessages(h);
      initializedRef.current = true;
    })();
  }, [book]);
  useEffect(() => {
    if (!initializedRef.current || !book || !window.electronAPI) return;
    window.electronAPI.writeStorage(`chat-history-${sanitizeKey(book.filePath)}.json`, messages);
  }, [messages, book]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (selectedText) setContextText(selectedText); }, [selectedText]);

  // AI mode trigger
  useEffect(() => {
    if (!aiMode || !selectedText) return;
    const mode = AI_MODES.find(m => m.id === aiMode);
    if (!mode) return;
    handleSend(mode.prompt(selectedText), mode.label, selectedText, []);
  }, [aiMode]);

  // ---- Image handling ----
  const addImages = (files) => {
    const newImages = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages(prev => [...prev, { dataURL: e.target.result, name: f.name }]);
      };
      reader.readAsDataURL(f);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) imageFiles.push(item.getAsFile());
    }
    if (imageFiles.length) {
      e.preventDefault();
      addImages(imageFiles);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    addImages(e.dataTransfer.files);
  };
  const removeImage = (idx) => setImages(prev => prev.filter((_, i) => i !== idx));

  // ---- Send message ----
  const handleSend = useCallback(async (prompt, label, ctxText, imgs) => {
    if (!settings.apiKey) { setError('请先配置 API Key'); return; }
    setLoading(true); setError('');

    const allImgs = imgs || images;
    let userContent;

    // Build content: try multimodal first, fallback to text-only if API rejects
    if (allImgs.length > 0) {
      // Try multimodal format (OpenAI-compatible)
      const parts = [{ type: 'text', text: prompt }];
      for (const img of allImgs) {
        parts.push({ type: 'image_url', image_url: { url: img.dataURL } });
      }
      userContent = parts;
    } else {
      userContent = prompt;
    }

    const userMsg = {
      role: 'user', content: userContent, displayLabel: label,
      contextText: ctxText, images: allImgs.length ? allImgs.map(i => i.dataURL) : undefined,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setImages([]);

    try {
      const response = await callAI({
        apiKey: settings.apiKey,
        apiUrl: settings.apiUrl || 'https://api.deepseek.com/chat/completions',
        model: settings.model,
        messages: [{ role: 'user', content: userContent }],
      });
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    } catch (err) {
      // If the API rejected multimodal format, retry with text-only fallback
      const retryImg = allImgs.length > 0 && err.message.includes('image_url');
      if (retryImg) {
        try {
          const textOnly = prompt + '\n\n[用户上传了 ' + allImgs.length + ' 张图片，但当前模型不支持图片输入，请提示用户切换支持多模态的模型。]';
          const response = await callAI({
            apiKey: settings.apiKey,
            apiUrl: settings.apiUrl || 'https://api.deepseek.com/chat/completions',
            model: settings.model,
            messages: [{ role: 'user', content: textOnly }],
          });
          setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
          setError('');
        } catch (e2) {
          setError(`AI 调用失败: ${e2.message}`);
        }
      } else {
        setError(`AI 调用失败: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [settings, images]);

  const submitInput = () => {
    const q = inputText.trim();
    if (!q && images.length === 0) return;
    let prompt, label = images.length > 0 ? '图片提问' : '自由提问';
    if (contextText && q) {
      prompt = `关于以下内容：\n\n"${contextText}"\n\n问题：${q}\n\n请详细回答。`;
    } else if (images.length > 0) {
      prompt = q || '请分析这张图片的内容';
    } else {
      prompt = q;
    }
    handleSend(prompt, label, contextText, images);
    setInputText('');
  };

  const quickMode = (modeId) => {
    const mode = AI_MODES.find(m => m.id === modeId);
    const text = contextText || selectedText;
    if (!text) { setError('请先在阅读区选中文字'); return; }
    handleSend(mode.prompt(text), mode.label, text, []);
  };

  const clearHistory = () => { if (confirm('确定清除全部对话历史？')) setMessages([]); };

  return (
    <div className="ai-panel-inner" onPaste={handlePaste}>
      {/* Header */}
      <div className="ai-panel-header">
        <h3>AI 助手</h3>
        <div className="ai-panel-header-actions">
          <button className="toolbar-btn" onClick={clearHistory} disabled={messages.length === 0}>清除</button>
          <button className="toolbar-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="ai-quick-actions">
        {AI_MODES.map(m => <button key={m.id} className="ai-quick-btn" onClick={() => quickMode(m.id)}>{m.label}</button>)}
      </div>

      {/* Context badge */}
      {contextText && (
        <div className="ai-context-bar">
          <span className="ai-context-label">上下文:</span>
          <span className="ai-context-text">{contextText.length > 50 ? contextText.slice(0, 50) + '...' : contextText}</span>
          <button className="ai-context-clear" onClick={() => setContextText('')}>✕</button>
        </div>
      )}

      {!settings.apiKey && <div className="ai-no-key-warning">请在设置中配置 API Key</div>}

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && !loading && <div className="ai-empty"><p>选中文字点快捷按钮，输入提问，或粘贴/拖入图片</p></div>}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ${msg.role}`}>
            <div className="ai-message-header">
              <span className="ai-message-role">{msg.role === 'user' ? '你' : 'AI'}</span>
              {msg.displayLabel && <span className="ai-message-mode">{msg.displayLabel}</span>}
              <span className="ai-message-time">{new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {msg.contextText && <div className="ai-message-context">"{msg.contextText.length > 80 ? msg.contextText.slice(0, 80) + '...' : msg.contextText}"</div>}
            {msg.images && <div className="ai-msg-images">{msg.images.map((url, j) => <img key={j} src={url} alt="uploaded" />)}</div>}
            <div className="ai-message-body">{typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '')}</div>
          </div>
        ))}
        {loading && <div className="ai-message assistant"><div className="ai-message-header"><span className="ai-message-role">AI</span></div><div className="ai-message-body"><span className="ai-typing">思考中...</span></div></div>}
        {error && <div className="ai-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="ai-img-preview-bar">
          {images.map((img, i) => (
            <div key={i} className="ai-img-thumb">
              <img src={img.dataURL} alt={img.name} />
              <button onClick={() => removeImage(i)} className="ai-img-remove">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className={`ai-input-area${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input type="file" ref={fileInputRef} hidden accept="image/*" multiple
          onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
        <button className="ai-upload-btn" onClick={() => fileInputRef.current?.click()} title="上传图片">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        </button>
        <input type="text" className="ai-input" placeholder={contextText ? '基于选中内容提问...' : '输入问题，支持粘贴/拖入图片...'}
          value={inputText} onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitInput()}
          disabled={loading || !settings.apiKey} />
        <button className="ai-send-btn" onClick={submitInput} disabled={loading || !settings.apiKey || (!inputText.trim() && images.length === 0)}>
          发送
        </button>
      </div>
    </div>
  );
}

function sanitizeKey(p) { return p.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 100); }
