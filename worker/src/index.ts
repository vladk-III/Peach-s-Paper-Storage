/**
 * Peach's Paper Storage – file + lookup API.
 *
 * Paper metadata, notes and tags live in Firestore (synced directly by the app).
 * This worker only handles what Firestore can't do for free:
 *   - storing PDFs in Cloudflare R2 (10 GB free), one folder per account
 *   - proxying metadata lookups (Crossref / arXiv) that browsers can't call directly
 *
 * Every request must carry a Firebase ID token: `Authorization: Bearer <token>`.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Env {
  BUCKET: R2Bucket;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  USER_QUOTA_BYTES: string;
  TOTAL_QUOTA_BYTES: string;
  MAX_FILE_BYTES: string;
  CONTACT_EMAIL?: string;
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

const PAPER_ID = /^[A-Za-z0-9_-]{1,64}$/;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : "Internal error";
      if (!(err instanceof HttpError)) console.error(err);
      return json({ error: message }, status, cors);
    }
  },
};

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "health") return json({ ok: true });

  const uid = await authenticate(request, env);

  if (parts[0] === "usage" && request.method === "GET") {
    const [used, total] = await Promise.all([sumPrefix(env.BUCKET, userPrefix(uid)), sumPrefix(env.BUCKET, "u/")]);
    return json({
      used,
      limit: Number(env.USER_QUOTA_BYTES),
      totalUsed: total,
      totalLimit: Number(env.TOTAL_QUOTA_BYTES),
    });
  }

  if (parts[0] === "files" && parts.length === 2) {
    const paperId = parts[1];
    if (!PAPER_ID.test(paperId)) throw new HttpError(400, "Bad paper id");
    const key = `${userPrefix(uid)}${paperId}.pdf`;
    switch (request.method) {
      case "GET":
        return getFile(env, key);
      case "PUT": {
        const maxFile = Number(env.MAX_FILE_BYTES);
        const declared = Number(request.headers.get("Content-Length") ?? "0");
        if (declared > maxFile) throw new HttpError(413, `PDF is larger than ${formatBytes(maxFile)}`);
        return storeFile(env, uid, key, await request.arrayBuffer());
      }
      case "POST": {
        // Server-side import, e.g. POST /files/:id?arxiv=2401.01234 copies the arXiv PDF.
        const arxiv = url.searchParams.get("arxiv");
        if (!arxiv) throw new HttpError(400, "Pass ?arxiv=");
        const res = await upstream(`https://arxiv.org/pdf/${encodeURI(cleanArxivId(arxiv))}`, "arXiv");
        if (!res.ok) throw new HttpError(502, "Could not download the PDF from arXiv");
        return storeFile(env, uid, key, await res.arrayBuffer());
      }
      case "DELETE":
        await env.BUCKET.delete(key);
        return json({ ok: true });
    }
  }

  if (parts[0] === "lookup" && request.method === "GET") {
    const doi = url.searchParams.get("doi");
    const arxiv = url.searchParams.get("arxiv");
    if (doi) return json(await lookupDoi(doi, env));
    if (arxiv) return json(await lookupArxiv(arxiv));
    throw new HttpError(400, "Pass ?doi= or ?arxiv=");
  }

  throw new HttpError(404, "Not found");
}

// ---------------------------------------------------------------------------
// Auth

async function authenticate(request: Request, env: Env): Promise<string> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Not signed in");
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("no sub");
    return payload.sub;
  } catch {
    throw new HttpError(401, "Invalid or expired sign-in");
  }
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---------------------------------------------------------------------------
// Files

function userPrefix(uid: string): string {
  return `u/${uid}/`;
}

async function getFile(env: Env, key: string): Promise<Response> {
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new HttpError(404, "No PDF stored for this paper");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(obj.size),
      "Cache-Control": "private, no-store",
      ETag: obj.httpEtag,
    },
  });
}

async function storeFile(env: Env, uid: string, key: string, data: ArrayBuffer): Promise<Response> {
  const maxFile = Number(env.MAX_FILE_BYTES);
  if (data.byteLength === 0) throw new HttpError(400, "Empty upload");
  if (data.byteLength > maxFile) throw new HttpError(413, `PDF is larger than ${formatBytes(maxFile)}`);
  const magic = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(1024, data.byteLength)));
  if (!magic.includes("%PDF-")) throw new HttpError(415, "Only PDF files can be uploaded");

  // Replacing an existing file shouldn't count it twice.
  const existing = await env.BUCKET.head(key);
  const replacing = existing?.size ?? 0;

  const [userUsed, totalUsed] = await Promise.all([sumPrefix(env.BUCKET, userPrefix(uid)), sumPrefix(env.BUCKET, "u/")]);
  const userLimit = Number(env.USER_QUOTA_BYTES);
  const totalLimit = Number(env.TOTAL_QUOTA_BYTES);
  if (userUsed - replacing + data.byteLength > userLimit) {
    throw new HttpError(507, `This would put your account over its ${formatBytes(userLimit)} storage limit`);
  }
  if (totalUsed - replacing + data.byteLength > totalLimit) {
    throw new HttpError(507, "The shared storage is full. Ask the admin to free up space.");
  }

  const obj = await env.BUCKET.put(key, data, { httpMetadata: { contentType: "application/pdf" } });
  return json({ size: obj.size, uploadedAt: obj.uploaded.toISOString() });
}

async function sumPrefix(bucket: R2Bucket, prefix: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of page.objects) total += obj.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}

// ---------------------------------------------------------------------------
// Metadata lookup

interface PaperMetadata {
  title: string;
  authors: string[];
  year: number | null;
  venue: string;
  abstract: string;
  doi: string;
  arxivId: string;
  url: string;
  itemType: string;
}

async function lookupDoi(rawDoi: string, env: Env): Promise<PaperMetadata> {
  const doi = rawDoi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "");
  const mailto = env.CONTACT_EMAIL ? `?mailto=${encodeURIComponent(env.CONTACT_EMAIL)}` : "";
  const res = await upstream(`https://api.crossref.org/works/${encodeURIComponent(doi)}${mailto}`, "Crossref");
  if (res.status === 404) throw new HttpError(404, "DOI not found");
  if (!res.ok) throw new HttpError(502, "Crossref lookup failed");
  const { message: m } = (await res.json()) as { message: Record<string, any> };
  const dateParts = m.issued?.["date-parts"]?.[0] ?? m.published?.["date-parts"]?.[0];
  return {
    title: (m.title?.[0] ?? "").trim(),
    authors: (m.author ?? []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ") || a.name || "").filter(Boolean),
    year: typeof dateParts?.[0] === "number" ? dateParts[0] : null,
    venue: m["container-title"]?.[0] ?? m.publisher ?? "",
    abstract: stripTags(m.abstract ?? ""),
    doi: m.DOI ?? doi,
    arxivId: "",
    url: m.URL ?? `https://doi.org/${doi}`,
    itemType: m.type ?? "article",
  };
}

async function lookupArxiv(rawId: string): Promise<PaperMetadata> {
  const id = cleanArxivId(rawId);
  const res = await upstream(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, "arXiv");
  if (!res.ok) throw new HttpError(502, "arXiv lookup failed");
  const xml = await res.text();
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  const title = entry ? tag(entry, "title") : "";
  if (!entry || !title || /^Error$/i.test(title)) throw new HttpError(404, "arXiv paper not found");
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => decodeXml(m[1].trim()));
  const published = tag(entry, "published");
  return {
    title: collapse(title),
    authors,
    year: published ? Number(published.slice(0, 4)) : null,
    venue: collapse(tag(entry, "arxiv:journal_ref")) || "arXiv",
    abstract: collapse(tag(entry, "summary")),
    doi: tag(entry, "arxiv:doi"),
    arxivId: id.replace(/v\d+$/, ""),
    url: `https://arxiv.org/abs/${id}`,
    itemType: "preprint",
  };
}

async function upstream(url: string, service: string): Promise<Response> {
  try {
    return await fetch(url, { headers: { "User-Agent": "PeachPaperStorage/1.0" } });
  } catch {
    throw new HttpError(502, `Couldn't reach ${service}. Try again later.`);
  }
}

function cleanArxivId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/^arxiv:/i, "")
    .replace(/\.pdf$/i, "");
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1].trim()) : "";
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return collapse(decodeXml(s.replace(/<jats:title>[\s\S]*?<\/jats:title>/g, "").replace(/<[^>]+>/g, " ")));
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
