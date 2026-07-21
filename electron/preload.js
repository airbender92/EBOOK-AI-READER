/**
 * Preload Script — Secure Bridge between Main Process and Renderer
 *
 * Uses contextBridge to expose only the APIs the renderer needs.
 * The renderer never has direct access to Node.js or Electron APIs.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open native file dialog and read a book file.
   * Returns { fileName, filePath, format, data(base64), size } or null.
   */
  openBook: () => ipcRenderer.invoke('dialog:openBook'),

  /**
   * Re-read a book by its file path (used for reopening recent books).
   */
  readBookByPath: (filePath, fileFormat) =>
    ipcRenderer.invoke('book:readByPath', filePath, fileFormat),

  /**
   * Persistence: read a JSON data file from userData directory.
   * @param {string} filename - e.g. 'reading-progress.json'
   */
  readStorage: (filename) => ipcRenderer.invoke('storage:read', filename),

  /**
   * Persistence: write a JSON data file to userData directory.
   * @param {string} filename - e.g. 'reading-progress.json'
   * @param {object} data - JSON-serializable data
   */
  writeStorage: (filename, data) => ipcRenderer.invoke('storage:write', filename, data),

  /**
   * Copy an image (as a PNG data URL) to the system clipboard.
   * Returns true on success, false on failure.
   */
  copyImage: (dataURL) => ipcRenderer.invoke('clipboard:copyImage', dataURL),
});
