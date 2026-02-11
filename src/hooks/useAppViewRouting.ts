import { useCallback, useState } from 'react';
import { toast } from 'react-hot-toast';
import { getBook, type Book } from '../utils/db/index';
import { perfLog } from '../utils/perf';

export type AppView = 'library' | 'reader' | 'settings' | 'stats' | 'gym' | 'achievements';

const APP_VIEWS: readonly AppView[] = ['library', 'reader', 'settings', 'stats', 'gym', 'achievements'];

export const isAppView = (value: string): value is AppView => {
  return (APP_VIEWS as readonly string[]).includes(value);
};

interface AppViewRoutingState {
  view: AppView;
  currentBook: Book | null;
  setView: (view: AppView) => void;
  setCurrentBook: (book: Book | null) => void;
  handleSelectBook: (bookId: string) => Promise<void>;
  handleNavigate: (newView: string) => void;
  handleBackToLibrary: () => void;
  handleReaderBack: () => void;
}

export const useAppViewRouting = (): AppViewRoutingState => {
  const [view, setView] = useState<AppView>('library');
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  const handleSelectBook = useCallback(async (bookId: string) => {
    const start = performance.now();
    const book = await getBook(bookId);
    perfLog('open_book.fetch', performance.now() - start, { found: Boolean(book) });
    if (!book) {
      toast.error('Could not open this book.');
      return;
    }
    setCurrentBook(book);
    setView('reader');
    requestAnimationFrame(() => {
      perfLog('open_book.total_to_view', performance.now() - start, { bookId });
    });
  }, []);

  const handleNavigate = useCallback((newView: string) => {
    if (!isAppView(newView)) return;
    setView(newView);
    if (newView !== 'reader') setCurrentBook(null);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    handleNavigate('library');
  }, [handleNavigate]);

  const handleReaderBack = useCallback(() => {
    setView('library');
    setCurrentBook(null);
  }, []);

  return {
    view,
    currentBook,
    setView,
    setCurrentBook,
    handleSelectBook,
    handleNavigate,
    handleBackToLibrary,
    handleReaderBack,
  };
};
