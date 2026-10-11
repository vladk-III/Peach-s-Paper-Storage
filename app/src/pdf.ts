// The "legacy" build supports older Safari/Chrome versions (iPads that are a few years old).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };

export interface DetectedIds {
  doi: string;
  arxiv: string;
  title: string;
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
const ARXIV_RE = /arXiv:\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i;

export function findIdentifiers(text: string): { doi: string; arxiv: string } {
  const doi = text.match(DOI_RE)?.[1].replace(/[.,;:)\]}]+$/, "") ?? "";
  const arxiv = text.match(ARXIV_RE)?.[1] ?? "";
  return { doi, arxiv };
}

/** Reads the first couple of pages looking for a DOI / arXiv id, plus the embedded title. */
export async function detectIdentifiers(data: ArrayBuffer): Promise<DetectedIds> {
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  try {
    let text = "";
    for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    const meta = await doc.getMetadata().catch(() => null);
    const rawTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim() ?? "";
    const title = rawTitle.length > 5 && !/^(microsoft word|untitled|\S+\.(docx?|tex|dvi))/i.test(rawTitle) ? rawTitle : "";
    return { ...findIdentifiers(text), title };
  } finally {
    void task.destroy();
  }
}
