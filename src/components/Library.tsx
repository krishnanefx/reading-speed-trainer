import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBookCount, getLibraryBookCovers, getLibraryBooks, rebuildLibraryBookIndex, saveBook, deleteBook } from '../utils/db';
import type { Book, LibraryBook } from '../utils/db';
import { parseEpub } from '../utils/fileHelpers';
import { toast } from 'react-hot-toast';
import { devError } from '../utils/logger';
import { perfLog } from '../utils/perf';
import './Library.css';

interface LibraryProps {
    onSelectBook: (bookId: string) => void | Promise<void>;
}

interface BookCardProps {
    book: LibraryBook;
    coverUrl?: string;
    timeLeft: string;
    onSelect: (bookId: string) => void | Promise<void>;
    onDelete: (e: React.MouseEvent, book: LibraryBook) => void;
}

const BookCard = React.memo(({ book, coverUrl, timeLeft, onSelect, onDelete }: BookCardProps) => (
    <div
        className="book-card"
        onClick={() => onSelect(book.id)}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void onSelect(book.id);
            }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Open ${book.title}`}
    >
        <div className="book-cover">
            {coverUrl && <img className="book-cover-image" src={coverUrl} alt="" loading="lazy" />}
            {!coverUrl && <div className="book-title-display">{book.title}</div>}

            <div className="book-progress-overlay desktop-only">
                <div className="progress-info">
                    <span className="progress-percent">{Math.round(book.progress * 100)}%</span>
                    <span className="time-left">{timeLeft}</span>
                </div>
                <div className="progress-bar">
                    <progress className="progress-fill progress-native" max={1} value={book.progress}></progress>
                </div>
            </div>
        </div>

        <div className="book-info-mobile">
            <div className="book-title-mobile">{book.title}</div>
            <div className="book-meta-mobile">
                <span className="progress-percent">{Math.round(book.progress * 100)}%</span>
                <span className="time-left">{timeLeft}</span>
            </div>
            <div className="progress-bar">
                <progress className="progress-fill progress-native" max={1} value={book.progress}></progress>
            </div>
        </div>

        <button className="delete-btn" onClick={(e) => onDelete(e, book)} title="Delete" aria-label={`Delete ${book.title}`}>
            &times;
        </button>
    </div>
));

const Library: React.FC<LibraryProps> = ({ onSelectBook }) => {
    const [books, setBooks] = useState<LibraryBook[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [bookToDelete, setBookToDelete] = useState<LibraryBook | null>(null);
    const [isQuickPasteOpen, setIsQuickPasteOpen] = useState(false);
    const [quickPasteText, setQuickPasteText] = useState('');
    const [isIndexing, setIsIndexing] = useState(false);
    const [coverByBookId, setCoverByBookId] = useState<Record<string, string>>({});
    const [importStatus, setImportStatus] = useState<string>('');
    const [visibleCount, setVisibleCount] = useState(42);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const requestedCoverIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        void loadBooks(true);
    }, []);

    const loadBooks = async (initial = false) => {
        if (initial) setIsInitialLoading(true);
        const start = performance.now();
        try {
            const loadedBooks = await getLibraryBooks();
            perfLog('library.meta_load', performance.now() - start, { count: loadedBooks.length });
            if (loadedBooks.length === 0) {
                const bookCount = await getBookCount();
                if (bookCount === 0) {
                    setBooks([]);
                    perfLog('library.initial_render', performance.now() - start, { count: 0 });
                    return;
                }
                setIsIndexing(true);
                const rebuildStart = performance.now();
                await rebuildLibraryBookIndex();
                perfLog('library.index_rebuild', performance.now() - rebuildStart, { bookCount });
                const rebuiltBooks = await getLibraryBooks();
                setBooks(rebuiltBooks.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0)));
                setIsIndexing(false);
                perfLog('library.initial_render', performance.now() - start, { count: rebuiltBooks.length });
                return;
            }
            setBooks(loadedBooks.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0)));
            perfLog('library.initial_render', performance.now() - start, { count: loadedBooks.length });
        } finally {
            if (initial) setIsInitialLoading(false);
        }
    };

    useEffect(() => {
        setVisibleCount(42);
    }, [books.length]);

    useEffect(() => {
        requestedCoverIdsRef.current.clear();
        setCoverByBookId({});
    }, [books]);

    const visibleBooks = useMemo(() => books.slice(0, visibleCount), [books, visibleCount]);

    useEffect(() => {
        let cancelled = false;
        const hydrateVisibleCovers = async () => {
            const allVisibleCoverIds = visibleBooks
                .filter((book) => book.hasCover)
                .map((book) => book.id);
            if (allVisibleCoverIds.length === 0) return;

            const missingIds = allVisibleCoverIds.filter((id) => {
                if (coverByBookId[id]) return false;
                if (requestedCoverIdsRef.current.has(id)) return false;
                return true;
            });
            if (missingIds.length === 0) return;

            for (const id of missingIds) requestedCoverIdsRef.current.add(id);
            const start = performance.now();
            const batchSize = 24;
            for (let index = 0; index < missingIds.length; index += batchSize) {
                const batch = missingIds.slice(index, index + batchSize);
                const covers = await getLibraryBookCovers(batch);
                if (cancelled) return;
                setCoverByBookId((prev) => ({ ...prev, ...covers }));
            }
            perfLog('library.cover_hydration_visible', performance.now() - start, {
                requested: missingIds.length,
                visible: visibleBooks.length
            });
        };

        void hydrateVisibleCovers();
        return () => {
            cancelled = true;
        };
    }, [visibleBooks, coverByBookId]);

    useEffect(() => {
        if (visibleCount >= books.length) return;
        const sentinel = loadMoreRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setVisibleCount((prev) => Math.min(prev + 24, books.length));
            }
        }, { rootMargin: '300px 0px' });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [visibleCount, books.length]);

    const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        const importToastId = 'library-import-progress';
        setIsLoading(true);
        setImportStatus('Preparing import...');
        toast.loading(`Importing ${files.length} file${files.length > 1 ? 's' : ''}...`, { id: importToastId });

        try {
            for (let index = 0; index < files.length; index += 1) {
                const file = files[index];
                const isEpub = file.name.toLowerCase().endsWith('.epub');
                let content = '';
                let cover: string | undefined;
                const prefix = `(${index + 1}/${files.length})`;

                if (isEpub) {
                    const parsed = await parseEpub(file, {
                        onProgress: (processed, total) => {
                            const status = `${prefix} Parsing EPUB ${processed}/${total}: ${file.name}`;
                            setImportStatus(status);
                            toast.loading(status, { id: importToastId });
                        }
                    });
                    content = parsed.text;
                    cover = parsed.cover;
                } else {
                    const status = `${prefix} Reading text: ${file.name}`;
                    setImportStatus(status);
                    toast.loading(status, { id: importToastId });
                    content = await file.text();
                }

                const now = Date.now();
                const newBook: Book = {
                    id: `${now}-${index}`,
                    title: file.name.replace(/\.(epub|txt)$/i, ''),
                    content,
                    progress: 0,
                    totalWords: content.trim().split(/\s+/).length,
                    cover,
                    currentIndex: 0,
                    lastRead: now,
                    wpm: 300
                };

                await saveBook(newBook);
                await pause(30);
            }

            await loadBooks();
            toast.success(`Imported ${files.length} file${files.length > 1 ? 's' : ''}.`, { id: importToastId });
        } catch (error) {
            devError('Error reading file:', error);
            toast.error('Failed to import one or more files.', { id: importToastId });
        } finally {
            setIsLoading(false);
            setImportStatus('');
            event.target.value = '';
        }
    };

    const handleDeleteClick = useCallback((e: React.MouseEvent, book: LibraryBook) => {
        e.stopPropagation();
        setBookToDelete(book);
    }, []);

    const handleConfirmDelete = async () => {
        if (!bookToDelete) return;
        await deleteBook(bookToDelete.id);
        toast.success(`Deleted "${bookToDelete.title}"`);
        setBookToDelete(null);
        await loadBooks();
    };

    const handleQuickPasteSubmit = async () => {
        if (!quickPasteText.trim()) {
            toast.error('Paste text before saving.');
            return;
        }

        setIsLoading(true);
        try {
            const newBook: Book = {
                id: Date.now().toString(),
                title: `Quick Read ${new Date().toLocaleTimeString()}`,
                content: quickPasteText,
                progress: 0,
                totalWords: quickPasteText.trim().split(/\s+/).length,
                currentIndex: 0,
                lastRead: Date.now(),
                wpm: 300
            };
            await saveBook(newBook);
            await loadBooks();
            setQuickPasteText('');
            setIsQuickPasteOpen(false);
            toast.success('Quick read saved.');
        } catch {
            toast.error('Failed to save quick read.');
        } finally {
            setIsLoading(false);
        }
    };

    const getEstimatedTimeLeft = useCallback((book: LibraryBook) => {
        const totalWords = book.totalWords || 0;
        const wordsLeft = Math.max(0, totalWords - (book.currentIndex || 0));

        if (wordsLeft === 0) return 'Finished';

        const speed = book.wpm || 300;
        const minutesLeft = Math.ceil(wordsLeft / speed);

        if (minutesLeft < 60) {
            return `${minutesLeft} min left`;
        } else {
            const hours = Math.floor(minutesLeft / 60);
            const mins = minutesLeft % 60;
            return `${hours}h ${mins}m left`;
        }
    }, []);

    const timeLeftByBookId = useMemo(() => {
        const result = new Map<string, string>();
        for (const book of books) {
            result.set(book.id, getEstimatedTimeLeft(book));
        }
        return result;
    }, [books, getEstimatedTimeLeft]);

    return (
        <div className="library-container">
            <div className="library-header">
                <h2>Your Library</h2>
                <div className="action-buttons">
                    <button
                        className="btn-upload btn-secondary"
                        onClick={() => setIsQuickPasteOpen(true)}
                        disabled={isLoading}
                    >
                        📋 Paste
                    </button>
                    <label className={`btn-upload ${isLoading ? 'loading' : ''}`}>
                        {isLoading ? 'Adding...' : '+ Add Book'}
                        <input
                            type="file"
                            accept=".txt,.epub"
                            multiple
                            onChange={handleFileUpload}
                            disabled={isLoading}
                            className="hidden-file-input"
                        />
                    </label>
                </div>
            </div>
            {importStatus && (
                <div className="empty-state">
                    <p>{importStatus}</p>
                </div>
            )}

            <div className="books-grid">
                {isInitialLoading && (
                    <>
                        {Array.from({ length: 6 }).map((_, idx) => (
                            <div key={`book-skeleton-${idx}`} className="book-card skeleton-card" aria-hidden="true">
                                <div className="book-cover skeleton-shimmer"></div>
                            </div>
                        ))}
                    </>
                )}
                {visibleBooks.map(book => (
                    <BookCard
                        key={book.id}
                        book={book}
                        coverUrl={coverByBookId[book.id]}
                        timeLeft={timeLeftByBookId.get(book.id) || ''}
                        onSelect={onSelectBook}
                        onDelete={handleDeleteClick}
                    />
                ))}

                {isIndexing && (
                    <div className="empty-state">
                        <p>Optimizing library index...</p>
                    </div>
                )}

                {books.length === 0 && !isLoading && !isIndexing && !isInitialLoading && (
                    <div className="empty-state">
                        <p>No books yet. Add one to get started!</p>
                    </div>
                )}
                {visibleCount < books.length && (
                    <div ref={loadMoreRef} className="books-load-more" aria-hidden="true" />
                )}
            </div>
            {bookToDelete && (
                <div className="confirm-overlay" onClick={() => setBookToDelete(null)}>
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete book confirmation">
                        <h3>Delete Book</h3>
                        <p>Delete "{bookToDelete.title}" from your library?</p>
                        <div className="confirm-actions">
                            <button className="btn-upload btn-secondary" onClick={() => setBookToDelete(null)}>Cancel</button>
                            <button className="btn-upload" onClick={handleConfirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
            {isQuickPasteOpen && (
                <div className="confirm-overlay" onClick={() => setIsQuickPasteOpen(false)}>
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Quick paste text">
                        <h3>Quick Paste</h3>
                        <textarea
                            value={quickPasteText}
                            onChange={(e) => setQuickPasteText(e.target.value)}
                            placeholder="Paste text to create a new quick-read entry"
                            rows={8}
                        />
                        <div className="confirm-actions">
                            <button className="btn-upload btn-secondary" onClick={() => setIsQuickPasteOpen(false)}>Cancel</button>
                            <button className="btn-upload" onClick={handleQuickPasteSubmit}>Save</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Library;
