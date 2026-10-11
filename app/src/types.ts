import type { Timestamp } from "firebase/firestore";

export type ReadStatus = "unread" | "reading" | "read";

export interface PaperFile {
  name: string;
  size: number;
  uploadedAt: string;
}

export interface PaperMetadata {
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

export interface Paper extends PaperMetadata {
  id: string;
  tags: string[];
  collections: string[];
  notes: string;
  status: ReadStatus;
  starred: boolean;
  file: PaperFile | null;
  /** Last page viewed, so reading resumes where you left off on any device. */
  lastPage: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Collection {
  id: string;
  name: string;
}

export const emptyMetadata: PaperMetadata = {
  title: "",
  authors: [],
  year: null,
  venue: "",
  abstract: "",
  doi: "",
  arxivId: "",
  url: "",
  itemType: "article",
};
