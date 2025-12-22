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
            padding-bottom: 5rem; /* Space for bottom nav or just aesthetics */
        }

        .library-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            flex-wrap: wrap; /* Allow wrapping on very small screens */
            gap: 1rem;
        }

        .library-header h2 {
            font-size: 1.75rem;
            font-weight: 800;
            color: var(--color-text);
            margin: 0;
            letter-spacing: -0.02em;
        }

        .btn-upload {
            background: var(--color-primary);
            color: white;
            padding: 0.75rem 1.25rem;
            border-radius: var(--radius-full);
            font-weight: 600;
            cursor: pointer;
            transition: var(--transition-normal);
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            font-size: 0.95rem;
            gap: 0.5rem;
        }

        .btn-upload.btn-secondary {
            background: rgba(255,255,255,0.08);
            box-shadow: none;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .btn-upload.btn-secondary:hover {
            background: rgba(255,255,255,0.15);
        }

        .btn-upload:hover {
            background: var(--color-primary-hover);
            transform: translateY(-2px);
        }

        .books-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 2rem;
            animation: fadeIn 0.4s ease-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .book-card {
            background: var(--color-surface);
            border-radius: var(--radius-md);
            border: 1px solid rgba(255,255,255,0.1);
            overflow: hidden;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
            position: relative;
            aspect-ratio: 2/3;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        }

        .book-card:hover {
            transform: translateY(-5px);
            border-color: rgba(255,255,255,0.3);
            box-shadow: 0 12px 24px rgba(0,0,0,0.4);
            z-index: 10;
        }

        .book-cover {
            flex: 1;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: radial-gradient(circle at center, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%);
            text-align: center;
            position: relative;
        }
        
        .book-title-display {
            font-size: 1.1rem;
            font-weight: 700;
            line-height: 1.4;
            max-height: 3.5em; /* limit to 3 lines roughl */
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            text-shadow: 0 2px 8px rgba(0,0,0,0.6);
            padding: 0 0.5rem;
        }

        .book-progress-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 0.75rem 1rem;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .progress-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
            font-size: 0.8rem;
            color: rgba(255,255,255,0.95);
            font-weight: 600;
        }
        
        .progress-percent {
            background: rgba(255, 255, 255, 0.15);
            padding: 0.15rem 0.5rem;
            border-radius: 4px;
        }
        
        .time-left {
            color: var(--color-primary);
            font-weight: 700;
        }

        .progress-bar {
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: var(--color-primary);
            border-radius: 4px;
            box-shadow: 0 0 10px var(--color-primary);
        }
        
        .delete-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            color: white;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0;
            transition: all 0.2s;
            z-index: 20;
            font-size: 1.25rem;
            line-height: 0;
            padding-bottom: 2px;
        }
        
        .book-card:hover .delete-btn {
            opacity: 1;
        }
        
        .delete-btn:hover {
            background: var(--color-accent);
            border-color: var(--color-accent);
            transform: scale(1.1);
        }

        .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 5rem 2rem;
            color: var(--color-text-secondary);
            border: 2px dashed rgba(255,255,255,0.1);
            border-radius: var(--radius-lg);
            background: rgba(255,255,255,0.02);
        }

        /* --- Mobile Overhaul --- */
        @media (max-width: 640px) {
            .library-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }
            
            .library-header h2 {
                margin-left: 0.5rem;
            }
            
            .action-buttons {
                width: 100%;
                display: grid !important;
                grid-template-columns: 1fr 1fr;
                gap: 0.75rem !important;
            }
            
            .btn-upload {
                width: 100%;
                padding: 1rem 0.75rem;
                font-size: 0.9rem;
                border-radius: var(--radius-md);
                min-height: 52px;
            }
            
            .btn-upload.btn-secondary {
                background: rgba(255,255,255,0.1);
            }

            /* Switch Grid to List View */
            .books-grid {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }
            
            .book-card {
                aspect-ratio: auto;
                flex-direction: row;
                height: 110px;
                padding: 0; /* Clear default padding if any */
                transform: none !important; /* Disable hover lift on touch */
            }
            
            .book-cover {
                width: 80px;
                flex: none;
                padding: 0.5rem;
                background: rgba(0,0,0,0.2);
            }
            
            .book-title-display {
                font-size: 0.75rem;
                -webkit-line-clamp: 2;
                max-height: 2.5em;
                text-shadow: none;
            }
            
            .book-progress-overlay {
                position: relative;
                top: auto;
                bottom: auto;
                left: auto;
                right: auto;
                background: none;
                flex: 1;
                padding: 1rem;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            
             /* Since we changed structure, we need to adapt visually.
                But wait, .book-cover *contains* the title logic in JSX. 
                This CSS change assumes JSX structure mostly. 
                In the current JSX, book-title-display is INSIDE book-cover.
                We might need to adjust JSX to pull title OUT of cover for list view?
                Or we just style book-cover to be the "Left Side" and put title there.
             */
             
             .book-cover {
                 /* Override flex centering to allow custom layout inside */
                 justify-content: center;
                 align-items: center;
             }
             
             .book-progress-overlay {
                /* We want this to be the "Right Side" content */
                position: static; /* flow normally */
                background: transparent;
                padding: 1rem;
                justify-content: center;
                display: flex;
                flex-direction: column;
                flex: 1;
             }
             
             /* Hide title inside cover if image exists? No cover usually text. */
             
             .delete-btn {
                 opacity: 1; /* Always show on mobile */
                 top: 50%;
                 transform: translateY(-50%);
                 right: 1rem;
                 width: 36px;
                 height: 36px;
                 background: rgba(255,255,255,0.1);
             }
        }
      `}</style>
        </div>
    );
};

export default Library;
