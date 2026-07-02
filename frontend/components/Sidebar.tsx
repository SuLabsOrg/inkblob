import { Archive, ChevronDown, ChevronRight, Folder as FolderIcon, Grid, Pencil, Plus, Settings, Trash2, Users } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Folder } from '../types';
import { buildFolderTree, canNestUnder, reorderSiblingIds, TreeNode } from '../utils/folderTree';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder?: (parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onReparentFolder: (id: string, newParentId: string | null) => void;
  onReorderFolders: (folderIds: string[], sortOrders: number[]) => void;
  onMoveNote: (noteId: string, newFolderId: string | null) => void;
  onOpenSettings?: () => void;
  /** Opens the "Shared With Me" discovery modal (see SharedNotebooksModal) - optional so
   *  Sidebar doesn't hard-require it from every caller/test. */
  onOpenSharedWithMe?: () => void;
  isOpen: boolean;
  /** Mobile-only: closes the drawer overlay (tapping the backdrop). No-op/unused on desktop, where the sidebar is static. */
  onClose?: () => void;
  /** True when viewing a shared notebook with a READ-only grant - hides folder create/rename/
   *  delete affordances and disables all folder/note drag-and-drop. Navigation (select folder,
   *  Trash, expand/collapse, Settings, Shared with me) stays fully available. Default false =
   *  all existing behavior. */
  readOnly?: boolean;
}

const EXPANDED_STORAGE_KEY = 'inkblob_sidebar_expanded';
const FOLDER_DRAG_TYPE = 'application/x-inkblob-folder';
const NOTE_DRAG_TYPE = 'application/x-inkblob-note';

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'trash': return <Trash2 size={16} />;
    case 'archive': return <Archive size={16} />;
    case 'smart': return <Grid size={16} />;
    default: return <FolderIcon size={16} />;
  }
};

interface DragState {
  folderId: string;
  currentParentId: string | null;
}

