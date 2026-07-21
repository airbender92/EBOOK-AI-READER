/**
 * storage.js — Data Persistence Utility
 *
 * Provides a unified API for reading/writing JSON data files
 * through the Electron IPC bridge. Falls back to localStorage
 * when running outside Electron (for development/debugging).
 */

/**
 * Read a JSON data file from persistent storage.
 * @param {string} filename - e.g. 'reading-progress.json'
 * @returns {Promise<object|null>} Parsed JSON data or null
 */
export async function readStorage(filename) {
  if (window.electronAPI) {
    return window.electronAPI.readStorage(filename);
  }
  // Fallback: localStorage for browser dev mode
  try {
    const raw = localStorage.getItem(`ebook-ai-reader__${filename}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Write a JSON data file to persistent storage.
 * @param {string} filename - e.g. 'reading-progress.json'
 * @param {object} data - JSON-serializable data
 * @returns {Promise<boolean>} Success
 */
export async function writeStorage(filename, data) {
  if (window.electronAPI) {
    return window.electronAPI.writeStorage(filename, data);
  }
  // Fallback: localStorage for browser dev mode
  try {
    localStorage.setItem(`ebook-ai-reader__${filename}`, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ===================== Specific Data Helpers =====================

/**
 * Save reading progress for a specific book.
 * @param {string} bookPath - Unique book file path
 * @param {number} page - Current page number (or scroll percentage for EPUB/TXT)
 * @param {number} totalPages - Total pages
 * @param {number|null} scrollRatio - Optional scroll ratio (0-1) for EPUB/TXT
 */
export async function saveReadingProgress(bookPath, page, totalPages, scrollRatio = null) {
  const progress = (await readStorage('reading-progress.json')) || {};
  progress[bookPath] = { page, totalPages, scrollRatio, updatedAt: Date.now() };
  return writeStorage('reading-progress.json', progress);
}

/**
 * Load reading progress for a specific book.
 * @param {string} bookPath - Unique book file path
 * @returns {Promise<{page: number, totalPages: number, scrollRatio: number|null}|null>}
 */
export async function loadReadingProgress(bookPath) {
  const progress = await readStorage('reading-progress.json');
  if (progress && progress[bookPath]) {
    return progress[bookPath];
  }
  return null;
}

/**
 * Save a chat message to the history for a specific book.
 * @param {string} bookPath - Unique book file path
 * @param {object} message - { role, content, timestamp, mode, contextText }
 */
export async function saveChatMessage(bookPath, message) {
  const key = `chat-history-${sanitizeKey(bookPath)}.json`;
  const history = (await readStorage(key)) || [];
  history.push(message);
  return writeStorage(key, history);
}

/**
 * Load chat history for a specific book.
 * @param {string} bookPath - Unique book file path
 * @returns {Promise<Array>}
 */
export async function loadChatHistory(bookPath) {
  const key = `chat-history-${sanitizeKey(bookPath)}.json`;
  return (await readStorage(key)) || [];
}

/**
 * Clear chat history for a specific book.
 */
export async function clearChatHistory(bookPath) {
  const key = `chat-history-${sanitizeKey(bookPath)}.json`;
  return writeStorage(key, []);
}

/**
 * Sanitize a file path into a valid filename for storage keys.
 */
function sanitizeKey(filePath) {
  return filePath.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').substring(0, 100);
}
