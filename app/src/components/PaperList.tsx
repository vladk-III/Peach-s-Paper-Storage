import type { SyncState } from "../library";
import type { Paper } from "../types";
import { shortAuthors } from "../format";

export type SortKey = "added" | "updated" | "year" | "title";

interface Props {
  papers: Paper[];
  title: string;
  search: string;
  onSearch: (s: string) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (p: Paper) => void;
  onAdd: () => void;
  onMenu: () => void;
  sync: SyncState;
}

const STATUS_ICON = { unread: "", reading: "📖", read: "✅" } as const;

export function PaperList(props: Props) {
  const { papers, title, search, onSearch, sort, onSort, selectedId, onSelect, onOpen, onAdd, onMenu, sync } = props;
  return (
    <section className="list">
      <header className="list-header">
        <button className="icon-btn menu-btn" onClick={onMenu} title="Menu">
          ☰
        </button>
        <h2>{title}</h2>
        {sync === "offline" && <span className="badge">Offline</span>}
        <button className="primary add-btn" onClick={onAdd}>
          ＋ Add
        </button>
      </header>
      <div className="list-tools">
        <input type="search" placeholder="Search titles, authors, notes, tags…" value={search} onChange={(e) => onSearch(e.target.value)} />
        <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} title="Sort">
          <option value="added">Recently added</option>
          <option value="updated">Recently edited</option>
          <option value="year">Year</option>
          <option value="title">Title</option>
        </select>
      </div>
      <ul className="paper-list">
        {papers.length === 0 && (
          <li className="empty">{search ? "No papers match your search." : "No papers here yet. Tap ＋ Add or drop in some PDFs."}</li>
        )}
        {papers.map((p) => (
          <li
            key={p.id}
            className={`paper-row ${p.id === selectedId ? "selected" : ""}`}
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => onOpen(p)}
          >
            <div className="paper-title">
              {p.starred && <span title="Starred">⭐ </span>}
              {p.title || <em>Untitled</em>}
            </div>
            <div className="paper-meta">
              <span>{shortAuthors(p.authors)}</span>
              {p.year && <span> · {p.year}</span>}
              {p.venue && <span className="venue"> · {p.venue}</span>}
            </div>
            <div className="paper-flags">
              {p.file && (
                <button
                  className="pdf-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(p);
                  }}
                >
                  PDF
                </button>
              )}
              {STATUS_ICON[p.status] && <span title={p.status}>{STATUS_ICON[p.status]}</span>}
              {p.tags.slice(0, 3).map((t) => (
                <span key={t} className="tag small">
                  {t}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
