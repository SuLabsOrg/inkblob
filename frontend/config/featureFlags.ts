/**
 * The Move contract now has a real `delete_note` entry function (soft delete via `is_deleted`,
 * mirroring `delete_folder`) - see contracts/inkblob/sources/notebook.move. Single source of
 * truth so every call site (Editor.tsx, NoteList.tsx) can be flipped back off in one place if a
 * future contract redeploy needs to gate it again.
 */
export const NOTE_DELETE_ENABLED = true;
export const NOTE_DELETE_DISABLED_REASON = 'Coming soon - note deletion requires a contract update';
