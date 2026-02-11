import { useEffect, useRef } from 'react';

interface UseHashViewSyncOptions<TView extends string> {
    view: TView;
    setView: (view: TView) => void;
    isView: (value: string) => value is TView;
    readerView: TView;
    fallbackView: TView;
    canEnterReader: boolean;
}

export const useHashViewSync = <TView extends string>({
    view,
    setView,
    isView,
    readerView,
    fallbackView,
    canEnterReader,
}: UseHashViewSyncOptions<TView>) => {
    const isApplyingHashFromViewRef = useRef(false);

    useEffect(() => {
        const handleHashChange = () => {
            if (isApplyingHashFromViewRef.current) {
                isApplyingHashFromViewRef.current = false;
                return;
            }

            const hash = window.location.hash.slice(1);
            if (hash === readerView && !canEnterReader) {
                window.location.hash = fallbackView;
                setView(fallbackView);
                return;
            }

            if (isView(hash)) {
                setView(hash);
            }
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [canEnterReader, fallbackView, isView, readerView, setView]);

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (hash !== view) {
            isApplyingHashFromViewRef.current = true;
            window.location.hash = view;
        }
    }, [view]);
};
