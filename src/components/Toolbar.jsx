/**
 * Toolbar.jsx — Top Application Toolbar
 *
 * Provides access to core actions:
 * - Open/close book
 * - Page navigation (prev/next/jump)
 * - Dark mode toggle
 * - Font size adjustment
 * - Zoom control (for PDF)
 * - AI panel toggle
 * - Bookmark toggle
 * - Settings
 */
import React, { useState } from 'react';

export default function Toolbar({
  currentBook,
  currentPage,
  totalPages,
  darkMode,
  fontSize,
  zoomLevel,
  aiPanelOpen,
  onOpenBook,
  onCloseBook,
  onToggleDarkMode,
  onFontSizeChange,
  onZoomChange,
  onToggleAIPanel,
  onToggleBookmark,
  isBookmarked,
  onOpenSettings,
}) {
  const [pageInput, setPageInput] = useState('');

  /**
   * Jump to a specific page number.
   */
  const handlePageJump = () => {
    const page = parseInt(pageInput, 10);
    if (page >= 1 && page <= totalPages) {
      // Dispatch page change event via a custom event that ReaderView listens to
      window.dispatchEvent(
        new CustomEvent('jump-to-page', { detail: page })
      );
      setPageInput('');
    }
  };

  /**
   * Navigate pages — use custom events to communicate with ReaderView.
   */
  const goToPage = (delta) => {
    window.dispatchEvent(
      new CustomEvent('navigate-page', { detail: delta })
    );
  };

  return (
    <div className="toolbar">
      {/* ===== Book Operations ===== */}
      <button className="toolbar-btn" onClick={onOpenBook} title="打开电子书 (Ctrl+O)">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3.5l-6-2v11l6 2 6-2v-11l-6 2zM3 3.2l4 1.33v9.27l-4-1.33V3.2zm10 9.27l-4 1.33V4.53l4-1.33v9.27z"/>
        </svg>
        打开
      </button>

      {currentBook && (
        <button className="toolbar-btn" onClick={onCloseBook} title="关闭当前书籍">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
          </svg>
        </button>
      )}

      <div className="toolbar-separator" />

      {/* ===== Book Title ===== */}
      {currentBook && (
        <span className="toolbar-book-title">{currentBook.fileName}</span>
      )}

      <div className="toolbar-spacer" />

      {/* ===== Page Navigation ===== */}
      {currentBook && (
        <>
          <button className="toolbar-btn" onClick={() => goToPage(-1)} title="上一页">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.354 1.646a.5.5 0 010 .708L5.707 8l5.647 5.646a.5.5 0 01-.708.708l-6-6a.5.5 0 010-.708l6-6a.5.5 0 01.708 0z"/>
            </svg>
          </button>

          <span className="toolbar-page-info">
            <input
              type="text"
              className="page-input"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump()}
              placeholder={String(currentPage)}
              style={{ width: '36px', textAlign: 'center' }}
            />
            {' / '}
            {totalPages}
          </span>

          <button className="toolbar-btn" onClick={() => goToPage(1)} title="下一页">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 1.646a.5.5 0 01.708 0l6 6a.5.5 0 010 .708l-6 6a.5.5 0 01-.708-.708L10.293 8 4.646 2.354a.5.5 0 010-.708z"/>
            </svg>
          </button>

          <div className="toolbar-separator" />
        </>
      )}

      {/* ===== Font Size ===== */}
      {currentBook && (
        <>
          <button
            className="toolbar-btn"
            onClick={() => onFontSizeChange(Math.max(10, fontSize - 2))}
            title="缩小字体"
          >
            A-
          </button>
          <span className="toolbar-page-info">{fontSize}px</span>
          <button
            className="toolbar-btn"
            onClick={() => onFontSizeChange(Math.min(32, fontSize + 2))}
            title="放大字体"
          >
            A+
          </button>
          <div className="toolbar-separator" />
        </>
      )}

      {/* ===== Zoom (PDF only) ===== */}
      {currentBook?.format === 'pdf' && (
        <>
          <button
            className="toolbar-btn"
            onClick={() => onZoomChange(Math.max(0.5, +(zoomLevel - 0.1).toFixed(1)))}
            title="缩小"
          >
            -
          </button>
          <span className="toolbar-page-info">{Math.round(zoomLevel * 100)}%</span>
          <button
            className="toolbar-btn"
            onClick={() => onZoomChange(Math.min(3.0, +(zoomLevel + 0.1).toFixed(1)))}
            title="放大"
          >
            +
          </button>
          <div className="toolbar-separator" />
        </>
      )}

      {/* ===== Bookmark ===== */}
      {currentBook && (
        <button
          className={`toolbar-btn ${isBookmarked ? 'active' : ''}`}
          onClick={onToggleBookmark}
          title={isBookmarked ? '取消书签' : '添加书签'}
        >
          <svg viewBox="0 0 16 16" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2v13.5l6-3 6 3V2a1 1 0 00-1-1H3a1 1 0 00-1 1z"/>
          </svg>
        </button>
      )}

      {/* ===== Dark Mode ===== */}
      <button
        className={`toolbar-btn ${darkMode ? 'active' : ''}`}
        onClick={onToggleDarkMode}
        title={darkMode ? '切换到日间模式' : '切换到夜间模式'}
      >
        {darkMode ? (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z"/>
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12a4 4 0 100-8 4 4 0 000 8zM8 0a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 0zm0 13a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 13zm8-5a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2a.5.5 0 01.5.5zM3 8a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2A.5.5 0 013 8zm10.657-5.657a.5.5 0 010 .707l-1.414 1.415a.5.5 0 11-.707-.708l1.414-1.414a.5.5 0 01.707 0zm-9.193 9.193a.5.5 0 010 .707L3.05 13.657a.5.5 0 01-.707-.707l1.414-1.414a.5.5 0 01.707 0zm9.193 2.121a.5.5 0 01-.707 0l-1.414-1.414a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 010 .707zM4.464 4.465a.5.5 0 01-.707 0L2.343 3.05a.5.5 0 11.707-.707l1.414 1.414a.5.5 0 010 .708z"/>
          </svg>
        )}
      </button>

      {/* ===== AI Panel Toggle ===== */}
      {currentBook && (
        <button
          className={`toolbar-btn ${aiPanelOpen ? 'active' : ''}`}
          onClick={onToggleAIPanel}
          title={aiPanelOpen ? '关闭 AI 面板' : '打开 AI 面板'}
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a1 1 0 011 1v1.5a.5.5 0 01-1 0V2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1v-1.5a.5.5 0 011 0V13a2 2 0 01-2 2H4a2 2 0 01-2-2V3a2 2 0 012-2h4z"/>
            <path d="M11.854 5.146a.5.5 0 010 .708l-3 3a.5.5 0 01-.708-.708l3-3a.5.5 0 01.708 0z"/>
            <path d="M9.5 5h2a.5.5 0 01.5.5v2a.5.5 0 01-1 0V6h-1.5a.5.5 0 010-1z"/>
          </svg>
          AI
        </button>
      )}

      {/* ===== Settings ===== */}
      <button className="toolbar-btn" onClick={onOpenSettings} title="设置">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 01-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 01.872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 012.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 012.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 01.872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 01-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 01-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 100-5.86 2.929 2.929 0 000 5.86z"/>
        </svg>
      </button>
    </div>
  );
}
