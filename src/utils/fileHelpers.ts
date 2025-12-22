import JSZip from 'jszip';

// Keywords to identify frontmatter (Skip these until we hit main content)
// Keeping these for potential future use, but currently we are aggressive in extracting everything.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// Keywords lists removed to fix linting errors (unused)

export const parseEpub = async (file: File): Promise<{ text: string; cover?: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (!e.target?.result) {
                reject(new Error("Failed to load file"));
                return;
            }

            try {
                console.log("Starting reliable EPUB extraction via JSZip...");
                const jszip = new JSZip();
                const zip = await jszip.loadAsync(e.target.result as ArrayBuffer);

                // 1. Find the OPF file to get the spine (reading order)
                let opfPath = '';
                const containerFile = zip.file('META-INF/container.xml');

                if (containerFile) {
                    const containerXml = await containerFile.async('text');
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(containerXml, 'application/xml');
                    const rootfile = doc.querySelector('rootfile');
                    if (rootfile) {
                        opfPath = rootfile.getAttribute('full-path') || '';
                    }
                }

                let spineHrefs: string[] = [];
                let coverImage: string | undefined;

                if (opfPath && zip.file(opfPath)) {
                    console.log("Found OPF file:", opfPath);
                    const opfContent = await zip.file(opfPath)!.async('text');
                    const parser = new DOMParser();
                    const opfDoc = parser.parseFromString(opfContent, 'application/xml');

                    // Get the manifest items (id -> href)
                    const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item'));
                    const idToHref: Record<string, string> = {};
                    manifestItems.forEach(item => {
                        const id = item.getAttribute('id');
                        const href = item.getAttribute('href');
                        if (id && href) idToHref[id] = href;
                    });

                    // Resolve relative paths
                    const lastSlash = opfPath.lastIndexOf('/');
                    const opfDir = lastSlash !== -1 ? opfPath.substring(0, lastSlash + 1) : '';

                    // --- Try to find Cover ---
                    // Method A: item with properties="cover-image"
                    let coverItem = manifestItems.find(item => item.getAttribute('properties')?.includes('cover-image'));

                    // Method B: meta name="cover" content="item-id"
                    if (!coverItem) {
                        const metaCover = opfDoc.querySelector('metadata > meta[name="cover"]');
                        if (metaCover) {
                            const coverId = metaCover.getAttribute('content');
                            if (coverId) {
                                coverItem = manifestItems.find(item => item.getAttribute('id') === coverId);
                            }
                        }
                    }

                    if (coverItem) {
                        let href = coverItem.getAttribute('href');
                        if (href) {
                            try { href = decodeURIComponent(href); } catch (e) { /* ignore */ }
                            const coverPath = opfDir + href;
                            const coverFile = zip.file(coverPath);
                            if (coverFile) {
                                const blob = await coverFile.async('blob');
                                // Convert blob to base64 data URL
                                coverImage = await new Promise<string>((res) => {
                                    const r = new FileReader();
                                    r.onloadend = () => res(r.result as string);
                                    r.readAsDataURL(blob);
                                });
                                console.log("Extracted cover image.");
                            }
                        }
                    }
                    // -------------------------

                    // Get spine items (idref)
                    const spineItemrefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));

                    spineHrefs = spineItemrefs.map(itemref => {
                        const idref = itemref.getAttribute('idref');
                        if (idref && idToHref[idref]) {
                            let href = idToHref[idref];
                            try { href = decodeURIComponent(href); } catch (e) { /* ignore */ }
                            return opfDir + href;
                        }
                        return null;
                    }).filter(Boolean) as string[];
                } else {
                    console.warn("Could not find OPF via container.xml, falling back to all HTML files.");
                    spineHrefs = Object.keys(zip.files).filter(path =>
                        /\.(html|xhtml|htm)$/i.test(path) && !path.includes('__MACOSX')
                    ).sort();
                }

                console.log(`Found ${spineHrefs.length} text sections to parse.`);

                // 2. Parse text from each file in order
                const texts: string[] = [];
                const parser = new DOMParser();

                for (const href of spineHrefs) {
                    const fileInZip = zip.file(href);
                    if (fileInZip) {
                        try {
                            const content = await fileInZip.async('text');
                            const doc = parser.parseFromString(content, 'text/html');

                            const body = doc.body;
                            if (body) {
                                const text = body.textContent || '';
                                const cleanText = text.trim().replace(/\s+/g, ' ');
                                if (cleanText.length > 0) {
                                    texts.push(cleanText);
                                }
                            }
                        } catch (err) {
                            console.warn(`Failed to parse file ${href}:`, err);
                        }
                    }
                }

                if (texts.length === 0) {
                    reject(new Error("No text found in EPUB files."));
                    return;
                }

                console.log("Extraction complete.");
                resolve({
                    text: texts.join('\n\n'),
                    cover: coverImage
                });

            } catch (err) {
                console.error("Critical JSZip parsing error:", err);
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
};

export const parseTxt = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            resolve(e.target?.result as string || '');
        };
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
    });
};
