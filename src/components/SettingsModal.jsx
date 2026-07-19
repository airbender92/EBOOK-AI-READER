/**
 * SettingsModal.jsx — Application Settings Dialog (v3)
 *
 * Supports multiple AI providers: DeepSeek, Doubao (Volcengine Ark)
 * Each provider has its own API endpoint and model list.
 */
import React, { useState, useMemo } from 'react';

// Provider configurations
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/chat/completions',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (推荐)' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (快速)' },
    ],
  },
  doubao: {
    name: '豆包 (火山方舟)',
    apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    models: [
      { id: 'doubao-seed-2-1-pro-260628', label: 'Seed 2.1 Pro (256K)' },
      { id: 'doubao-seed-2-1-turbo-260628', label: 'Seed 2.1 Turbo (快速)' },
      { id: 'doubao-seed-2-0-pro-260215', label: 'Seed 2.0 Pro' },
      { id: 'doubao-seed-evolving', label: 'Seed Evolving (迭代)' },
      { id: '__custom__', label: '自定义接入点 ID (ep-xxx)...' },
    ],
  },
};

export default function SettingsModal({ settings, onSave, onClose }) {
  const [provider, setProvider] = useState(settings.provider || 'deepseek');
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [model, setModel] = useState(settings.model || 'deepseek-v4-pro');
  const [customModel, setCustomModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  const prov = PROVIDERS[provider];

  // When switching provider, reset model to first of that provider
  const handleProviderChange = (p) => {
    setProvider(p);
    const firstModel = PROVIDERS[p].models[0].id;
    setModel(firstModel === '__custom__' ? PROVIDERS[p].models[1].id : firstModel);
    setCustomModel('');
  };

  const actualModel = model === '__custom__' ? customModel.trim() : model;

  const handleSave = () => {
    if (!actualModel) return;
    onSave({
      provider,
      apiKey: apiKey.trim(),
      model: actualModel,
      apiUrl: prov.apiUrl,  // store the API URL so client doesn't need provider mapping
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>AI 设置</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Provider Selection */}
          <div className="form-group">
            <label>AI 提供商</label>
            <div className="provider-tabs">
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  className={`provider-tab ${provider === key ? 'active' : ''}`}
                  onClick={() => handleProviderChange(key)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="form-group">
            <label>API Key</label>
            <div className="api-key-input">
              <input
                type={showKey ? 'text' : 'password'}
                className="form-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'deepseek' ? 'sk-...' : '从方舟控制台获取'}
              />
              <button className="toolbar-btn" onClick={() => setShowKey(!showKey)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="form-hint">
              获取 Key: <a href={prov.keyUrl} target="_blank">{prov.keyUrl}</a>
            </p>
          </div>

          {/* Model Selection */}
          <div className="form-group">
            <label>模型</label>
            <select className="form-select" value={model} onChange={(e) => setModel(e.target.value)}>
              {prov.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            {model === '__custom__' && (
              <div style={{ marginTop: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="输入接入点 ID，如 ep-2025xxxxxxxx"
                />
              </div>
            )}
            <p className="form-hint">
              当前 API: {prov.apiUrl}
            </p>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={handleSave}>保存设置</button>
          </div>
        </div>
      </div>
    </div>
  );
}
