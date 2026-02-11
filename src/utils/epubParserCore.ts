import JSZip from 'jszip';

export interface EpubParseProgress {
  processed: number;
  total: number;
}

export interface EpubParseResult {
  text: string;
  cover?: string;
}

const stripTags = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

const getAttr = (tag: string, attr: string): string | null => {
  const regex = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = tag.match(regex);
  return match?.[2] ?? match?.[3] ?? null;
};

const joinPath = (baseDir: string, href: string): string => {
  return `${baseDir}${href}`.replace(/\/{2,}/g, '/');
};

const mimeByPath = (path: string): string => {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const pause = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const parseEpubArrayBuffer = async (
  arrayBuffer: ArrayBuffer,
  onProgress?: (progress: EpubParseProgress) => void
): Promise<EpubParseResult> => {
  const zip = await new JSZip().loadAsync(arrayBuffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  const rootfileMatch = containerXml?.match(/<rootfile[^>]*full-path\s*=\s*["']([^"']+)["']/i);
  const opfPath = rootfileMatch?.[1] ?? '';

  let spineHrefs: string[] = [];
  let coverDataUrl: string | undefined;

  if (opfPath && zip.file(opfPath)) {
    const opfContent = await zip.file(opfPath)!.async('text');
    const opfDir = opfPath.includes('/') ? `${opfPath.slice(0, opfPath.lastIndexOf('/') + 1)}` : '';

    const manifestItems = opfContent.match(/<item\b[^>]*>/gi) ?? [];
    const idToHref: Record<string, string> = {};
    const idToType: Record<string, string> = {};
    const idToProps: Record<string, string> = {};

    for (const tag of manifestItems) {
      const id = getAttr(tag, 'id');
      const href = getAttr(tag, 'href');
      const mediaType = getAttr(tag, 'media-type');
      const properties = getAttr(tag, 'properties');
      if (id && href) {
        idToHref[id] = href;
        if (mediaType) idToType[id] = mediaType;
        if (properties) idToProps[id] = properties;
      }
    }

    let coverId: string | null = null;
    for (const [id, props] of Object.entries(idToProps)) {
      if (props.includes('cover-image')) {
        coverId = id;
        break;
      }
    }

    if (!coverId) {
      const coverMeta = opfContent.match(/<meta[^>]*name\s*=\s*["']cover["'][^>]*>/i)?.[0];
      coverId = coverMeta ? getAttr(coverMeta, 'content') : null;
    }

    if (coverId && idToHref[coverId]) {
      const coverPath = joinPath(opfDir, decodeURIComponent(idToHref[coverId]));
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const bytes = await coverFile.async('uint8array');
        const mediaType = idToType[coverId] ?? mimeByPath(coverPath);
        coverDataUrl = `data:${mediaType};base64,${bytesToBase64(bytes)}`;
      }
    }

    const spineItemRefs = opfContent.match(/<itemref\b[^>]*>/gi) ?? [];
    spineHrefs = spineItemRefs
      .map((tag) => getAttr(tag, 'idref'))
      .filter((id): id is string => Boolean(id && idToHref[id]))
      .map((id) => joinPath(opfDir, decodeURIComponent(idToHref[id])));
  }

  if (spineHrefs.length === 0) {
    spineHrefs = Object.keys(zip.files)
      .filter((path) => /\.(xhtml|html|htm)$/i.test(path) && !path.includes('__MACOSX'))
      .sort();
  }

  const textChunks: string[] = [];
  for (let index = 0; index < spineHrefs.length; index += 1) {
    const href = spineHrefs[index];
    const entry = zip.file(href);
    if (!entry) continue;
    const html = await entry.async('text');
    const text = stripTags(html);
    if (text.length > 0) textChunks.push(text);

    onProgress?.({ processed: index + 1, total: spineHrefs.length });
    if ((index + 1) % 8 === 0) {
      await pause(0);
    }
  }

  if (textChunks.length === 0) {
    throw new Error('No readable text was found in this EPUB.');
  }

  return { text: textChunks.join('\n\n'), cover: coverDataUrl };
};
