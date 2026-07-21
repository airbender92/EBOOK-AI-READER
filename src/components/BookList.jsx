/**
 * BookList.jsx — Book Selection Modal
 *
 * Shows recent books and bookmarks for quick access.
 * Click to open a book directly.
 */
import React from 'react';
import './BookList.css';

export default function BookList({ recentBooks, bookmarks, onSelectBook, onClose }) {
  /**
   * Open a recent book by re-reading from its file path.
   */
  const handleOpenRecent = async (book) => {
    if (window.electronAPI) {
      const bookData = await window.electronAPI.readBookByPath(book.filePath, book.format);
      if (bookData) {
        onSelectBook(bookData);
      }
    }
  };

  /**
   * Open a book from a bookmark.
   */
  const handleOpenBookmark = async (bookmark) => {
    if (window.electronAPI) {
      // Detect format from file extension
      const ext = bookmark.bookPath.split('.').pop().toLowerCase();
      const bookData = await window.electronAPI.readBookByPath(bookmark.bookPath, ext);
      if (bookData) {
        // Pass the bookmarked page so ReaderView can jump after the book loads
        onSelectBook({ ...bookData, initialPage: bookmark.page });
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content book-list-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h3>书库</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Recent Books */}
          <section className="book-section">
            <h4 className="book-section-title">最近阅读</h4>
            {recentBooks.length === 0 ? (
              <p className="book-empty">暂无阅读记录</p>
            ) : (
              <div className="book-list">
                {recentBooks.map((book, i) => (
                  <div
                    key={book.filePath}
                    className="book-item"
                    onClick={() => handleOpenRecent(book)}
                  >
                    <span className="book-item-icon">
                      {book.format === 'pdf' ? 'PDF' : book.format === 'epub' ? 'EPUB' : 'TXT'}
                    </span>
                    <div className="book-item-info">
                      <span className="book-item-name">{book.fileName}</span>
                      <span className="book-item-path">{book.filePath}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bookmarks */}
          <section className="book-section">
            <h4 className="book-section-title">书签</h4>
            {bookmarks.length === 0 ? (
              <p className="book-empty">暂无书签</p>
            ) : (
              <div className="book-list">
                {bookmarks.map((bm) => (
                  <div
                    key={`${bm.bookPath}-${bm.page}`}
                    className="book-item"
                    onClick={() => handleOpenBookmark(bm)}
                  >
                    <span className="book-item-icon bookmark-icon">★</span>
                    <div className="book-item-info">
                      <span className="book-item-name">{bm.bookName}</span>
                      <span className="book-item-path">
                        第 {bm.page} 页 — {new Date(bm.date).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
