import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distAssetsDir = join(process.cwd(), 'dist', 'assets');
const files = readdirSync(distAssetsDir);

const maxIndexJsBytes = Number(process.env.BUNDLE_BUDGET_INDEX_JS_BYTES ?? 225_000);
const maxReaderJsBytes = Number(process.env.BUNDLE_BUDGET_READER_JS_BYTES ?? 30_000);
const maxLibraryJsBytes = Number(process.env.BUNDLE_BUDGET_LIBRARY_JS_BYTES ?? 25_000);

const findAsset = (prefix) => files.find((name) => name.startsWith(prefix) && name.endsWith('.js'));

const indexJs = findAsset('index-');
const readerJs = findAsset('ReaderView-');
const libraryJs = findAsset('Library-');

if (!indexJs || !readerJs || !libraryJs) {
  console.error('[budget] Missing expected built assets in dist/assets');
  process.exit(1);
}

const check = (name, limit) => {
  const size = statSync(join(distAssetsDir, name)).size;
  const ok = size <= limit;
  const msg = `[budget] ${name}: ${size} bytes (limit ${limit})`;
  if (ok) {
    console.log(msg);
    return true;
  }
  console.error(`${msg} -> FAIL`);
  return false;
};

const checks = [
  check(indexJs, maxIndexJsBytes),
  check(readerJs, maxReaderJsBytes),
  check(libraryJs, maxLibraryJsBytes),
];

if (checks.some((ok) => !ok)) {
  process.exit(1);
}
