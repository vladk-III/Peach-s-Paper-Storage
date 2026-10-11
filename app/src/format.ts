export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function shortAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  const last = (a: string) => a.split(/\s+/).pop() ?? a;
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${last(authors[0])} & ${last(authors[1])}`;
  return `${last(authors[0])} et al.`;
}
