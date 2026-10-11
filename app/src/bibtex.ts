import type { Paper } from "./types";

function citeKey(p: Paper): string {
  const last = (p.authors[0] ?? "anon").split(/\s+/).pop() ?? "anon";
  const word = (p.title.match(/[A-Za-z]{4,}/)?.[0] ?? "paper").toLowerCase();
  return `${last.toLowerCase().replace(/[^a-z]/g, "")}${p.year ?? ""}${word}`;
}

function esc(s: string): string {
  return s.replace(/([{}])/g, "\\$1");
}

export function toBibtex(p: Paper): string {
  const isArticle = p.itemType.includes("journal") || p.itemType === "article";
  const type = p.itemType === "preprint" ? "misc" : p.itemType.includes("proceedings") ? "inproceedings" : isArticle ? "article" : "misc";
  const fields: [string, string][] = [
    ["title", `{${esc(p.title)}}`],
    ["author", esc(p.authors.join(" and "))],
    ["year", p.year ? String(p.year) : ""],
    [type === "inproceedings" ? "booktitle" : "journal", type === "misc" && p.venue === "arXiv" ? "" : esc(p.venue)],
    ["doi", p.doi],
    ["eprint", p.arxivId],
    ["archivePrefix", p.arxivId ? "arXiv" : ""],
    ["url", p.url],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n");
  return `@${type}{${citeKey(p)},\n${body}\n}`;
}
