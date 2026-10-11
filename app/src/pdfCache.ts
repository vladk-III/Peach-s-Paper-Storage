// Keeps downloaded PDFs on the device (Cache Storage) so they open instantly
// and work offline. Keyed by upload time, so a replaced PDF is re-downloaded.
import { downloadPdf } from "./api";
import type { PaperFile } from "./types";

const CACHE = "peach-pdfs-v1";

function cacheKey(uid: string, paperId: string, file: PaperFile): string {
  return `https://pdf-cache.local/${uid}/${paperId}?v=${encodeURIComponent(file.uploadedAt)}`;
}

async function open(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE);
  } catch {
    return null; // e.g. private browsing
  }
}

export async function getPdf(uid: string, paperId: string, file: PaperFile): Promise<Blob> {
  const cache = await open();
  const key = cacheKey(uid, paperId, file);
  const hit = await cache?.match(key);
  if (hit) return hit.blob();
  const blob = await downloadPdf(paperId);
  await putPdf(uid, paperId, file, blob);
  return blob;
}

export async function putPdf(uid: string, paperId: string, file: PaperFile, blob: Blob): Promise<void> {
  const cache = await open();
  if (!cache) return;
  await removePdf(uid, paperId);
  await cache.put(cacheKey(uid, paperId, file), new Response(blob, { headers: { "Content-Type": "application/pdf" } }));
}

export async function removePdf(uid: string, paperId: string): Promise<void> {
  const cache = await open();
  if (!cache) return;
  const prefix = `https://pdf-cache.local/${uid}/${paperId}?`;
  for (const req of await cache.keys()) {
    if (req.url.startsWith(prefix)) await cache.delete(req);
  }
}

export async function isCached(uid: string, paperId: string, file: PaperFile): Promise<boolean> {
  const cache = await open();
  return Boolean(await cache?.match(cacheKey(uid, paperId, file)));
}
