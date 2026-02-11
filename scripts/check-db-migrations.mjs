import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dbFile = join(process.cwd(), 'src', 'utils', 'db', 'core.ts');
const localDataFile = join(process.cwd(), 'src', 'utils', 'db', 'localData.ts');
const source = readFileSync(dbFile, 'utf8');
const localDataSource = readFileSync(localDataFile, 'utf8');
const combinedSource = `${source}\n${localDataSource}`;

const requiredStores = [
  'BOOKS_STORE',
  'BOOK_META_STORE',
  'BOOK_COVER_STORE',
  'SESSIONS_STORE',
  'STORE_NAME',
  'SYNC_QUEUE_STORE',
];

const mustContain = (pattern, message, input = source) => {
  if (!pattern.test(input)) {
    console.error(`[migration-check] FAIL: ${message}`);
    process.exit(1);
  }
};

const mustContainAny = (patterns, message, input = combinedSource) => {
  if (!patterns.some((pattern) => pattern.test(input))) {
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

mustContainAny(
  [
    /transaction\(\[BOOKS_STORE, BOOK_META_STORE, BOOK_COVER_STORE\], 'readwrite'\)/,
    /transaction\(\[deps\.booksStore, deps\.bookMetaStore, deps\.bookCoverStore\], 'readwrite'\)/,
  ],
  'Book+meta+cover atomic transaction is missing.',
);

mustContainAny(
  [
    /getLibraryBooks = async[\s\S]*db\.getAll\(BOOK_META_STORE\)/,
    /const getLibraryBooks = async[\s\S]*db\.getAll\(deps\.bookMetaStore\)/,
  ],
  'Library list must load from BOOK_META_STORE (or module-configured meta store).',
);

mustContainAny(
  [
    /getLibraryBookCovers = async[\s\S]*db\.get\(BOOK_COVER_STORE/,
    /const getLibraryBookCovers = async[\s\S]*db\.get\(deps\.bookCoverStore/,
  ],
  'Cover hydration path must read from BOOK_COVER_STORE (or module-configured cover store).',
);

console.log(`[migration-check] PASS: DB migration contract validated (version ${dbVersion}).`);
