import React, { useEffect, useState } from 'react';
import { getBooks, saveBook, deleteBook } from '../utils/db';
import type { Book } from '../utils/db';
import { parseEpub } from '../utils/fileHelpers';

interface LibraryProps {
    onSelectBook: (book: Book) => void;
}

const Library: React.FC<LibraryProps> = ({ onSelectBook }) => {
    const [books, setBooks] = useState<Book[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadBooks();
    }, []);

    const loadBooks = async () => {
        const loadedBooks = await getBooks();
        setBooks(loadedBooks.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0)));
    };

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
            console.error('Error reading file:', error);
            alert('Failed to read file');
        } finally {
            setIsLoading(false);
            event.target.value = '';
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this book?')) {
            await deleteBook(id);
            loadBooks();
        }
    };

    const getEstimatedTimeLeft = (book: Book) => {
        const textContent = book.content || book.text;
        if (!textContent) return '';
        // totalWords is now a field on Book, but fall back to calculating if missing (legacy)
        const totalWords = book.totalWords || textContent.trim().split(/\s+/).length;
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
    };

    return (
        <div className="library-container">
            <div className="library-header">
                <h2>Your Library</h2>
                <div className="action-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className="btn-upload btn-secondary"
                        onClick={async () => {
                            const text = prompt("Paste your text here to speed read immediately:");
                            if (text && text.trim().length > 0) {
                                setIsLoading(true);
                                try {
                                    const newBook: Book = {
                                        id: Date.now().toString(),
                                        title: `Quick Read ${new Date().toLocaleTimeString()}`,
                                        content: text,
                                        progress: 0,
                                        totalWords: text.trim().split(/\s+/).length,
                                        currentIndex: 0,
                                        lastRead: Date.now(),
                                        wpm: 300
                                    };
                                    await saveBook(newBook);
                                    await loadBooks();
                                } catch (e) {
                                    alert("Failed to save text");
                                } finally {
                                    setIsLoading(false);
                                }
                            }
                        }}
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
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>
            </div>

            <div className="books-grid">
                {books.map(book => (
                    <div key={book.id} className="book-card" onClick={() => onSelectBook(book)}>
                        <div className="book-cover" style={
                            book.cover ? {
                                backgroundImage: `url(${book.cover})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat'
                            } : {}
                        }>
                            {/* Only show title text if no cover image */}
                            {!book.cover && <div className="book-title-display">{book.title}</div>}

                            <div className="book-progress-overlay">
                                <div className="progress-info">
                                    <span className="progress-percent">{Math.round(book.progress * 100)}%</span>
                                    <span className="time-left">{getEstimatedTimeLeft(book)}</span>
                                </div>
                                <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${book.progress * 100}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <button className="delete-btn" onClick={(e) => handleDelete(e, book.id)} title="Delete">
                            &times;
                        </button>
                    </div>
                ))}

                {books.length === 0 && !isLoading && (
                    <div className="empty-state">
                        <p>No books yet. Add one to get started!</p>
                    </div>
                )}
            </div>

            <style>{`
        .library-container {
            width: 100%;
            max-width: 1000px;
            margin: 0 auto;
            padding: 1rem;
        }

        .library-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
        }

        .library-header h2 {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--color-text);
            margin: 0;
        }

        .btn-upload {
            background: var(--color-primary);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: var(--radius-full);
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition-normal);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
        }

        .btn-upload.btn-secondary {
            background: rgba(255,255,255,0.1);
            box-shadow: none;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .btn-upload.btn-secondary:hover {
            background: rgba(255,255,255,0.2);
            transform: translateY(-2px);
        }

        .btn-upload:hover {
            background: var(--color-primary-hover);
            transform: translateY(-2px);
        }

        .btn-upload.loading {
            opacity: 0.7;
            cursor: wait;
        }

        .books-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 2rem;
        }

        .book-card {
            background: var(--color-surface);
            border-radius: var(--radius-md);
            border: 1px solid rgba(255,255,255,0.1);
            overflow: hidden;
            cursor: pointer;
            transition: var(--transition-normal);
            position: relative;
            aspect-ratio: 2/3;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            group: 'card'; 
        }

        .book-card:hover {
            transform: scale(1.05);
            border-color: rgba(255,255,255,0.3);
            box-shadow: 0 10px 20px rgba(0,0,0,0.4);
            z-index: 1;
        }

        .book-cover {
            flex: 1;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%);
            text-align: center;
            position: relative;
        }
        
        /* Ensure text shadow for readability if appearing over images */
        .book-title-display {
            font-size: 1.1rem;
            font-weight: 700;
            line-height: 1.4;
            max-height: 50%;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 4;
            -webkit-box-orient: vertical;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        }

        .book-progress-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 1rem;
            background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%);
        }

        .progress-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
            font-size: 0.75rem;
            color: rgba(255,255,255,0.8);
            font-weight: 500;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }
        
        .time-left {
            color: var(--color-accent);
        }

        .progress-bar {
            height: 4px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 0.25rem;
        }

        .progress-fill {
            height: 100%;
            background: var(--color-primary);
        }
        
        .delete-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(0,0,0,0.5);
            color: white;
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            line-height: 24px;
            text-align: center;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 10;
        }
        
        .book-card:hover .delete-btn {
            opacity: 1;
        }
        
        .delete-btn:hover {
            background: red;
        }

        .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 4rem;
            color: var(--color-text-secondary);
            border: 2px dashed rgba(255,255,255,0.1);
            border-radius: var(--radius-lg);
        }
      `}</style>
        </div>
    );
};

export default Library;
