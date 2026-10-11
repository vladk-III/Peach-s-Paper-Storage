import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { deletePaper, updatePaper } from "../library";
import { deletePdf, importArxivPdf, uploadPdf } from "../api";
import { putPdf, removePdf } from "../pdfCache";
import { toBibtex } from "../bibtex";
import { formatBytes } from "../format";
import type { Collection, Paper, ReadStatus } from "../types";

interface Props {
  uid: string;
  paper: Paper;
  collections: Collection[];
  allTags: string[];
  onBack: () => void;
  onOpenPdf: () => void;
  onDeleted: () => void;
  onFileChanged: () => void;
  notify: (msg: string) => void;
}

export function PaperDetail({ uid, paper, collections, allTags, onBack, onOpenPdf, onDeleted, onFileChanged, notify }: Props) {
  const save = (patch: Parameters<typeof updatePaper>[2]) => updatePaper(uid, paper.id, patch);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");

  async function attach(file: File) {
    setBusy("Uploading…");
    try {
      const pf = await uploadPdf(paper.id, file, file.name);
      await putPdf(uid, paper.id, pf, file);
      await save({ file: pf });
      onFileChanged();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function fetchArxiv() {
    setBusy("Fetching from arXiv…");
    try {
      await save({ file: await importArxivPdf(paper.id, paper.arxivId) });
      onFileChanged();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function removeFile() {
    if (!window.confirm("Remove the PDF from this paper? Notes and details are kept.")) return;
    setBusy("Removing…");
    try {
      await deletePdf(paper.id);
      await removePdf(uid, paper.id);
      await save({ file: null });
      onFileChanged();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${paper.title || "this paper"}" and its PDF? This can't be undone.`)) return;
    try {
      await deletePaper(uid, paper);
      onDeleted();
    } catch (err) {
      notify((err as Error).message);
    }
  }

  async function copyBibtex() {
    try {
      await navigator.clipboard.writeText(toBibtex(paper));
      notify("BibTeX copied");
    } catch {
      window.prompt("Copy this BibTeX:", toBibtex(paper));
    }
  }

  return (
    <section className="detail">
      <header className="detail-header">
        <button className="icon-btn back-btn" onClick={onBack} title="Back">
          ‹ Back
        </button>
        <div className="spacer" />
        <button className={`icon-btn ${paper.starred ? "starred" : ""}`} onClick={() => save({ starred: !paper.starred })} title="Star">
          {paper.starred ? "★" : "☆"}
        </button>
        <select value={paper.status} onChange={(e) => save({ status: e.target.value as ReadStatus })}>
          <option value="unread">To read</option>
          <option value="reading">Reading</option>
          <option value="read">Read</option>
        </select>
      </header>

      <div className="detail-body">
        <Field className="title-field" value={paper.title} placeholder="Title" multiline onCommit={(title) => save({ title })} />

        <div className="pdf-box">
          {paper.file ? (
            <>
              <button className="primary" onClick={onOpenPdf}>
                Open PDF{paper.lastPage > 1 ? ` (p. ${paper.lastPage})` : ""}
              </button>
              <span className="muted">
                {paper.file.name} · {formatBytes(paper.file.size)}
              </span>
              <span className="pdf-actions">
                <button className="link" onClick={() => fileInput.current?.click()}>
                  Replace
                </button>
                <button className="link danger" onClick={removeFile}>
                  Remove
                </button>
              </span>
            </>
          ) : (
            <>
              <button onClick={() => fileInput.current?.click()}>Attach PDF</button>
              {paper.arxivId && <button onClick={fetchArxiv}>Get PDF from arXiv</button>}
            </>
          )}
          {busy && <span className="muted">{busy}</span>}
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void attach(f);
            }}
          />
        </div>

        <dl className="fields">
          <dt>Authors</dt>
          <dd>
            <Field
              value={paper.authors.join("; ")}
              placeholder="Add authors, separated by ;"
              onCommit={(v) => save({ authors: v.split(";").map((a) => a.trim()).filter(Boolean) })}
            />
          </dd>
          <dt>Year</dt>
          <dd>
            <Field
              value={paper.year ? String(paper.year) : ""}
              placeholder="Add year"
              inputMode="numeric"
              onCommit={(v) => save({ year: /^\d{3,4}$/.test(v.trim()) ? Number(v.trim()) : null })}
            />
          </dd>
          <dt>Venue</dt>
          <dd>
            <Field value={paper.venue} placeholder="Add journal or conference" onCommit={(venue) => save({ venue })} />
          </dd>
          <dt>DOI</dt>
          <dd>
            <Field value={paper.doi} placeholder="Add DOI" onCommit={(doi) => save({ doi })} />
          </dd>
          <dt>arXiv</dt>
          <dd>
            <Field value={paper.arxivId} placeholder="Add arXiv id" onCommit={(arxivId) => save({ arxivId })} />
          </dd>
          <dt>URL</dt>
          <dd className="url-field">
            <Field value={paper.url} placeholder="Add link" onCommit={(url) => save({ url })} />
            {/^https?:\/\//.test(paper.url) && (
              <a href={paper.url} target="_blank" rel="noreferrer" title="Open link">
                ↗
              </a>
            )}
          </dd>
        </dl>

        <h3>Tags</h3>
        <TagEditor tags={paper.tags} suggestions={allTags} onChange={(tags) => save({ tags })} />

        {collections.length > 0 && (
          <>
            <h3>Collections</h3>
            <div className="collection-picks">
              {collections.map((c) => (
                <label key={c.id} className="check">
                  <input
                    type="checkbox"
                    checked={paper.collections.includes(c.id)}
                    onChange={(e) =>
                      save({
                        collections: e.target.checked
                          ? [...paper.collections, c.id]
                          : paper.collections.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </>
        )}

        <h3>Notes</h3>
        <Field
          className="notes"
          value={paper.notes}
          placeholder="Your notes — saved and synced automatically"
          multiline
          autosave
          onCommit={(notes) => save({ notes })}
        />

        {paper.abstract && (
          <details className="abstract">
            <summary>Abstract</summary>
            <p>{paper.abstract}</p>
          </details>
        )}

        <div className="detail-actions">
          <button onClick={copyBibtex}>Copy BibTeX</button>
          <button className="danger" onClick={remove}>
            Delete paper
          </button>
        </div>
        <p className="muted small">
          Added {paper.createdAt?.toDate().toLocaleDateString() ?? "just now"}
          {paper.updatedAt && ` · edited ${paper.updatedAt.toDate().toLocaleString()}`}
        </p>
      </div>
    </section>
  );
}

/**
 * Text field that edits a local draft and saves on blur (or while typing, with
 * `autosave`). While you're not editing it, it follows the synced value, so
 * edits from other devices show up live.
 */
function Field(props: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autosave?: boolean;
  className?: string;
  inputMode?: "numeric";
}) {
  const { value, onCommit, placeholder, multiline, autosave, className, inputMode } = props;
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<number>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    // Grow textareas to fit their content.
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [draft]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (v: string) => {
    window.clearTimeout(timer.current);
    if (v !== value) onCommit(v);
  };

  const common = {
    className: `field ${className ?? ""}`,
    value: draft,
    placeholder,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      commit(draft);
    },
  };

  if (multiline) {
    return (
      <textarea
        ref={ref}
        rows={1}
        {...common}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (autosave) {
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => onCommit(v), 800);
          }
        }}
      />
    );
  }
  return (
    <input
      {...common}
      inputMode={inputMode}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TagEditor({ tags, suggestions, onChange }: { tags: string[]; suggestions: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().replace(/^#/, "");
    setInput("");
    if (t && !tags.includes(t)) onChange([...tags, t]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };
  return (
    <div className="tag-editor">
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
          <button className="tag-x" onClick={() => onChange(tags.filter((x) => x !== t))} title={`Remove ${t}`}>
            ×
          </button>
        </span>
      ))}
      <input
        list="tag-suggestions"
        placeholder="Add tag…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
      />
      <datalist id="tag-suggestions">
        {suggestions.filter((s) => !tags.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
