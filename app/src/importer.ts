// Adding papers: from PDF files (auto-detecting DOI/arXiv ids) or from an identifier.
import { importArxivPdf, lookup, uploadPdf } from "./api";
import { createPaper, newPaperId } from "./library";
import { detectIdentifiers, findIdentifiers } from "./pdf";
import { putPdf } from "./pdfCache";
import { emptyMetadata, type PaperMetadata } from "./types";

export interface ParsedId {
  doi: string;
  arxiv: string;
}

export function parseIdentifier(input: string): ParsedId {
  const s = input.trim();
  const arxivUrl = s.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+?)(?:\.pdf)?(?:[?#]|$)/i);
  if (arxivUrl) return { doi: "", arxiv: arxivUrl[1] };
  const bareArxiv = s.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/i);
  if (bareArxiv) return { doi: "", arxiv: bareArxiv[1] };
  return findIdentifiers(s);
}

/** Tries the DOI, then the arXiv id. Returns null if neither is found; throws if the lookup service is unreachable. */
async function lookupBest(ids: ParsedId): Promise<PaperMetadata | null> {
  let failure: Error | null = null;
  for (const attempt of [ids.doi && { doi: ids.doi }, ids.arxiv && { arxiv: ids.arxiv }]) {
    if (!attempt) continue;
    try {
      return await lookup(attempt);
    } catch (err) {
      if (!/not found/i.test((err as Error).message)) failure = err as Error;
    }
  }
  if (failure) throw failure;
  return null;
}

export async function importPdfFile(uid: string, file: File, collections: string[]): Promise<string> {
  const id = newPaperId(uid);
  const data = await file.arrayBuffer();

  let meta: PaperMetadata = { ...emptyMetadata, title: file.name.replace(/\.pdf$/i, "") };
  try {
    const found = await detectIdentifiers(data);
    if (found.title) meta.title = found.title;
    const looked = await lookupBest(found).catch(() => null);
    if (looked) meta = { ...looked, arxivId: looked.arxivId || found.arxiv, doi: looked.doi || found.doi };
    else meta = { ...meta, doi: found.doi, arxivId: found.arxiv };
  } catch (err) {
    console.warn("Could not read PDF text", err);
  }

  const pdfFile = await uploadPdf(id, file, file.name);
  await putPdf(uid, id, pdfFile, file);
  await createPaper(uid, id, { ...meta, file: pdfFile, collections });
  return id;
}

export async function importIdentifier(
  uid: string,
  input: string,
  collections: string[],
  fetchArxivPdf: boolean,
): Promise<string> {
  const ids = parseIdentifier(input);
  if (!ids.doi && !ids.arxiv) throw new Error("That doesn't look like a DOI or arXiv id/link.");
  const meta = await lookupBest(ids);
  if (!meta) throw new Error("Couldn't find that paper. Check the id, or add it manually.");
  const id = newPaperId(uid);
  const arxiv = meta.arxivId || ids.arxiv;
  let file = null;
  if (fetchArxivPdf && arxiv) {
    try {
      file = await importArxivPdf(id, arxiv);
    } catch (err) {
      console.warn("arXiv PDF import failed", err);
    }
  }
  await createPaper(uid, id, { ...meta, arxivId: arxiv, file, collections });
  return id;
}

export async function createManual(uid: string, title: string, collections: string[]): Promise<string> {
  const id = newPaperId(uid);
  // Not awaited: works offline, syncs when back online.
  createPaper(uid, id, { title, collections }).catch((err) => console.error("Create failed", err));
  return id;
}
