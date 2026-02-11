import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    <div className="book-card" onClick={() => onSelect(book.id)}>
        <div className="book-cover" style={
            coverUrl ? {
                backgroundImage: `url(${coverUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            } : {}
        }>
            {!coverUrl && <div className="book-title-display">{book.title}</div>}

            <div className="book-progress-overlay desktop-only">
                <div className="progress-info">
                    <span className="progress-percent">{Math.round(book.progress * 100)}%</span>
                    <span className="time-left">{timeLeft}</span>
                </div>
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${book.progress * 100}%` }}></div>
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
                <div className="progress-fill" style={{ width: `${book.progress * 100}%` }}></div>
            </div>
        </div>

        <button className="delete-btn" onClick={(e) => onDelete(e, book)} title="Delete">
            &times;
        </button>
    </div>
));

const Library: React.FC<LibraryProps> = ({ onSelectBook }) => {
    const [books, setBooks] = useState<LibraryBook[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [bookToDelete, setBookToDelete] = useState<LibraryBook | null>(null);
    const [isQuickPasteOpen, setIsQuickPasteOpen] = useState(false);
    const [quickPasteText, setQuickPasteText] = useState('');
    const [isIndexing, setIsIndexing] = useState(false);
    const [coverByBookId, setCoverByBookId] = useState<Record<string, string>>({});

    useEffect(() => {
        loadBooks();
    }, []);

    const loadBooks = async () => {
        const start = performance.now();
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
    };

    useEffect(() => {
        let cancelled = false;
        const hydrateCovers = async () => {
            const start = performance.now();
            const ids = books.filter((book) => book.hasCover).map((book) => book.id);
            if (ids.length === 0) {
                setCoverByBookId({});
                perfLog('library.cover_hydration', performance.now() - start, { withCover: 0 });
                return;
            }

            const firstBatch = ids.slice(0, 24);
            const first = await getLibraryBookCovers(firstBatch);
            if (!cancelled) {
                setCoverByBookId(first);
            }
            perfLog('library.cover_hydration_first', performance.now() - start, { firstBatch: firstBatch.length, total: ids.length });

            const remainder = ids.slice(24);
            if (remainder.length > 0) {
                setTimeout(async () => {
                    const restStart = performance.now();
                    const rest = await getLibraryBookCovers(remainder);
                    if (!cancelled) {
                        setCoverByBookId((prev) => ({ ...prev, ...rest }));
                    }
                    perfLog('library.cover_hydration_rest', performance.now() - restStart, { restCount: remainder.length });
                }, 0);
            }
        };

        void hydrateCovers();
        return () => {
            cancelled = true;
        };
    }, [books]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        try {
            // Check file type
            const isEpub = file.name.toLowerCase().endsWith('.epub');
            let content = '';
            let cover: string | undefined = undefined;

            if (isEpub) {
                const parsed = await parseEpub(file);
                content = parsed.text;
                cover = parsed.cover;
            } else {
                content = await file.text();
            }

            const newBook: Book = {
                id: Date.now().toString(),
                title: file.name.replace(/\.(epub|txt)$/i, ''),
                content: content,
                progress: 0,
                totalWords: content.trim().split(/\s+/).length,
                cover: cover,
                currentIndex: 0,
                lastRead: Date.now(),
                wpm: 300
            };

            await saveBook(newBook);
            loadBooks();
        } catch (error) {
            devError('Error reading file:', error);
            toast.error('Failed to read file.');
        } finally {
            setIsLoading(false);
            event.target.value = '';
        }
    };

    const handleDeleteClick = (e: React.MouseEvent, book: LibraryBook) => {
        e.stopPropagation();
        setBookToDelete(book);
    };

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
                            onChange={handleFileUpload}
                            disabled={isLoading}
                            className="hidden-file-input"
                        />
                    </label>
                </div>
            </div>

            <div className="books-grid">
                {books.map(book => (
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

                {books.length === 0 && !isLoading && !isIndexing && (
                    <div className="empty-state">
                        <p>No books yet. Add one to get started!</p>
                    </div>
                )}
            </div>
            {bookToDelete && (
                <div className="confirm-overlay" onClick={() => setBookToDelete(null)}>
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
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
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
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
