import { Folder } from '../types';

export interface TreeNode extends Folder {
    children: TreeNode[];
}

// Mirrors the Move contract's own safety cap (calculate_folder_depth / would_create_cycle in
// notebook.move both bail out after 10 traversal steps) so client-side pre-validation stays in
// sync with what the chain will actually enforce.
const MAX_TRAVERSAL = 10;
const MAX_FOLDER_DEPTH = 5;

function byId(folders: Folder[]): Map<string, Folder> {
    const map = new Map<string, Folder>();
    for (const f of folders) map.set(f.id, f);
    return map;
}

/**
 * Builds a nested tree from the flat folder list the chain returns. Folders whose parentId
 * doesn't resolve to another folder in the list (stale cache, deleted parent, etc.) are treated
 * defensively as roots rather than being dropped.
 */
export function buildFolderTree(folders: Folder[]): TreeNode[] {
    const live = folders.filter(f => !f.isDeleted);
    const idSet = new Set(live.map(f => f.id));
    const childrenByParent = new Map<string | null, Folder[]>();

    for (const folder of live) {
        const parentKey = folder.parentId && idSet.has(folder.parentId) ? folder.parentId : null;
        const siblings = childrenByParent.get(parentKey) ?? [];
        siblings.push(folder);
        childrenByParent.set(parentKey, siblings);
    }

    const sortSiblings = (items: Folder[]) =>
        [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

    const attachChildren = (folder: Folder): TreeNode => ({
        ...folder,
        children: sortSiblings(childrenByParent.get(folder.id) ?? []).map(attachChildren),
    });

    return sortSiblings(childrenByParent.get(null) ?? []).map(attachChildren);
}

/**
 * Reorders a sibling id list by moving draggedId to sit right after the original (pre-move)
 * position `afterIndex` (-1 = move to the front). Removing the dragged id shifts every later
 * sibling left by one, so afterIndex maps to a different slot in the result depending on whether
 * the drag started before or after it.
 */
export function reorderSiblingIds(siblingIds: string[], draggedId: string, afterIndex: number): string[] {
    const originalIndex = siblingIds.indexOf(draggedId);
    const ids = siblingIds.filter(id => id !== draggedId);
    const insertAt = originalIndex !== -1 && afterIndex < originalIndex ? afterIndex + 1 : afterIndex;
    ids.splice(Math.max(0, Math.min(insertAt, ids.length)), 0, draggedId);
    return ids;
}

/**
 * Mirrors notebook.move's calculate_folder_depth: walks up the parent chain counting steps
 * until a root (no parent) is reached, treating a missing/broken parent reference as root.
 */
export function calculateDepthClientSide(folders: Folder[], folderId: string, folderMap = byId(folders)): number {
    let depth = 0;
    let currentId: string | null = folderId;

    while (depth < MAX_TRAVERSAL) {
        const current = currentId ? folderMap.get(currentId) : undefined;
        if (!current || !current.parentId) break;
        currentId = current.parentId;
        depth++;
    }

    return depth;
}

/**
 * Mirrors notebook.move's would_create_cycle: true if proposedParentId is folderId itself, or if
 * walking up from proposedParentId ever reaches folderId.
 */
export function wouldCreateCycleClientSide(
    folders: Folder[],
    folderId: string,
    proposedParentId: string,
    folderMap = byId(folders)
): boolean {
    if (folderId === proposedParentId) return true;

    let currentId: string | null = proposedParentId;
    let depth = 0;

    while (depth < MAX_TRAVERSAL) {
        const current = currentId ? folderMap.get(currentId) : undefined;
        if (!current) break;
        if (current.id === folderId) return true;
        currentId = current.parentId ?? null;
        depth++;
    }

    return false;
}

/**
 * Returns every descendant folder id (children, grandchildren, etc.) below folderId, not just
 * direct children - deleting a folder doesn't cascade, so callers that warn about "what's inside"
 * need the full subtree, not just the immediate level.
 */
export function getDescendantFolderIds(folders: Folder[], folderId: string): string[] {
    const childrenByParent = new Map<string, Folder[]>();
    for (const f of folders) {
        if (!f.parentId) continue;
        const siblings = childrenByParent.get(f.parentId) ?? [];
        siblings.push(f);
        childrenByParent.set(f.parentId, siblings);
    }

    const result: string[] = [];
    const seen = new Set<string>();
    const queue = [folderId];
    // Safety cap matching the rest of this file's defensive traversal limits, in case a stale
    // cache ever produced a cyclic parentId chain (the contract itself prevents creating one).
    while (queue.length && result.length < folders.length) {
        const current = queue.shift()!;
        const children = childrenByParent.get(current) ?? [];
        for (const child of children) {
            if (seen.has(child.id)) continue;
            seen.add(child.id);
            result.push(child.id);
            queue.push(child.id);
        }
    }
    return result;
}

/**
 * Walks up from folderId to the root, returning ancestors in root-to-leaf order (for breadcrumbs).
 * The starting folder itself is included as the last element. Capped at the same traversal safety
 * limit as the depth/cycle helpers.
 */
export function getAncestorChain(folders: Folder[], folderId: string, folderMap = byId(folders)): Folder[] {
    const chain: Folder[] = [];
    let currentId: string | null = folderId;
    let steps = 0;

    while (currentId && steps < MAX_TRAVERSAL) {
        const current: Folder | undefined = folderMap.get(currentId);
        if (!current) break;
        chain.unshift(current);
        currentId = current.parentId ?? null;
        steps++;
    }

    return chain;
}

export interface FlattenedFolder {
    folder: Folder;
    depth: number;
}

/**
 * Depth-first flattening of a folder tree into a single indented list, for pickers/menus that
 * need every folder as one scrollable list rather than a recursive tree widget.
 */
export function flattenFolderTree(tree: TreeNode[], depth = 0): FlattenedFolder[] {
    const result: FlattenedFolder[] = [];
    for (const node of tree) {
        result.push({ folder: node, depth });
        result.push(...flattenFolderTree(node.children, depth + 1));
    }
    return result;
}

export interface NestingCheck {
    allowed: boolean;
    reason?: string;
}

/**
 * Combines the depth<5, cycle, and parent-not-deleted checks the contract enforces on
 * create_folder/update_folder, so the UI can reject an invalid move before submitting a doomed
 * transaction.
 */
export function canNestUnder(folders: Folder[], folderId: string | null, proposedParentId: string | null): NestingCheck {
    if (proposedParentId === null) return { allowed: true };

    const folderMap = byId(folders);
    const parent = folderMap.get(proposedParentId);
    if (!parent) return { allowed: false, reason: 'Destination folder was not found.' };
    if (parent.isDeleted) return { allowed: false, reason: 'Destination folder has been deleted.' };

    if (folderId && wouldCreateCycleClientSide(folders, folderId, proposedParentId, folderMap)) {
        return { allowed: false, reason: "You can't move a folder inside one of its own subfolders." };
    }

    const parentDepth = calculateDepthClientSide(folders, proposedParentId, folderMap);
    if (parentDepth >= MAX_FOLDER_DEPTH) {
        return { allowed: false, reason: 'Folders can only be nested 5 levels deep.' };
    }

    return { allowed: true };
}
