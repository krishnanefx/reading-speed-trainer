interface TokenizeRequest {
  text: string;
}

interface TokenizeSuccess {
  ok: true;
  words: string[];
}

interface TokenizeFailure {
  ok: false;
  error: string;
}

type TokenizeResponse = TokenizeSuccess | TokenizeFailure;

const tokenize = (text: string): string[] => {
  return text.split(/\s+/).filter((word) => word.length > 0);
};

self.onmessage = (event: MessageEvent<TokenizeRequest>) => {
  try {
    const words = tokenize(event.data.text || '');
    const response: TokenizeResponse = { ok: true, words };
    self.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tokenization failed.';
    const response: TokenizeResponse = { ok: false, error: message };
    self.postMessage(response);
  }
};

export {};
