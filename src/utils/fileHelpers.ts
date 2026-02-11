import JSZip from 'jszip';

const MAX_EPUB_SIZE_BYTES = 20 * 1024 * 1024; // 20MB safety cap

interface WorkerSuccess {
  ok: true;
  text: string;
  cover?: string;
}

interface WorkerFailure {
  ok: false;
  error: string;
}

type WorkerResponse = WorkerSuccess | WorkerFailure;

const parseEpubOnMainThread = async (file: File): Promise<{ text: string; cover?: string }> => {
  const jszip = new JSZip();
  const zip = await jszip.loadAsync(await file.arrayBuffer());

  const parser = new DOMParser();
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  const containerDoc = containerXml ? parser.parseFromString(containerXml, 'application/xml') : null;
  const opfPath = containerDoc?.querySelector('rootfile')?.getAttribute('full-path') ?? '';
  const texts: string[] = [];
  let coverImage: string | undefined;

  let spineHrefs: string[] = [];
  if (opfPath && zip.file(opfPath)) {
    const opfContent = await zip.file(opfPath)!.async('text');
    const opfDoc = parser.parseFromString(opfContent, 'application/xml');
    const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item'));
    const idToHref: Record<string, string> = {};
    manifestItems.forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) idToHref[id] = href;
    });

    const lastSlash = opfPath.lastIndexOf('/');
    const opfDir = lastSlash !== -1 ? opfPath.substring(0, lastSlash + 1) : '';

    let coverItem = manifestItems.find((item) => item.getAttribute('properties')?.includes('cover-image'));
    if (!coverItem) {
      const metaCover = opfDoc.querySelector('metadata > meta[name="cover"]');
      if (metaCover) {
        const coverId = metaCover.getAttribute('content');
        if (coverId) coverItem = manifestItems.find((item) => item.getAttribute('id') === coverId);
      }
    }

    if (coverItem) {
      const href = coverItem.getAttribute('href');
      if (href) {
        const coverPath = `${opfDir}${href}`.replace(/\/{2,}/g, '/');
        const coverFile = zip.file(coverPath);
        if (coverFile) {
          const blob = await coverFile.async('blob');
          coverImage = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.readAsDataURL(blob);
          });
        }
      }
    }

    const spineItemrefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
    spineHrefs = spineItemrefs
      .map((itemref) => {
        const idref = itemref.getAttribute('idref');
        if (idref && idToHref[idref]) return `${opfDir}${idToHref[idref]}`.replace(/\/{2,}/g, '/');
        return null;
      })
      .filter(Boolean) as string[];
  }

  if (spineHrefs.length === 0) {
    spineHrefs = Object.keys(zip.files)
      .filter((path) => /\.(html|xhtml|htm)$/i.test(path) && !path.includes('__MACOSX'))
      .sort();
  }

  for (const href of spineHrefs) {
    const fileInZip = zip.file(href);
    if (!fileInZip) continue;
    const content = await fileInZip.async('text');
    const doc = parser.parseFromString(content, 'text/html');
    const cleanText = (doc.body?.textContent ?? '').trim().replace(/\s+/g, ' ');
    if (cleanText.length > 0) texts.push(cleanText);
  }

  if (texts.length === 0) {
    throw new Error('No text found in EPUB files.');
  }

  return { text: texts.join('\n\n'), cover: coverImage };
};

export const parseEpub = async (file: File): Promise<{ text: string; cover?: string }> => {
  if (file.size > MAX_EPUB_SIZE_BYTES) {
    throw new Error('EPUB file is too large. Please use a file under 20MB.');
  }

  // Dedicated worker prevents large EPUB parsing from blocking the UI thread.
  if (typeof Worker !== 'undefined') {
    const worker = new Worker(new URL('../workers/epubParserWorker.ts', import.meta.url), { type: 'module' });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await new Promise<WorkerResponse>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          worker.terminate();
          reject(new Error('EPUB parsing timed out. Try a smaller file.'));
        }, 60_000);

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
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
      return { text: result.text, cover: result.cover };
    } catch {
      // Fallback keeps behavior reliable in environments where workers fail.
      return parseEpubOnMainThread(file);
    } finally {
      worker.terminate();
    }
  }

  return parseEpubOnMainThread(file);
};

export const parseTxt = async (file: File): Promise<string> => {
  return file.text();
};
