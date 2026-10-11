import { useRef, useState, type FormEvent } from "react";
import { createManual, importIdentifier } from "../importer";

interface Props {
  uid: string;
  collections: string[];
  onClose: () => void;
  onFiles: (files: File[]) => void;
  onAdded: (id: string) => void;
}

export function AddPaper({ uid, collections, onClose, onFiles, onAdded }: Props) {
  const [ident, setIdent] = useState("");
  const [fetchPdf, setFetchPdf] = useState(true);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function byIdentifier(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      onAdded(await importIdentifier(uid, ident, collections, fetchPdf));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function manual(e: FormEvent) {
    e.preventDefault();
    if (title.trim()) onAdded(await createManual(uid, title.trim(), collections));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add paper">
        <header>
          <h2>Add a paper</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </header>

        <section>
          <h3>Upload PDFs</h3>
          <p className="muted">Details are filled in automatically when the PDF contains a DOI or arXiv id.</p>
          <button className="primary" onClick={() => fileInput.current?.click()}>
            Choose PDF files…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) onFiles(files);
            }}
          />
        </section>

        <form onSubmit={byIdentifier}>
          <h3>From DOI or arXiv</h3>
          <input
            value={ident}
            onChange={(e) => setIdent(e.target.value)}
            placeholder="10.1038/nature14539 · 1706.03762 · arxiv.org/abs/…"
            autoFocus
          />
          <label className="check">
            <input type="checkbox" checked={fetchPdf} onChange={(e) => setFetchPdf(e.target.checked)} />
            Also download the PDF when it's on arXiv
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy || !ident.trim()}>
            {busy ? "Looking up…" : "Look up & add"}
          </button>
        </form>

        <form onSubmit={manual}>
          <h3>Manually</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <button disabled={!title.trim()}>Add</button>
        </form>
      </div>
    </div>
  );
}
