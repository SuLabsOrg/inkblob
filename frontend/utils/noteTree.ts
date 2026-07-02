import { Note } from '../types';

export interface NoteTreeNode extends Note {
    children: NoteTreeNode[];
}

// Mirrors the Move contract's own safety cap (calculate_folder_depth / would_create_cycle in
// notebook.move both bail out after 10 traversal steps) so client-side pre-validation stays in
// sync with what the chain will actually enforce. Note nesting reuses the same depth cap as
// folders via a new constant on the contract side rather than hardcoding 5 again.
const MAX_TRAVERSAL = 10;
const MAX_NOTE_DEPTH = 5;

function byId(notes: Note[]): Map<string, Note> {
    const map = new Map<string, Note>();
    for (const n of notes) map.set(n.id, n);
    return map;
}

/**
 * Builds a nested tree from the flat note list the chain returns. Notes whose parentNoteId
 * doesn't resolve to another note in the list (stale cache, deleted parent, etc.) are treated
 * defensively as roots rather than being dropped.
 */
export function buildNoteTree(notes: Note[]): NoteTreeNode[] {
    const live = notes.filter(n => !n.isDeleted);
    const idSet = new Set(live.map(n => n.id));
    const childrenByParent = new Map<string | null, Note[]>();

    for (const note of live) {
        const parentKey = note.parentNoteId && idSet.has(note.parentNoteId) ? note.parentNoteId : null;
        const siblings = childrenByParent.get(parentKey) ?? [];
        siblings.push(note);
        childrenByParent.set(parentKey, siblings);
    }

    const sortSiblings = (items: Note[]) =>
        [...items].sort((a, b) => a.title.localeCompare(b.title));

    const attachChildren = (note: Note): NoteTreeNode => ({
        ...note,
        children: sortSiblings(childrenByParent.get(note.id) ?? []).map(attachChildren),
    });

    return sortSiblings(childrenByParent.get(null) ?? []).map(attachChildren);
}

/**
 * Mirrors notebook.move's calculate_folder_depth (applied to notes): walks up the parent chain
 * counting steps until a root (no parent) is reached, treating a missing/broken parent reference
 * as root.
 */
export function calculateNoteDepthClientSide(notes: Note[], noteId: string, noteMap = byId(notes)): number {
    let depth = 0;
    let currentId: string | null = noteId;

    while (depth < MAX_TRAVERSAL) {
        const current = currentId ? noteMap.get(currentId) : undefined;
        if (!current || !current.parentNoteId) break;
        currentId = current.parentNoteId;
        depth++;
    }

    return depth;
}

/**
 * Mirrors notebook.move's would_create_cycle (applied to notes): true if proposedParentId is
 * noteId itself, or if walking up from proposedParentId ever reaches noteId.
 */
export function wouldCreateNoteCycleClientSide(
    notes: Note[],
    noteId: string,
    proposedParentId: string,
    noteMap = byId(notes)
): boolean {
    if (noteId === proposedParentId) return true;

    let currentId: string | null = proposedParentId;
    let depth = 0;

    while (depth < MAX_TRAVERSAL) {
        const current = currentId ? noteMap.get(currentId) : undefined;
        if (!current) break;
        if (current.id === noteId) return true;
        currentId = current.parentNoteId ?? null;
        depth++;
    }

    return false;
}

/**
 * Returns every descendant note id (children, grandchildren, etc.) below noteId, not just direct
 * children - deleting a note doesn't cascade, so callers that warn about "what's inside" need the
 * full subtree, not just the immediate level.
 */
export function getDescendantNoteIds(notes: Note[], noteId: string): string[] {
    const childrenByParent = new Map<string, Note[]>();
    for (const n of notes) {
        if (!n.parentNoteId) continue;
        const siblings = childrenByParent.get(n.parentNoteId) ?? [];
        siblings.push(n);
        childrenByParent.set(n.parentNoteId, siblings);
    }

    const result: string[] = [];
    const seen = new Set<string>();
    const queue = [noteId];
    // Safety cap matching the rest of this file's defensive traversal limits, in case a stale
    // cache ever produced a cyclic parentNoteId chain (the contract itself prevents creating one).
    while (queue.length && result.length < notes.length) {
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
 * Walks up from noteId to the root, returning ancestors in root-to-leaf order (for breadcrumbs).
 * The starting note itself is included as the last element. Capped at the same traversal safety
 * limit as the depth/cycle helpers.
 */
export function getAncestorNoteChain(notes: Note[], noteId: string, noteMap = byId(notes)): Note[] {
    const chain: Note[] = [];
    let currentId: string | null = noteId;
    let steps = 0;

    while (currentId && steps < MAX_TRAVERSAL) {
        const current: Note | undefined = noteMap.get(currentId);
        if (!current) break;
        chain.unshift(current);
        currentId = current.parentNoteId ?? null;
        steps++;
    }

    return chain;
}

export interface NoteNestingCheck {
    allowed: boolean;
    reason?: string;
}

/**
 * Combines the depth<5, cycle, and parent-not-deleted checks the contract enforces on
 * update_note/update_note_with_session (mirroring create_folder/update_folder's validation), so
 * the UI can reject an invalid sub-page move before submitting a doomed transaction.
 */
export function canNestNoteUnder(notes: Note[], noteId: string | null, proposedParentId: string | null): NoteNestingCheck {
    if (proposedParentId === null) return { allowed: true };

    const noteMap = byId(notes);
    const parent = noteMap.get(proposedParentId);
    if (!parent) return { allowed: false, reason: 'Destination page was not found.' };
    if (parent.isDeleted) return { allowed: false, reason: 'Destination page has been deleted.' };

    if (noteId && wouldCreateNoteCycleClientSide(notes, noteId, proposedParentId, noteMap)) {
        return { allowed: false, reason: "You can't move a page inside one of its own sub-pages." };
    }

    const parentDepth = calculateNoteDepthClientSide(notes, proposedParentId, noteMap);
    if (parentDepth >= MAX_NOTE_DEPTH) {
        return { allowed: false, reason: 'Pages can only be nested 5 levels deep.' };
    }

    return { allowed: true };
}