interface FolderListProps {
  nodes: TreeNode[];
  parentId: string | null;
  depth: number;
  folders: Folder[];
  selectedFolderId: string;
  expanded: Record<string, boolean>;
  toggleExpanded: (id: string) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  drag: DragState | null;
  setDrag: (d: DragState | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  props: SidebarProps;
}

const DropIndicator: React.FC<{
  active: boolean;
  onDrop: (e: React.DragEvent) => void;
}> = ({ active, onDrop }) => {
  const [hovering, setHovering] = useState(false);
  return (
    <div
      className="relative h-1.5 -my-0.5"
      onDragOver={(e) => { if (active) { e.preventDefault(); setHovering(true); } }}
      onDragLeave={() => setHovering(false)}
      onDrop={(e) => { e.preventDefault(); setHovering(false); if (active) onDrop(e); }}
    >
      {active && hovering && (
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-web3-primary" />
      )}
    </div>
  );
};

const FolderList: React.FC<FolderListProps> = ({
  nodes, parentId, depth, folders, selectedFolderId, expanded, toggleExpanded,
  renamingId, setRenamingId, drag, setDrag, dropTargetId, setDropTargetId, props,
}) => {
  // afterIndex is a position in the original `nodes` array (-1 = insert before everything).
  const reorderWithinThisList = (draggedId: string, afterIndex: number) => {
    const ids = reorderSiblingIds(nodes.map(n => n.id), draggedId, afterIndex);
    props.onReorderFolders(ids, ids.map((_, i) => i));
  };

  return (
    <ul>
      <DropIndicator
        active={!props.readOnly && !!drag && drag.currentParentId === parentId}
        onDrop={(e) => {
          if (props.readOnly || !drag) return;
          const draggedId = e.dataTransfer.getData(FOLDER_DRAG_TYPE) || drag.folderId;
          reorderWithinThisList(draggedId, -1); // -1 = insert before everything
          setDrag(null);
        }}
      />
      {nodes.map((node, index) => (
        <React.Fragment key={node.id}>
          <FolderRow
            node={node}
            parentId={parentId}
            depth={depth}
            folders={folders}
            selectedFolderId={selectedFolderId}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            drag={drag}
            setDrag={setDrag}
            dropTargetId={dropTargetId}
            setDropTargetId={setDropTargetId}
            props={props}
          />
          <DropIndicator
            active={!props.readOnly && !!drag && drag.currentParentId === parentId && drag.folderId !== node.id}
            onDrop={(e) => {
              if (props.readOnly || !drag) return;
              const draggedId = e.dataTransfer.getData(FOLDER_DRAG_TYPE) || drag.folderId;
              reorderWithinThisList(draggedId, index + 1);
              setDrag(null);
            }}
          />
        </React.Fragment>
      ))}
    </ul>
  );
};

const FolderRow: React.FC<{
  node: TreeNode;
  parentId: string | null;
  depth: number;
  folders: Folder[];
  selectedFolderId: string;
  expanded: Record<string, boolean>;
  toggleExpanded: (id: string) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  drag: DragState | null;
  setDrag: (d: DragState | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  props: SidebarProps;
}> = ({ node, parentId, depth, folders, selectedFolderId, expanded, toggleExpanded, renamingId, setRenamingId, drag, setDrag, dropTargetId, setDropTargetId, props }) => {
  const [renameValue, setRenameValue] = useState(node.name);
  const isExpanded = expanded[node.id] ?? true;
  const hasChildren = node.children.length > 0;
  const isRenaming = renamingId === node.id;
  const isBeingDragged = drag?.folderId === node.id;
  const isDropTarget = dropTargetId === node.id;

  useEffect(() => { setRenameValue(node.name); }, [node.name, isRenaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) props.onRenameFolder(node.id, trimmed);
    setRenamingId(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetId(null);

    const draggedNoteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (draggedNoteId) {
      props.onMoveNote(draggedNoteId, node.id);
      return;
    }

    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_TYPE) || drag?.folderId;
    if (!draggedFolderId || draggedFolderId === node.id) { setDrag(null); return; }

    const check = canNestUnder(folders, draggedFolderId, node.id);
    if (!check.allowed) {
      setDrag(null);
      return;
    }
    props.onReparentFolder(draggedFolderId, node.id);
    setDrag(null);
  };

  return (
    <li>
      <div
        draggable={!props.readOnly}
        onDragStart={(e) => {
          if (props.readOnly) return;
          e.dataTransfer.setData(FOLDER_DRAG_TYPE, node.id);
          e.dataTransfer.effectAllowed = 'move';
          // Use the list's resolved parentId, not node.parentId directly - buildFolderTree treats
          // a dangling/deleted parent reference as root, and drag state must agree with that same
          // resolution or reorder-within-list's currentParentId check never matches.
          setDrag({ folderId: node.id, currentParentId: parentId });
        }}
        onDragEnd={() => { setDrag(null); setDropTargetId(null); }}
        onDragOver={(e) => {
          if (props.readOnly) return;
          e.preventDefault();
          e.stopPropagation();
          if (drag && drag.folderId === node.id) return;
          setDropTargetId(node.id);
        }}
        onDragLeave={() => { if (isDropTarget) setDropTargetId(null); }}
        onDrop={props.readOnly ? undefined : handleDrop}
        className={`group w-full flex items-center px-2 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${selectedFolderId === node.id
          ? 'bg-web3-primary/20 text-web3-primary'
          : 'text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text'
          } ${isBeingDragged ? 'opacity-40' : ''} ${isDropTarget ? 'ring-1 ring-web3-primary bg-web3-primary/10' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          onClick={() => toggleExpanded(node.id)}
          className={`mr-0.5 p-0.5 rounded hover:bg-web3-cardHover/60 ${hasChildren ? '' : 'invisible'}`}
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <button
          onClick={() => props.onSelectFolder(node.id)}
          className="flex items-center flex-1 min-w-0 gap-2 text-left"
        >
          <span className={selectedFolderId === node.id ? 'text-web3-primary' : 'text-web3-textMuted'}>
            {getIcon(node.icon)}
          </span>
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="flex-1 min-w-0 bg-web3-bg/60 rounded px-1 py-0.5 text-sm text-web3-text outline-none border border-web3-primary/40"
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
        </button>

        {!isRenaming && !props.readOnly && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); props.onCreateFolder?.(node.id); }}
              title="New subfolder"
              aria-label="New subfolder"
              className="p-1 rounded hover:bg-web3-cardHover/80 hover:text-web3-primary"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setRenamingId(node.id); }}
              title="Rename"
              aria-label="Rename folder"
              className="p-1 rounded hover:bg-web3-cardHover/80 hover:text-web3-primary"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); props.onDeleteFolder(node.id); }}
              title="Delete folder"
              aria-label="Delete folder"
              className="p-1 rounded hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <FolderList
          nodes={node.children}
          parentId={node.id}
          depth={depth + 1}
          folders={folders}
          selectedFolderId={selectedFolderId}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          drag={drag}
          setDrag={setDrag}
          dropTargetId={dropTargetId}
          setDropTargetId={setDropTargetId}
          props={props}
        />
      )}
    </li>
  );
};

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { folders, selectedFolderId, onSelectFolder, onCreateFolder, onOpenSettings, onOpenSharedWithMe, isOpen, onClose, onMoveNote, readOnly = false } = props;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(loadExpanded);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [rootIsDropTarget, setRootIsDropTarget] = useState(false);

  useEffect(() => {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const systemFolders = folders.filter(f => f.type === 'system' && f.id !== 'trash');

  if (!isOpen) return null;

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRootIsDropTarget(false);
    // Read-only shared mode: all drag sources are disabled, but refuse drops anyway.
    if (readOnly) return;

    const draggedNoteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (draggedNoteId) {
      onMoveNote(draggedNoteId, null);
      return;
    }

    const draggedFolderId = e.dataTransfer.getData(FOLDER_DRAG_TYPE) || drag?.folderId;
    if (draggedFolderId) {
      props.onReparentFolder(draggedFolderId, null);
    }
    setDrag(null);
  };

  return (
    <>
      {/* Mobile-only backdrop - the sidebar renders as a fixed drawer overlay below the md
          breakpoint (no room for a persistent 3-pane layout on a phone-width screen); at md+
          it's `md:static` and takes part in the normal flex row like before. */}
      <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-40 w-64 bg-web3-card/95 md:bg-web3-card/30 h-full border-r border-web3-border/50 flex flex-col select-none transition-all duration-300 ease-in-out backdrop-blur-md shadow-2xl md:shadow-none md:static md:z-auto">
      {/* Logo Section */}
      <div className="p-4 border-b border-web3-border/30 bg-web3-card/20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src="/logo.png" alt="Inkblob Logo" className="w-8 h-8 object-contain drop-shadow-sm" />
            <div className="absolute -inset-1 bg-web3-primary/20 rounded-full blur-md opacity-50"></div>
          </div>
          <div>
            <span className="text-lg font-bold text-web3-text">Inkblob</span>
            <div className="text-xs text-web3-textMuted">Secure DNotes</div>
          </div>
        </div>
      </div>

      {/* System folders (e.g. "Notes") */}
      <div className="px-3 pt-3">
        {systemFolders.map(folder => (
          <button
            key={folder.id}
            onClick={() => onSelectFolder(folder.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg text-sm font-medium transition-all ${selectedFolderId === folder.id
              ? 'bg-web3-primary/20 text-web3-primary'
              : 'text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text'
              }`}
          >
            <span className={selectedFolderId === folder.id ? 'text-web3-primary' : 'text-web3-textMuted'}>
              {getIcon(folder.icon)}
            </span>
            {folder.name}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-2"
        onDragOver={(e) => { if (drag) { e.preventDefault(); setRootIsDropTarget(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setRootIsDropTarget(false); }}
        onDrop={handleRootDrop}
      >
        <div className="flex items-center justify-between px-1 mb-1">
          <h3 className="text-xs font-bold text-web3-textMuted uppercase tracking-wider">Library</h3>
          {!readOnly && (
            <button
              onClick={() => onCreateFolder?.(null)}
              title="New folder"
              aria-label="New folder"
              className="p-1 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-primary"
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        <FolderList
          nodes={tree}
          parentId={null}
          depth={0}
          folders={folders}
          selectedFolderId={selectedFolderId}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          drag={drag}
          setDrag={setDrag}
          dropTargetId={dropTargetId}
          setDropTargetId={setDropTargetId}
          props={props}
        />

        {drag && (
          <div className={`mt-2 h-10 rounded-lg border border-dashed flex items-center justify-center text-xs transition-colors ${rootIsDropTarget ? 'border-web3-primary text-web3-primary bg-web3-primary/10' : 'border-web3-border text-web3-textMuted/60'
            }`}>
            Drop here to move to root
          </div>
        )}
      </div>

      {/* Bottom area */}
      <div className="mt-auto p-4 border-t border-web3-border/30 flex flex-col gap-2">
        <div
          onClick={onOpenSettings}
          className="flex items-center text-xs text-web3-textMuted justify-between cursor-pointer hover:text-web3-primary transition-colors group p-2 rounded hover:bg-web3-cardHover"
        >
          <span className="flex items-center gap-2">
            <div className="p-1 rounded bg-web3-card border border-web3-border group-hover:border-web3-primary transition-colors">
              <Settings size={12} />
            </div>
            Settings
          </span>
        </div>

        {/* Shared With Me - discovery entry point for notebooks OTHER people have granted this
            wallet access to (see SharedNotebooksModal / useSharedNotebooks). Distinct from the
            per-notebook "Share" action in Editor.tsx (ShareModal), which is for granting access
            to the user's OWN notebook. */}
        {onOpenSharedWithMe && (
          <div
            onClick={onOpenSharedWithMe}
            className="flex items-center text-xs text-web3-textMuted justify-between cursor-pointer hover:text-web3-primary transition-colors group p-2 rounded hover:bg-web3-cardHover"
          >
            <span className="flex items-center gap-2">
              <div className="p-1 rounded bg-web3-card border border-web3-border group-hover:border-web3-primary transition-colors">
                <Users size={12} />
              </div>
              Shared with me
            </span>
          </div>
        )}

        {/* Trash Item (Bottom) */}
        {folders.find(f => f.id === 'trash') && (
          <div
            onClick={() => onSelectFolder('trash')}
            className={`flex items-center text-xs justify-between cursor-pointer transition-colors group p-2 rounded hover:bg-web3-cardHover ${selectedFolderId === 'trash' ? 'text-red-400 bg-red-500/10' : 'text-web3-textMuted hover:text-red-400'
              }`}
          >
            <span className="flex items-center gap-2">
              <div className={`p-1 rounded bg-web3-card border border-web3-border transition-colors ${selectedFolderId === 'trash' ? 'border-red-400/50' : 'group-hover:border-red-400/50'
                }`}>
                <Trash2 size={12} />
              </div>
              Trash
            </span>
          </div>
        )}
      </div>
    </div>
    </>
  );
};
