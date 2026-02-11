import { parseEpubArrayBuffer } from '../utils/epubParserCore';

interface EpubParseRequest {
  arrayBuffer: ArrayBuffer;
}

interface EpubParseSuccess {
  ok: true;
  kind: 'result';
  text: string;
  cover?: string;
}

interface EpubParseProgress {
  ok: true;
  kind: 'progress';
  processed: number;
  total: number;
}

interface EpubParseFailure {
  ok: false;
  error: string;
}

type EpubParseResponse = EpubParseSuccess | EpubParseProgress | EpubParseFailure;

self.onmessage = async (event: MessageEvent<EpubParseRequest>) => {
  try {
    const parsed = await parseEpubArrayBuffer(event.data.arrayBuffer, ({ processed, total }) => {
      const progress: EpubParseProgress = { ok: true, kind: 'progress', processed, total };
      self.postMessage(progress);
    });
    const result: EpubParseSuccess = { ok: true, kind: 'result', text: parsed.text, cover: parsed.cover };
    const response: EpubParseResponse = result;
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'EPUB parsing failed.';
    const response: EpubParseResponse = { ok: false, error: message };
    self.postMessage(response);
  }
};

export {};
