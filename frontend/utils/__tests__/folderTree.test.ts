import { describe, expect, it } from 'vitest';
import { Folder } from '../../types';
import { buildFolderTree, calculateDepthClientSide, canNestUnder, getAncestorChain, getDescendantFolderIds, reorderSiblingIds, wouldCreateCycleClientSide } from '../folderTree';

function makeFolder(overrides: Partial<Folder> & { id: string }): Folder {
    return {
        name: overrides.id,
        icon: 'folder',
        type: 'user',
        parentId: null,
        sortOrder: 0,
        isDeleted: false,
        ...overrides,
    };
}

describe('buildFolderTree', () => {
    it('nests children under their parent, sorted by sortOrder then name', () => {
        const folders = [
            makeFolder({ id: 'root-b', name: 'B', sortOrder: 1 }),
            makeFolder({ id: 'root-a', name: 'A', sortOrder: 0 }),
            makeFolder({ id: 'child', name: 'Child', parentId: 'root-a', sortOrder: 0 }),
        ];

        const tree = buildFolderTree(folders);

        expect(tree.map(n => n.id)).toEqual(['root-a', 'root-b']);
        expect(tree[0].children.map(n => n.id)).toEqual(['child']);
    });

    it('filters out soft-deleted folders', () => {
        const folders = [
            makeFolder({ id: 'a', isDeleted: true }),
            makeFolder({ id: 'b' }),
        ];

        const tree = buildFolderTree(folders);

        expect(tree.map(n => n.id)).toEqual(['b']);
    });

    it('treats a folder with a dangling parentId as a root instead of dropping it', () => {
        const folders = [
            makeFolder({ id: 'orphan', parentId: 'does-not-exist' }),
        ];

        const tree = buildFolderTree(folders);

        expect(tree.map(n => n.id)).toEqual(['orphan']);
    });
});

describe('calculateDepthClientSide', () => {
    it('returns 0 for a root folder', () => {
        const folders = [makeFolder({ id: 'root' })];
        expect(calculateDepthClientSide(folders, 'root')).toBe(0);
    });

    it('counts steps up to the root', () => {
        const folders = [
            makeFolder({ id: 'root' }),
            makeFolder({ id: 'mid', parentId: 'root' }),
            makeFolder({ id: 'leaf', parentId: 'mid' }),
        ];
        expect(calculateDepthClientSide(folders, 'leaf')).toBe(2);
    });
});

describe('wouldCreateCycleClientSide', () => {
    it('flags a folder as its own proposed parent', () => {
        const folders = [makeFolder({ id: 'a' })];
        expect(wouldCreateCycleClientSide(folders, 'a', 'a')).toBe(true);
    });

    it('flags moving a folder into its own descendant', () => {
        const folders = [
            makeFolder({ id: 'a' }),
            makeFolder({ id: 'b', parentId: 'a' }),
            makeFolder({ id: 'c', parentId: 'b' }),
        ];
        expect(wouldCreateCycleClientSide(folders, 'a', 'c')).toBe(true);
    });

    it('allows moving a folder under an unrelated folder', () => {
        const folders = [
            makeFolder({ id: 'a' }),
            makeFolder({ id: 'b' }),
        ];
        expect(wouldCreateCycleClientSide(folders, 'a', 'b')).toBe(false);
    });
});

describe('reorderSiblingIds', () => {
    it('moves an item forward (regression: previously landed one slot too far)', () => {
        // Drag B and drop it on the indicator after C - expected result: [A, C, B, D]
        const result = reorderSiblingIds(['A', 'B', 'C', 'D'], 'B', 2);
        expect(result).toEqual(['A', 'C', 'B', 'D']);
    });

    it('moves an item backward', () => {
        // Drag D and drop it right after A - expected result: [A, D, B, C]
        const result = reorderSiblingIds(['A', 'B', 'C', 'D'], 'D', 0);
        expect(result).toEqual(['A', 'D', 'B', 'C']);
    });

    it('moving an item to before everything (-1) puts it first', () => {
        const result = reorderSiblingIds(['A', 'B', 'C'], 'C', -1);
        expect(result).toEqual(['C', 'A', 'B']);
    });

    it('dropping an item back onto its own original slot is a no-op', () => {
        const result = reorderSiblingIds(['A', 'B', 'C'], 'A', -1);
        expect(result).toEqual(['A', 'B', 'C']);
    });
});

