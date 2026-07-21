/**
 * App.jsx — Root Application Component
 *
 * Layout: Left (Reader) | Right (AI Panel)
 * Manages global state: current book, reader settings, AI panel visibility, theme.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Toolbar from './components/Toolbar';
import ReaderView from './components/ReaderView';
import AIPanel from './components/AIPanel';
import BookList from './components/BookList';
import SettingsModal from './components/SettingsModal';
import { saveReadingProgress, loadReadingProgress } from './utils/storage';

export default function App() {
  // ===================== State =====================
  const [currentBook, setCurrentBook] = useState(null); // { fileName, filePath, format, data(base64), size }
  const [showBookList, setShowBookList] = useState(false);

  // Reader state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fontSize, setFontSize] = useState(16);
  const [darkMode, setDarkMode] = useState(false);
  const [bookmarks, setBookmarks] = useState([]); // [{ page, label, date }]
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // AI Panel state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [selectedText, setSelectedText] = useState(''); // Text selected in reader
  const [aiMode, setAiMode] = useState(null); // Current AI action mode
  const [settings, setSettings] = useState({
    provider: 'deepseek',          // 'deepseek' | 'doubao'
    apiKey: '',
    model: 'deepseek-v4-pro',     // default model for selected provider
  });
  const [showSettings, setShowSettings] = useState(false);

  // History: recent books
  const [recentBooks, setRecentBooks] = useState([]);

  // Ref to track if initial load is done
  const initialized = useRef(false);

  // ===================== Persistence =====================

  // Load settings on mount
  useEffect(() => {
    async function loadData() {
      if (window.electronAPI) {
        const savedSettings = await window.electronAPI.readStorage('settings.json');
        if (savedSettings) {
          // Migrate old model names that are no longer valid
          const OLD_MODELS = ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k', 'doubao-pro-4k'];
          if (!savedSettings.provider || OLD_MODELS.includes(savedSettings.model)) {
            savedSettings.provider = savedSettings.provider || 'deepseek';
            savedSettings.model = 'deepseek-v4-pro';
            savedSettings.apiUrl = 'https://api.deepseek.com/chat/completions';
          }
          setSettings(savedSettings);
        }

        const savedBooks = await window.electronAPI.readStorage('recent-books.json');
        if (savedBooks) setRecentBooks(savedBooks);

        const savedBookmarks = await window.electronAPI.readStorage('bookmarks.json');
        if (savedBookmarks) setBookmarks(savedBookmarks);
      }
      initialized.current = true;
    }
    loadData();
  }, []);

  // Persist settings when changed
  useEffect(() => {
    if (!initialized.current) return;
    if (window.electronAPI) {
      window.electronAPI.writeStorage('settings.json', settings);
    }
  }, [settings]);

  // Persist recent books
  useEffect(() => {
    if (!initialized.current) return;
    if (window.electronAPI) {
      window.electronAPI.writeStorage('recent-books.json', recentBooks);
    }
  }, [recentBooks]);

  // Persist bookmarks
  useEffect(() => {
    if (!initialized.current) return;
    if (window.electronAPI) {
      window.electronAPI.writeStorage('bookmarks.json', bookmarks);
    }
  }, [bookmarks]);

  // Dark mode class on body
  useEffect(() => {
    document.body.className = darkMode ? 'dark-mode' : '';
  }, [darkMode]);

  // Persist PDF reading progress when page/total changes
  useEffect(() => {
    if (!initialized.current || !currentBook) return;
    if (currentBook.format === 'pdf' && totalPages > 1) {
      saveReadingProgress(currentBook.filePath, currentPage, totalPages);
    }
  }, [currentBook, currentPage, totalPages]);

  // ===================== Book Management =====================

  /**
   * Open a book: from file dialog, recent books list, or bookmark.
   * Restores the last reading position when available.
   */
  const openBook = useCallback(async (bookData) => {
    let book = bookData;
    if (!book && window.electronAPI) {
      book = await window.electronAPI.openBook();
    }
    if (!book) return;

    // Resolve initial position: explicit bookmark page > saved progress > default 1
    let initialPage = 1;
    let initialScrollRatio = null;
    if (book.initialPage) {
      initialPage = book.initialPage;
    } else {
      const progress = await loadReadingProgress(book.filePath);
      if (progress) {
        initialPage = progress.page || 1;
        initialScrollRatio = progress.scrollRatio || null;
      }
    }

    setCurrentBook({ ...book, initialScrollRatio });
    setCurrentPage(initialPage);
    setTotalPages(1);
    setShowBookList(false);

    // Add to recent books (avoid duplicates by filePath); don't persist temp fields
    const recentEntry = { ...book };
    delete recentEntry.initialPage;
    delete recentEntry.initialScrollRatio;
    setRecentBooks((prev) => {
      const filtered = prev.filter((b) => b.filePath !== book.filePath);
      return [recentEntry, ...filtered].slice(0, 20); // Keep last 20
    });
  }, []);

  /**
   * Close the current book.
   */
  const closeBook = useCallback(() => {
    setCurrentBook(null);
    setCurrentPage(1);
    setTotalPages(1);
    setAiPanelOpen(false);
    setSelectedText('');
  }, []);

  // ===================== Keyboard Shortcuts =====================
  useEffect(() => {
    function handleKeydown(e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'o') {
          e.preventDefault();
          openBook();
        }
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [openBook]);

  // ===================== AI Action from Floating Bar =====================
  // ReaderView dispatches 'ai-action' with { mode, text, imageDataURL? } when
  // the user clicks a button in the floating toolbar. Image actions also
  // carry imageDataURL so the AI panel can actually receive the picture.
  const [pendingImage, setPendingImage] = useState(null); // data URL to inject into the AI panel
  useEffect(() => {
    function handleAIActionEvent(e) {
      const { mode, text, imageDataURL } = e.detail || {};
      setSelectedText(text);
      setAiMode(mode);
      if (imageDataURL) setPendingImage(imageDataURL);
      setAiPanelOpen(true);
    }
    window.addEventListener('ai-action', handleAIActionEvent);
    return () => window.removeEventListener('ai-action', handleAIActionEvent);
  }, []);

  // ===================== Reader Callbacks =====================

  /**
   * Called when text is selected in the reader.
   */
  const handleTextSelect = useCallback((text) => {
    if (text && text.trim().length > 0) {
      setSelectedText(text.trim());
    }
  }, []);

  /**
   * Trigger AI action when user clicks a mode button.
   */
  const handleAIAction = useCallback((mode) => {
    setAiMode(mode);
    setAiPanelOpen(true);
  }, []);

  /**
   * Handle page change from ReaderView.
   */
  const handlePageChange = useCallback((page, total) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  /**
   * Add/remove bookmark at current page.
   */
  const toggleBookmark = useCallback(() => {
    if (!currentBook) return;
    const existing = bookmarks.find(
      (b) => b.bookPath === currentBook.filePath && b.page === currentPage
    );
    if (existing) {
      setBookmarks((prev) => prev.filter((b) => b !== existing));
    } else {
      const newBookmark = {
        bookPath: currentBook.filePath,
        bookName: currentBook.fileName,
        page: currentPage,
        label: `Page ${currentPage}`,
        date: new Date().toISOString(),
      };
      setBookmarks((prev) => [...prev, newBookmark]);
    }
  }, [currentBook, currentPage, bookmarks]);

  return (
    <div className={`app-container ${darkMode ? 'dark' : ''}`}>
      {/* ===== Top Toolbar ===== */}
      <Toolbar
        currentBook={currentBook}
        currentPage={currentPage}
        totalPages={totalPages}
        darkMode={darkMode}
        fontSize={fontSize}
        zoomLevel={zoomLevel}
        aiPanelOpen={aiPanelOpen}
        onOpenBook={() => setShowBookList(true)}
        onCloseBook={closeBook}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        onFontSizeChange={setFontSize}
        onZoomChange={setZoomLevel}
        onToggleAIPanel={() => setAiPanelOpen(!aiPanelOpen)}
        onToggleBookmark={toggleBookmark}
        isBookmarked={bookmarks.some(
          (b) => b.bookPath === currentBook?.filePath && b.page === currentPage
        )}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* ===== Main Content Area ===== */}
      <div className="main-content">
        {/* ---- Left: Reader ---- */}
        <div className={`reader-panel ${aiPanelOpen ? 'with-ai' : 'full'}`}>
          {currentBook ? (
            <ReaderView
              book={currentBook}
              fontSize={fontSize}
              darkMode={darkMode}
              zoomLevel={zoomLevel}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              onTextSelect={handleTextSelect}
              bookmarks={bookmarks}
            />
          ) : (
            <div className="welcome-screen">
              <div className="welcome-content">
                <div className="welcome-icon">📖</div>
                <h1>eBook AI Reader</h1>
                <p>AI 驱动的智能电子书阅读器</p>
                <div className="welcome-actions">
                  <button className="btn-primary" onClick={() => openBook()}>
                    打开电子书
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowBookList(true)}
                  >
                    最近阅读
                  </button>
                </div>
                <p className="welcome-hint">支持 PDF / EPUB / TXT 格式 | Ctrl+O 快速打开</p>
              </div>
            </div>
          )}
        </div>

        {/* ---- Right: AI Panel ---- */}
        {aiPanelOpen && (
          <div className="ai-panel">
            <AIPanel
              selectedText={selectedText}
              aiMode={aiMode}
              settings={settings}
              book={currentBook}
              currentPage={currentPage}
              pendingImage={pendingImage}
              onPendingImageConsumed={() => setPendingImage(null)}
              onClose={() => setAiPanelOpen(false)}
            />
          </div>
        )}
      </div>

      {/* ===== Book List Modal ===== */}
      {showBookList && (
        <BookList
          recentBooks={recentBooks}
          bookmarks={bookmarks}
          onSelectBook={openBook}
          onClose={() => setShowBookList(false)}
        />
      )}

      {/* ===== Settings Modal ===== */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
