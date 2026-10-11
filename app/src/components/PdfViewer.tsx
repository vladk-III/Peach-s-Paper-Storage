import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfjs } from "../pdf";
import { getPdf } from "../pdfCache";
import { updatePaper } from "../library";
import type { Paper } from "../types";

interface Props {
  uid: string;
  paper: Paper;
  onClose: () => void;
}

interface PageSize {
  width: number;
  height: number;
}

const PAGE_GAP = 12;

export function PdfViewer({ uid, paper, onClose }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [blobUrl, setBlobUrl] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(1);
  const [page, setPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const startPage = useRef(paper.lastPage || 1);

  // Load the PDF (from the device cache when possible) and measure every page.
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    let url = "";
    (async () => {
      try {
        const blob = await getPdf(uid, paper.id, paper.file!);
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const doc = await task.promise;
        const s: PageSize[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
          s.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setSizes(s);
        setPdf(doc);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || "Couldn't open this PDF");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
      if (url) URL.revokeObjectURL(url);
    };
    // Reload only if a different file is uploaded.
  }, [uid, paper.id, paper.file?.uploadedAt]);

  // Fit pages to the window width.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || sizes.length === 0) return;
    const maxWidth = Math.max(...sizes.map((s) => s.width));
    const measure = () => setFitWidth(Math.min(2, (el.clientWidth - 24) / maxWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizes]);

  const scale = fitWidth * zoom;

  // Jump back to where you were last reading (on any device).
  useLayoutEffect(() => {
    if (restored.current || !pdf || !scroller.current) return;
    restored.current = true;
    const target = Math.min(startPage.current, sizes.length);
    const top = sizes.slice(0, target - 1).reduce((sum, s) => sum + s.height * scale + PAGE_GAP, 0);
    scroller.current.scrollTop = top;
    setPage(target);
  }, [pdf, sizes, scale]);

  // Keep the reading position as you zoom.
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && prevScale.current !== scale) el.scrollTop *= scale / prevScale.current;
    prevScale.current = scale;
  }, [scale]);

  // Save reading position (debounced) so other devices resume here.
  useEffect(() => {
    if (!pdf || page === paper.lastPage) return;
    const t = window.setTimeout(() => updatePaper(uid, paper.id, { lastPage: page }), 1500);
    return () => window.clearTimeout(t);
  }, [page, pdf, uid, paper.id, paper.lastPage]);

  // Mark as "reading" the first time it's opened.
  useEffect(() => {
    if (paper.status === "unread") updatePaper(uid, paper.id, { status: "reading" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => Math.min(4, z * 1.2));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.3, z / 1.2));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const mid = el.scrollTop + el.clientHeight / 3;
    let y = 0;
    for (let i = 0; i < sizes.length; i++) {
      y += sizes[i].height * scale + PAGE_GAP;
      if (y > mid) {
        if (page !== i + 1) setPage(i + 1);
        return;
      }
    }
  }

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <button className="icon-btn" onClick={onClose} title="Close (Esc)">
          ‹ Library
        </button>
        <span className="viewer-title">{paper.title}</span>
        <span className="muted">
          {sizes.length ? `${page} / ${sizes.length}` : ""}
        </span>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} title="Zoom out">
          −
        </button>
        <button className="icon-btn" onClick={() => setZoom(1)} title="Fit width">
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.min(4, z * 1.2))} title="Zoom in">
          ＋
        </button>
        {blobUrl && (
          <a className="icon-btn" href={blobUrl} download={paper.file?.name ?? "paper.pdf"} title="Download">
            ⤓
          </a>
        )}
      </header>
      <div className="viewer-scroll" ref={scroller} onScroll={onScroll}>
        {error && <p className="error viewer-msg">{error}</p>}
        {!pdf && !error && <p className="muted viewer-msg">Opening…</p>}
        {pdf &&
          sizes.map((s, i) => <PdfPage key={i} pdf={pdf} pageNumber={i + 1} width={s.width * scale} height={s.height * scale} scale={scale} />)}
      </div>
    </div>
  );
}

/** One page: only rendered while near the screen, to keep memory low on phones/tablets. */
function PdfPage({ pdf, pageNumber, width, height, scale }: { pdf: PDFDocumentProxy; pageNumber: number; width: number; height: number; scale: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!near || !el) return;
    let task: RenderTask | null = null;
    let textLayer: InstanceType<typeof pdfjs.TextLayer> | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = page.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      await task.promise;
      if (cancelled) return;
      const textDiv = document.createElement("div");
      textDiv.className = "textLayer";
      el.replaceChildren(canvas, textDiv);
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
      await textLayer.render();
    })().catch((err) => {
      if (err?.name !== "RenderingCancelledException") console.warn(err);
    });
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
      el.replaceChildren();
    };
  }, [near, pdf, pageNumber, scale]);

  return (
    <div
      ref={box}
      className="pdf-page"
      style={{ width, height, marginBottom: PAGE_GAP, ["--total-scale-factor" as string]: scale }}
    />
  );
}