describe('getDescendantFolderIds', () => {
    it('returns only direct children when there are no grandchildren', () => {
        const folders = [
            makeFolder({ id: 'a' }),
            makeFolder({ id: 'b', parentId: 'a' }),
        ];
        expect(getDescendantFolderIds(folders, 'a')).toEqual(['b']);
    });

    it('returns the full subtree, not just direct children', () => {
        const folders = [
            makeFolder({ id: 'a' }),
            makeFolder({ id: 'b', parentId: 'a' }),
            makeFolder({ id: 'c', parentId: 'b' }),
            makeFolder({ id: 'd', parentId: 'c' }),
        ];
        expect(getDescendantFolderIds(folders, 'a').sort()).toEqual(['b', 'c', 'd']);
    });

    it('returns an empty array for a leaf folder', () => {
        const folders = [makeFolder({ id: 'a' })];
        expect(getDescendantFolderIds(folders, 'a')).toEqual([]);
    });
});

describe('getAncestorChain', () => {
    it('returns a single-element chain for a root folder', () => {
        const folders = [makeFolder({ id: 'root', name: 'Root' })];
        expect(getAncestorChain(folders, 'root').map(f => f.id)).toEqual(['root']);
    });

    it('returns ancestors in root-to-leaf order', () => {
        const folders = [
            makeFolder({ id: 'root' }),
            makeFolder({ id: 'mid', parentId: 'root' }),
            makeFolder({ id: 'leaf', parentId: 'mid' }),
        ];
        expect(getAncestorChain(folders, 'leaf').map(f => f.id)).toEqual(['root', 'mid', 'leaf']);
    });
});

describe('canNestUnder', () => {
    it('allows nesting at the root level', () => {
        expect(canNestUnder([], 'a', null)).toEqual({ allowed: true });
    });

    it('rejects nesting under a deleted folder', () => {
        const folders = [makeFolder({ id: 'deleted', isDeleted: true })];
        const result = canNestUnder(folders, 'a', 'deleted');
        expect(result.allowed).toBe(false);
    });

    it('allows nesting under a folder at depth 4 (matches contract: parent_depth < 5)', () => {
        const folders = [
            makeFolder({ id: 'l0' }),
            makeFolder({ id: 'l1', parentId: 'l0' }),
            makeFolder({ id: 'l2', parentId: 'l1' }),
            makeFolder({ id: 'l3', parentId: 'l2' }),
            makeFolder({ id: 'l4', parentId: 'l3' }), // depth 4
        ];
        expect(canNestUnder(folders, 'new-folder', 'l4').allowed).toBe(true);
    });

    it('rejects nesting under a folder at depth 5', () => {
        const folders = [
            makeFolder({ id: 'l0' }),
            makeFolder({ id: 'l1', parentId: 'l0' }),
            makeFolder({ id: 'l2', parentId: 'l1' }),
            makeFolder({ id: 'l3', parentId: 'l2' }),
            makeFolder({ id: 'l4', parentId: 'l3' }),
            makeFolder({ id: 'l5', parentId: 'l4' }), // depth 5
        ];
        expect(canNestUnder(folders, 'new-folder', 'l5').allowed).toBe(false);
    });

    it('rejects a cyclic reparent', () => {
        const folders = [
            makeFolder({ id: 'a' }),
            makeFolder({ id: 'b', parentId: 'a' }),
        ];
        const result = canNestUnder(folders, 'a', 'b');
        expect(result.allowed).toBe(false);
    });

    it('allows a valid nest', () => {
        const folders = [makeFolder({ id: 'a' })];
        const result = canNestUnder(folders, 'b', 'a');
        expect(result.allowed).toBe(true);
    });
});
