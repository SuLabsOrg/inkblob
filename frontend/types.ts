export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string;
  updatedAt: Date;
  isPinned?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  icon: 'folder' | 'trash' | 'archive' | 'smart';
  type: 'system' | 'user';
}

export type ViewMode = 'list' | 'gallery';