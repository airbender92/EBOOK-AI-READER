/**
 * Electron Main Process
 * Handles window creation, native file dialogs, and IPC communication.
 * All Node.js APIs are centralized here — the renderer only gets what preload exposes.
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

// ===================== Custom Protocol =====================
// Register before app ready to serve dist/ files with proper MIME types.
// This is required for module workers (.mjs) to work in Electron.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// Ensure user data directory exists
const DATA_DIR = path.join(app.getPath('userData'), 'ebook-ai-reader-data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DIST_DIR = path.join(__dirname, '..', 'dist');

// MIME type map
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'eBook AI Reader',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,  // Security: isolate renderer from Node
      nodeIntegration: false,  // Security: disable Node in renderer
      sandbox: false,          // Needed for preload to use Node APIs
    },
    // Custom protocol requires a URL, not a file path
    backgroundColor: '#ffffff',
    show: false,
  });

  // Load via custom protocol (app://) which supports module workers
  mainWindow.loadURL('app://index.html');

  // Show window when ready (avoids flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Build application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Book...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenBook(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Open native file dialog and read the selected book file.
 * Returns book metadata + raw buffer to renderer via IPC.
 */
async function handleOpenBook() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open eBook',
    filters: [
      { name: 'eBooks', extensions: ['pdf', 'epub', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return;

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  try {
    const buffer = fs.readFileSync(filePath);
    // Send file data to renderer as base64 (safe across IPC)
    const base64Data = buffer.toString('base64');

    mainWindow.webContents.send('book-opened', {
      fileName,
      filePath,
      format: ext.replace('.', ''),
      data: base64Data,
      size: buffer.length,
    });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

// ===================== IPC Handlers =====================

/**
 * Native file open dialog (triggered from renderer)
 */
ipcMain.handle('dialog:openBook', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open eBook',
    filters: [
      { name: 'eBooks', extensions: ['pdf', 'epub', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  try {
    const buffer = fs.readFileSync(filePath);
    return {
      fileName,
      filePath,
      format: ext.replace('.', ''),
      data: buffer.toString('base64'),
      size: buffer.length,
    };
  } catch (err) {
    throw new Error(`Failed to open file: ${err.message}`);
  }
});

/**
 * Read a JSON data file from userData directory.
 * Used for persistence: reading-progress, chat-history, bookmarks, settings.
 */
ipcMain.handle('storage:read', async (_event, filename) => {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`storage:read error for ${filename}:`, err.message);
    return null;
  }
});

/**
 * Write a JSON data file to userData directory.
 */
ipcMain.handle('storage:write', async (_event, filename, data) => {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`storage:write error for ${filename}:`, err.message);
    return false;
  }
});

/**
 * Read a book file by path (for re-opening recent books).
 * Returns base64-encoded data + metadata.
 */
ipcMain.handle('book:readByPath', async (_event, filePath, fileFormat) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return {
      fileName: path.basename(filePath),
      filePath,
      format: fileFormat,
      data: buffer.toString('base64'),
      size: buffer.length,
    };
  } catch (err) {
    console.error(`book:readByPath error:`, err.message);
    return null;
  }
});

// ===================== App Lifecycle =====================

app.whenReady().then(() => {
  // Register custom protocol to serve dist/ files with proper MIME types.
  // This enables module workers (.mjs) and fetch API in the renderer.
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let filePath = path.join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname);

    // Default to index.html for SPA routing
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    return net.fetch(`file:///${filePath.replace(/\\/g, '/')}`).then((response) => {
      // Override MIME type to ensure .mjs files are served correctly
      return new Response(response.body, {
        status: response.status,
        headers: {
          'content-type': mimeType,
          'access-control-allow-origin': '*',
        },
      });
    });
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
