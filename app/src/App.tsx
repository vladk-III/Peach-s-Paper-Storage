import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import { useLibrary } from "./library";
import { getUsage, type Usage } from "./api";
import { importPdfFile } from "./importer";
import { AuthScreen } from "./components/AuthScreen";
import { Sidebar, type Filter } from "./components/Sidebar";
import { PaperList, type SortKey } from "./components/PaperList";
import { PaperDetail } from "./components/PaperDetail";
import { AddPaper } from "./components/AddPaper";
import { PdfViewer } from "./components/PdfViewer";
import type { Paper } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="splash">🍑</div>;
  if (!user) return <AuthScreen />;
  return <Library key={user.uid} user={user} />;
}

function Library({ user }: { user: User }) {
  const uid = user.uid;
  const { papers, collections, sync } = useLibrary(uid);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("added");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 4000);
  }, []);

  const refreshUsage = useCallback(() => {
    getUsage().then(setUsage, () => {});
  }, []);
  useEffect(refreshUsage, [refreshUsage]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of papers) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [papers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = papers.filter((p) => matchesFilter(p, filter) && (!q || searchText(p).includes(q)));
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "year") sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (sort === "updated") sorted.sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
    return sorted;
  }, [papers, filter, search, sort]);

  const selected = papers.find((p) => p.id === selectedId) ?? null;
  const viewing = papers.find((p) => p.id === viewerId) ?? null;
  const currentCollection = filter.kind === "collection" ? [filter.value] : [];

  async function importFiles(files: File[]) {
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return notify("Only PDF files can be added.");
    for (const [i, f] of pdfs.entries()) {
      notify(`Adding ${pdfs.length > 1 ? `${i + 1}/${pdfs.length}: ` : ""}${f.name}…`);
      try {
        const id = await importPdfFile(uid, f, currentCollection);
        setSelectedId(id);
      } catch (err) {
        notify(`${f.name}: ${(err as Error).message}`);
        return;
      }
    }
    notify(pdfs.length > 1 ? `Added ${pdfs.length} papers` : "Paper added");
    refreshUsage();
  }

  return (
    <div
      className={`layout ${selected ? "has-selection" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void importFiles([...e.dataTransfer.files]);
      }}
    >
      <Sidebar
        uid={uid}
        user={user}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filter={filter}
        onFilter={(f) => {
          setFilter(f);
          setDrawerOpen(false);
        }}
        papers={papers}
        collections={collections}
        tags={tags}
        usage={usage}
        sync={sync}
      />
      <PaperList
        papers={visible}
        title={filterTitle(filter, collections)}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpen={(p) => (p.file ? setViewerId(p.id) : setSelectedId(p.id))}
        onAdd={() => setAddOpen(true)}
        onMenu={() => setDrawerOpen(true)}
        sync={sync}
      />
      {selected ? (
        <PaperDetail
          key={selected.id}
          uid={uid}
          paper={selected}
          collections={collections}
          allTags={tags.map(([t]) => t)}
          onBack={() => setSelectedId(null)}
          onOpenPdf={() => setViewerId(selected.id)}
          onDeleted={() => {
            setSelectedId(null);
            refreshUsage();
          }}
          onFileChanged={refreshUsage}
          notify={notify}
        />
      ) : (
        <div className="detail empty-detail">
          <p>Select a paper, or drop PDFs anywhere to add them.</p>
        </div>
      )}
      {addOpen && (
        <AddPaper
          uid={uid}
          collections={currentCollection}
          onClose={() => setAddOpen(false)}
          onFiles={(files) => {
            setAddOpen(false);
            void importFiles(files);
          }}
          onAdded={(id) => {
            setAddOpen(false);
            setSelectedId(id);
            refreshUsage();
          }}
        />
      )}
      {viewing?.file && <PdfViewer uid={uid} paper={viewing} onClose={() => setViewerId(null)} />}
      {dragging && <div className="drop-overlay">Drop PDFs to add them to your library</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function matchesFilter(p: Paper, f: Filter): boolean {
  switch (f.kind) {
    case "all":
      return true;
    case "unread":
    case "reading":
    case "read":
      return p.status === f.kind;
    case "starred":
      return p.starred;
    case "collection":
      return p.collections.includes(f.value);
    case "tag":
      return p.tags.includes(f.value);
  }
}

function filterTitle(f: Filter, collections: { id: string; name: string }[]): string {
  switch (f.kind) {
    case "all":
      return "All papers";
    case "unread":
      return "To read";
    case "reading":
      return "Reading";
    case "read":
      return "Read";
    case "starred":
      return "Starred";
    case "collection":
      return collections.find((c) => c.id === f.value)?.name ?? "Collection";
    case "tag":
      return `#${f.value}`;
  }
}

function searchText(p: Paper): string {
  return [p.title, p.authors.join(" "), p.venue, p.year ?? "", p.doi, p.arxivId, p.tags.join(" "), p.notes, p.abstract]
    .join(" ")
    .toLowerCase();
}
