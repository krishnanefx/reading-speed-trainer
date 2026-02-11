interface TokenizeWorkerSuccess {
  ok: true;
  words: string[];
}

interface TokenizeWorkerFailure {
  ok: false;
  error: string;
}

type TokenizeWorkerResponse = TokenizeWorkerSuccess | TokenizeWorkerFailure;

const LARGE_TEXT_WORKER_THRESHOLD = 50_000;

const tokenizeOnMainThread = (text: string): string[] => {
  return text.split(/\s+/).filter((word) => word.length > 0);
};

export const tokenizeText = async (text: string): Promise<string[]> => {
  if (text.length < LARGE_TEXT_WORKER_THRESHOLD || typeof Worker === 'undefined') {
    return tokenizeOnMainThread(text);
  }

  const worker = new Worker(new URL('../workers/tokenizeWorker.ts', import.meta.url), { type: 'module' });
  try {
    const response = await new Promise<TokenizeWorkerResponse>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        worker.terminate();
        reject(new Error('Tokenization timed out.'));
      }, 20_000);

      worker.onmessage = (event: MessageEvent<TokenizeWorkerResponse>) => {
        window.clearTimeout(timeoutId);
        resolve(event.data);
      };

      worker.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error('Tokenization worker failed.'));
      };

      worker.postMessage({ text });
    });

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response.words;
  } catch {
    return tokenizeOnMainThread(text);
  } finally {
    worker.terminate();
  }
};
