/**
 * AIPanel.jsx — AI Conversation Panel (v2)
 *
 * Right sidebar. Always-visible input area.
 * Selected text shown as context badge.
 * 6 quick-mode buttons, free-form chat, history persisted.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { callAI } from '../utils/doubao';
import './AIPanel.css';

// AI Mode definitions
const AI_MODES = [
  { id: 'explain', label: '解释', prompt: (t) => `请详细解释以下内容，用通俗易懂的语言说明其含义、背景和关键概念：\n\n"${t}"` },
  { id: 'translate-zh', label: '译中', prompt: (t) => `请将以下内容翻译成地道流畅的中文：\n\n"${t}"` },
  { id: 'translate-en', label: '译英', prompt: (t) => `Translate into natural, fluent English:\n\n"${t}"` },
  { id: 'summarize', label: '总结', prompt: (t) => `请用简洁的语言总结以下段落的核心要点，控制在3-5句话以内：\n\n"${t}"` },
  { id: 'knowledge', label: '提炼', prompt: (t) => `请从以下内容中提炼出关键知识点，以要点列表呈现：\n\n"${t}"` },
  { id: 'ask', label: '提问', prompt: (t) => `关于以下内容，请提出3个有深度的问题并逐一详细回答：\n\n"${t}"` },
];

export default function AIPanel({ selectedText, aiMode, settings, book, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contextText, setContextText] = useState(''); // Currently "pinned" selected text

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const initializedRef = useRef(false);

  // ---- Load history ----
  useEffect(() => {
    async function load() {
      if (!book || !window.electronAPI) return;
      const key = `chat-history-${sanitizeKey(book.filePath)}.json`;
      const h = await window.electronAPI.readStorage(key);
      if (h) setMessages(h);
      initializedRef.current = true;
    }
    load();
  }, [book]);

  // ---- Persist history ----
  useEffect(() => {
    if (!initializedRef.current || !book || !window.electronAPI) return;
    window.electronAPI.writeStorage(`chat-history-${sanitizeKey(book.filePath)}.json`, messages);
  }, [messages, book]);

  // ---- Auto-scroll ----
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // ---- When selectedText changes, pin it as context ----
  useEffect(() => {
    if (selectedText) setContextText(selectedText);
  }, [selectedText]);

  // ---- Handle AI Mode trigger from floating bar ----
  useEffect(() => {
    if (!aiMode || !selectedText) return;
    const mode = AI_MODES.find((m) => m.id === aiMode);
    if (!mode) return;
    handleSend(mode.prompt(selectedText), mode.label, selectedText);
  }, [aiMode]);

  // ---- Send message ----
  const handleSend = useCallback(async (prompt, label, ctxText) => {
    if (!settings.apiKey) { setError('请先配置豆包 API Key'); return; }
    setLoading(true);
    setError('');

    const userMsg = { role: 'user', content: prompt, displayLabel: label, contextText: ctxText, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await callAI({
        apiKey: settings.apiKey,
        apiUrl: settings.apiUrl || 'https://api.deepseek.com/chat/completions',
        model: settings.model,
        messages: [{ role: 'user', content: prompt }],
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
    } catch (err) {
      setError(`AI 调用失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [settings]);

  // ---- Submit free-form input ----
  const submitInput = () => {
    const q = inputText.trim();
    if (!q) return;
    let prompt;
    let label = '自由提问';
    if (contextText) {
      prompt = `关于以下内容：\n\n"${contextText}"\n\n问题：${q}\n\n请详细回答。`;
    } else {
      prompt = q;
    }
    handleSend(prompt, label, contextText);
    setInputText('');
  };

  // ---- Quick mode click ----
  const quickMode = (modeId) => {
    const mode = AI_MODES.find((m) => m.id === modeId);
    const text = contextText || selectedText;
    if (!text) { setError('请先在阅读区选中一段文字'); return; }
    handleSend(mode.prompt(text), mode.label, text);
  };

  const clearHistory = () => {
    if (confirm('确定清除全部对话历史？')) setMessages([]);
  };

  return (
    <div className="ai-panel-inner">
      {/* Header */}
      <div className="ai-panel-header">
        <h3>AI 助手</h3>
        <div className="ai-panel-header-actions">
          <button className="toolbar-btn" onClick={clearHistory} disabled={messages.length === 0}>清除</button>
          <button className="toolbar-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Quick mode buttons */}
      <div className="ai-quick-actions">
        {AI_MODES.map((m) => (
          <button key={m.id} className="ai-quick-btn" onClick={() => quickMode(m.id)} title={m.label}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Context badge */}
      {contextText && (
        <div className="ai-context-bar">
          <span className="ai-context-label">上下文:</span>
          <span className="ai-context-text">
            {contextText.length > 50 ? contextText.substring(0, 50) + '...' : contextText}
          </span>
          <button className="ai-context-clear" onClick={() => setContextText('')}>✕</button>
        </div>
      )}

      {/* No key warning */}
      {!settings.apiKey && (
        <div className="ai-no-key-warning">请在设置中配置豆包 API Key</div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && !loading && (
          <div className="ai-empty">
            <p>选中左侧文字后点快捷按钮，或直接输入提问</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ${msg.role}`}>
            <div className="ai-message-header">
              <span className="ai-message-role">{msg.role === 'user' ? '你' : 'AI'}</span>
              {msg.displayLabel && <span className="ai-message-mode">{msg.displayLabel}</span>}
              <span className="ai-message-time">{new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {msg.contextText && (
              <div className="ai-message-context">"{msg.contextText.length > 80 ? msg.contextText.substring(0, 80) + '...' : msg.contextText}"</div>
            )}
            <div className="ai-message-body">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-message assistant">
            <div className="ai-message-header"><span className="ai-message-role">AI</span></div>
            <div className="ai-message-body"><span className="ai-typing">思考中...</span></div>
          </div>
        )}
        {error && <div className="ai-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area — always visible */}
      <div className="ai-input-area">
        <input
          ref={inputRef}
          type="text"
          className="ai-input"
          placeholder={contextText ? '基于选中内容提问...' : '输入你的问题...'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitInput()}
          disabled={loading || !settings.apiKey}
        />
        <button className="ai-send-btn" onClick={submitInput} disabled={loading || !settings.apiKey || !inputText.trim()}>
          发送
        </button>
      </div>
    </div>
  );
}

function sanitizeKey(p) { return p.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 100); }
