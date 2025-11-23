export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string;
  updatedAt: Date;
  isPinned?: boolean;
  blobId?: string; // Optional for now, but used in App.tsx
}

export interface Folder {
  id: string;
  name: string;
  icon: 'folder' | 'trash' | 'archive' | 'smart' | 'file-text';
  type: 'system' | 'user';
}

export type ViewMode = 'list' | 'gallery';