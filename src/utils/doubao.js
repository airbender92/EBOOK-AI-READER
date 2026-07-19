/**
 * ai-api.js — Multi-Provider AI API Client
 *
 * Supports: DeepSeek, Doubao (Volcengine Ark)
 * All providers use OpenAI-compatible chat/completions API.
 *
 * Usage:
 *   const response = await callAI({
 *     apiKey: 'sk-...',
 *     apiUrl: 'https://api.deepseek.com/chat/completions',
 *     model: 'deepseek-v4-pro',
 *     messages: [{ role: 'user', content: '...' }],
 *   });
 */

/**
 * Call an OpenAI-compatible Chat Completions API.
 *
 * @param {Object} params
 * @param {string} params.apiKey  - API Key
 * @param {string} params.apiUrl  - Full API endpoint URL (e.g. https://api.deepseek.com/chat/completions)
 * @param {string} params.model   - Model name or endpoint ID
 * @param {Array}  params.messages - Chat messages array
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxTokens=4096]
 * @returns {Promise<string>} The assistant's response text
 */
export async function callAI({
  apiKey,
  apiUrl,
  model = 'deepseek-v4-pro',
  messages,
  temperature = 0.7,
  maxTokens = 4096,
}) {
  if (!apiKey) throw new Error('API Key is required');
  if (!apiUrl) throw new Error('API URL is required');
  if (!messages || messages.length === 0) throw new Error('Messages array is required');

  const body = { model, messages, temperature, max_tokens: maxTokens };

  // DeepSeek V4 Pro supports thinking mode
  if (model === 'deepseek-v4-pro') {
    body.reasoning_effort = 'medium';
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMsg = `API 错误 (${response.status})`;
    try {
      const errData = await response.json();
      errorMsg = errData.error?.message || errData.error?.code || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error('API 返回空响应');
}

// Legacy alias for backward compatibility
export const callDoubaoAPI = callAI;
