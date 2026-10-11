import { signOut, type User } from "firebase/auth";
import { auth } from "../firebase";
import { createCollection, deleteCollection, renameCollection, type SyncState } from "../library";
import type { Usage } from "../api";
import type { Collection, Paper } from "../types";
import { formatBytes } from "../format";
import { InstallButton } from "./InstallButton";

export type Filter =
  | { kind: "all" | "unread" | "reading" | "read" | "starred" }
  | { kind: "collection"; value: string }
  | { kind: "tag"; value: string };

interface Props {
  uid: string;
  user: User;
  open: boolean;
  onClose: () => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  papers: Paper[];
  collections: Collection[];
  tags: [string, number][];
  usage: Usage | null;
  sync: SyncState;
}

export function Sidebar({ uid, user, open, onClose, filter, onFilter, papers, collections, tags, usage, sync }: Props) {
  const count = (pred: (p: Paper) => boolean) => papers.filter(pred).length;
  const is = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);

  const item = (f: Filter, icon: string, label: string, n: number) => (
    <button key={label + ("value" in f ? f.value : "")} className={`nav-item ${is(f) ? "active" : ""}`} onClick={() => onFilter(f)}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      <span className="nav-count">{n}</span>
    </button>
  );

  async function addCollection() {
    const name = window.prompt("Collection name")?.trim();
    if (name) await createCollection(uid, name);
  }

  async function editCollection(c: Collection) {
    const name = window.prompt("Rename collection (leave empty to delete it)", c.name);
    if (name === null) return;
    if (name.trim()) await renameCollection(uid, c.id, name.trim());
    else if (window.confirm(`Delete the collection "${c.name}"? Papers in it are kept.`)) {
      await deleteCollection(uid, c.id);
      if (filter.kind === "collection" && filter.value === c.id) onFilter({ kind: "all" });
    }
  }

  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">🍑 Peach Papers</div>
        <nav>
          {item({ kind: "all" }, "📚", "All papers", papers.length)}
          {item({ kind: "unread" }, "📥", "To read", count((p) => p.status === "unread"))}
          {item({ kind: "reading" }, "📖", "Reading", count((p) => p.status === "reading"))}
          {item({ kind: "read" }, "✅", "Read", count((p) => p.status === "read"))}
          {item({ kind: "starred" }, "⭐", "Starred", count((p) => p.starred))}

          <div className="nav-heading">
            Collections
            <button className="icon-btn small" title="New collection" onClick={addCollection}>
              ＋
            </button>
          </div>
          {collections.length === 0 && <p className="nav-empty">None yet</p>}
          {collections.map((c) => (
            <div key={c.id} className="nav-row">
              {item({ kind: "collection", value: c.id }, "📁", c.name, count((p) => p.collections.includes(c.id)))}
              <button className="icon-btn small row-action" title="Rename / delete" onClick={() => editCollection(c)}>
                ✎
              </button>
            </div>
          ))}

          <div className="nav-heading">Tags</div>
          {tags.length === 0 && <p className="nav-empty">None yet</p>}
          <div className="tag-cloud">
            {tags.map(([t, n]) => (
              <button
                key={t}
                className={`tag ${filter.kind === "tag" && filter.value === t ? "active" : ""}`}
                onClick={() => onFilter({ kind: "tag", value: t })}
              >
                {t} <span className="muted">{n}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <InstallButton />
          <div className={`sync sync-${sync}`}>
            {sync === "synced" && "● Synced"}
            {sync === "saving" && "● Saving…"}
            {sync === "offline" && "● Offline — changes will sync later"}
            {sync === "loading" && "● Loading…"}
          </div>
          {usage && (
            <div className="usage" title={`Shared storage: ${formatBytes(usage.totalUsed)} of ${formatBytes(usage.totalLimit)}`}>
              <div className="usage-bar">
                <div style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
              </div>
              <span className="muted">
                {formatBytes(usage.used)} of {formatBytes(usage.limit)} used
              </span>
            </div>
          )}
          <div className="account">
            <span className="muted" title={user.email ?? ""}>
              {user.displayName || user.email}
            </span>
            <button className="link" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
