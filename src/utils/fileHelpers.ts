import { parseEpubArrayBuffer } from './epubParserCore';

const MAX_EPUB_SIZE_BYTES = 20 * 1024 * 1024; // 20MB safety cap

interface WorkerSuccess {
  ok: true;
  kind: 'result';
  text: string;
  cover?: string;
}

interface WorkerProgress {
  ok: true;
  kind: 'progress';
  processed: number;
  total: number;
}

interface WorkerFailure {
  ok: false;
  error: string;
}

type WorkerResponse = WorkerSuccess | WorkerProgress | WorkerFailure;

interface ParseEpubOptions {
  onProgress?: (processed: number, total: number) => void;
}

const parseEpubOnMainThread = async (
  file: File,
  options?: ParseEpubOptions
): Promise<{ text: string; cover?: string }> => {
  const parsed = await parseEpubArrayBuffer(await file.arrayBuffer(), (progress) => {
    options?.onProgress?.(progress.processed, progress.total);
  });
  return { text: parsed.text, cover: parsed.cover };
};

export const parseEpub = async (file: File, options?: ParseEpubOptions): Promise<{ text: string; cover?: string }> => {
  if (file.size > MAX_EPUB_SIZE_BYTES) {
    throw new Error('EPUB file is too large. Please use a file under 20MB.');
  }

  // Dedicated worker prevents large EPUB parsing from blocking the UI thread.
  if (typeof Worker !== 'undefined') {
    const worker = new Worker(new URL('../workers/epubParserWorker.ts', import.meta.url), { type: 'module' });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await new Promise<WorkerResponse>((resolve, reject) => {
        const armTimeout = () => window.setTimeout(() => {
          worker.terminate();
          reject(new Error('EPUB parsing timed out. Try a smaller file.'));
        }, 60_000);
        let timeoutId = armTimeout();
        const resetTimeout = () => {
          window.clearTimeout(timeoutId);
          timeoutId = armTimeout();
        };

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.ok && event.data.kind === 'progress') {
            options?.onProgress?.(event.data.processed, event.data.total);
            resetTimeout();
            return;
          }
          window.clearTimeout(timeoutId);
          resolve(event.data);
        };
        worker.onerror = () => {
          window.clearTimeout(timeoutId);
          reject(new Error('Worker parsing failed.'));
        };

        worker.postMessage({ arrayBuffer }, [arrayBuffer]);
      });

      if (!result.ok) {
        throw new Error(result.error);
      }
      if (result.kind !== 'result') {
        throw new Error('Unexpected EPUB parser response.');
      }
      return { text: result.text, cover: result.cover };
    } catch {
      // Fallback keeps behavior reliable in environments where workers fail.
      return parseEpubOnMainThread(file, options);
    } finally {
      worker.terminate();
    }
  }

  return parseEpubOnMainThread(file, options);
};

export const parseTxt = async (file: File): Promise<string> => {
  return file.text();
};
