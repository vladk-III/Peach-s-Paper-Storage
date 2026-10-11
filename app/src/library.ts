// Firestore data layer. Every account's data lives under users/{uid}/…
// and security rules (firebase/firestore.rules) only let that user read it.
import { useEffect, useState } from "react";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import { deletePdf } from "./api";
import { removePdf } from "./pdfCache";
import { emptyMetadata, type Collection, type Paper, type PaperMetadata } from "./types";

const papersRef = (uid: string) => collection(db, "users", uid, "papers");
const collectionsRef = (uid: string) => collection(db, "users", uid, "collections");

export type SyncState = "loading" | "synced" | "saving" | "offline";

export function useLibrary(uid: string) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sync, setSync] = useState<SyncState>("loading");

  useEffect(() => {
    const unsubPapers = onSnapshot(
      query(papersRef(uid), orderBy("createdAt", "desc")),
      { includeMetadataChanges: true },
      (snap) => {
        setPapers(
          snap.docs.map((d) => normalize(d.id, d.data({ serverTimestamps: "estimate" }))),
        );
        setSync(snap.metadata.hasPendingWrites ? "saving" : snap.metadata.fromCache ? "offline" : "synced");
      },
      (err) => {
        console.error(err);
        setSync("offline");
      },
    );
    const unsubCollections = onSnapshot(query(collectionsRef(uid), orderBy("name")), (snap) => {
      setCollections(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? "") })));
    });
    return () => {
      unsubPapers();
      unsubCollections();
    };
  }, [uid]);

  return { papers, collections, sync };
}

function normalize(id: string, data: Record<string, any>): Paper {
  return {
    ...emptyMetadata,
    tags: [],
    collections: [],
    notes: "",
    status: "unread",
    starred: false,
    file: null,
    lastPage: 1,
    createdAt: null,
    updatedAt: null,
    ...data,
    id,
  } as Paper;
}

export function newPaperId(uid: string): string {
  return doc(papersRef(uid)).id;
}

export async function createPaper(
  uid: string,
  id: string,
  fields: Partial<PaperMetadata> & Partial<Pick<Paper, "file" | "collections">>,
): Promise<void> {
  // Not awaited by callers that want offline support: the write is queued locally
  // and the promise resolves only once the server confirms it.
  await setDoc(doc(papersRef(uid), id), {
    ...emptyMetadata,
    tags: [],
    collections: [],
    notes: "",
    status: "unread",
    starred: false,
    file: null,
    lastPage: 1,
    ...fields,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updatePaper(uid: string, id: string, patch: Partial<Omit<Paper, "id" | "createdAt" | "updatedAt">>) {
  return updateDoc(doc(papersRef(uid), id), { ...patch, updatedAt: serverTimestamp() }).catch((err) => {
    console.error("Update failed", err);
  });
}

export async function deletePaper(uid: string, paper: Paper): Promise<void> {
  if (paper.file) {
    await deletePdf(paper.id);
    await removePdf(uid, paper.id);
  }
  await deleteDoc(doc(papersRef(uid), paper.id));
}

export async function createCollection(uid: string, name: string): Promise<void> {
  await setDoc(doc(collectionsRef(uid)), { name, createdAt: serverTimestamp() });
}

export async function renameCollection(uid: string, id: string, name: string): Promise<void> {
  await updateDoc(doc(collectionsRef(uid), id), { name });
}

export async function deleteCollection(uid: string, id: string): Promise<void> {
  const members = await getDocs(query(papersRef(uid), where("collections", "array-contains", id)));
  const batch = writeBatch(db);
  members.forEach((d) => batch.update(d.ref, { collections: arrayRemove(id), updatedAt: serverTimestamp() }));
  batch.delete(doc(collectionsRef(uid), id));
  await batch.commit();
}
