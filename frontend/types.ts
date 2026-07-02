export interface Note {
  id: string;
  title: string;
  content: string; // May be empty until the note's Walrus blob content is fetched on demand
  folderId: string;
  updatedAt: Date;
  isPinned?: boolean;
  blobId: string; // Walrus blob ID for content retrieval; '' for a not-yet-saved note
  icon?: string;
  coverImage?: string;
  isDeleted?: boolean;
  parentNoteId?: string | null;
  // WAL storage-fee escrow bookkeeping, mirrored from the on-chain Note (see notebook.move) -
  // used to drive a "claim rebate" affordance in the Trash view (see claim_wal_storage_rebate).
  walPaid?: number; // FROST currently escrowed in the notebook's WalFeeReserve for this note, unclaimed
  rebateClaimed?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  icon: 'folder' | 'trash' | 'archive' | 'smart' | 'file-text';
  type: 'system' | 'user';
  parentId?: string | null;
  sortOrder?: number;
  isDeleted?: boolean;
}

export type ViewMode = 'list' | 'gallery';