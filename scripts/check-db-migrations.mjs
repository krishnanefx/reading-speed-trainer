import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dbFile = join(process.cwd(), 'src', 'utils', 'db.ts');
const source = readFileSync(dbFile, 'utf8');

const requiredStores = [
  'BOOKS_STORE',
  'BOOK_META_STORE',
  'BOOK_COVER_STORE',
  'SESSIONS_STORE',
  'STORE_NAME',
  'SYNC_QUEUE_STORE',
];

const mustContain = (pattern, message) => {
  if (!pattern.test(source)) {
    console.error(`[migration-check] FAIL: ${message}`);
    process.exit(1);
  }
};

mustContain(/const DB_VERSION = (\d+)/, 'DB_VERSION is missing.');
const versionMatch = source.match(/const DB_VERSION = (\d+)/);
const dbVersion = versionMatch ? Number(versionMatch[1]) : 0;
if (!Number.isInteger(dbVersion) || dbVersion < 5) {
  console.error(`[migration-check] FAIL: DB_VERSION must be >= 5. Found ${dbVersion}.`);
  process.exit(1);
}

for (const store of requiredStores) {
  mustContain(new RegExp(`const ${store} = ['"]`), `${store} constant is missing.`);
  mustContain(
    new RegExp(`objectStoreNames\\.contains\\(${store}\\)`),
    `${store} is not checked in DB upgrade() path.`,
  );
  mustContain(
    new RegExp(`createObjectStore\\(${store}`),
    `${store} is not created in DB upgrade() path.`,
  );
}

mustContain(/transaction\(\[BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE\], 'readwrite'\)/, 'Book+meta+cover atomic transaction is missing.');
mustContain(/getLibraryBooks = async[\s\S]*db\.getAll\(BOOK_META_STORE\)/, 'Library list must load from BOOK_META_STORE.');
mustContain(/getLibraryBookCovers = async[\s\S]*db\.get\(BOOK_COVER_STORE/, 'Cover hydration path must read from BOOK_COVER_STORE.');

console.log(`[migration-check] PASS: DB migration contract validated (version ${dbVersion}).`);
