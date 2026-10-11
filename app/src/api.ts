import { auth } from "./firebase";
import { config } from "./config";
import type { PaperFile, PaperMetadata } from "./types";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(`${config.workerUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return res;
}

export async function uploadPdf(paperId: string, file: Blob, name: string): Promise<PaperFile> {
  const res = await call(`/files/${paperId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  const { size, uploadedAt } = (await res.json()) as { size: number; uploadedAt: string };
  return { name, size, uploadedAt };
}

export async function importArxivPdf(paperId: string, arxivId: string): Promise<PaperFile> {
  const res = await call(`/files/${paperId}?arxiv=${encodeURIComponent(arxivId)}`, { method: "POST" });
  const { size, uploadedAt } = (await res.json()) as { size: number; uploadedAt: string };
  return { name: `${arxivId.replace(/\//g, "_")}.pdf`, size, uploadedAt };
}

export async function downloadPdf(paperId: string): Promise<Blob> {
  const res = await call(`/files/${paperId}`);
  return res.blob();
}

export async function deletePdf(paperId: string): Promise<void> {
  await call(`/files/${paperId}`, { method: "DELETE" });
}

export interface Usage {
  used: number;
  limit: number;
  totalUsed: number;
  totalLimit: number;
}

export async function getUsage(): Promise<Usage> {
  return (await call("/usage")).json();
}

export async function lookup(id: { doi?: string; arxiv?: string }): Promise<PaperMetadata> {
  const q = id.doi ? `doi=${encodeURIComponent(id.doi)}` : `arxiv=${encodeURIComponent(id.arxiv ?? "")}`;
  return (await call(`/lookup?${q}`)).json();
}
