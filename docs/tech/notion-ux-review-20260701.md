# InkBlob → "Decentralized Notion" UX & Codebase Review

**Date**: 2026-07-01
**Reviewer**: Claude Code (multi-agent automated audit, 11 sub-agents across 2 passes)
**Scope**: `frontend/` (React 19 + TypeScript + Lexical + Sui/Walrus) and `contracts/inkblob/sources/notebook.move`
**Method**: Six independent audit dimensions (editor UX, navigation/IA, visual polish, data reliability, code quality, contract capabilities), each with full-file reads and file:line evidence, deduplicated and merged into one prioritized punch list.

---

## Executive Summary

InkBlob's stated goal (`docs/product/prd.md`) is to be a "Decentralized Notion." Today it is a working prototype with a real Lexical-based block editor, working slash-menu, and a genuinely sophisticated Move contract — but the **frontend exposes only a fraction of what the contract already supports**, and there are several **broken-not-just-incomplete** features shipping today. The single most important finding: **note deletion is broken end-to-end** — the frontend calls a Move function (`delete_note`) that does not exist in the deployed contract, and the "Trash" UI is entirely decorative.

The contract layer is more capable than the UI suggests: folder nesting (5 levels, cycle-safe), folder reordering, and note-moving are all fully implemented and tested on-chain (`docs/tests/contracts/`) but have zero frontend wiring. This means a large chunk of "reach Notion's navigation model" is pure frontend work, not a blockchain redeploy.

---

## IMMEDIATE BUGS (fix regardless of milestone — broken today, not just missing)

1. **`delete_note` Move call targets a function that doesn't exist.** `frontend/services/suiService.ts:485-498` builds a transaction calling `notebook::delete_note`; `contracts/inkblob/sources/notebook.move` (1335 lines, verified in full) has no such function — only `delete_folder` (line 1315). Every delete-note transaction will abort on-chain.
2. **"Trash" is fully decorative.** `frontend/components/Sidebar.tsx:101-116` renders a Trash item; `frontend/App.tsx:191-192` has a no-op `// Trash logic` branch; `confirmDeleteNote` (App.tsx:626-646) claims "permanently deleted" with no recovery path — compounded by bug #1, since the delete call itself doesn't work.
3. **Body/content search is silently broken for most notes.** `frontend/App.tsx` `filtereInkBlobs` filters on `note.content`, but `frontend/hooks/useNotes.ts` always sets `content: ''` when listing (real content loads on-demand per note via `useNoteContent`). Any note not opened this session is invisible to search with no indication to the user.
4. **Markdown shortcuts are disabled, not "using defaults."** `frontend/components/Editor.tsx:312` passes an explicit empty `transformers` array to `MarkdownShortcutPlugin` — the inline comment claims defaults are active; an empty array disables all markdown auto-formatting (`-`, `#`, etc.).
5. **Table grid selector can misposition.** `frontend/components/editor/plugins/SlashMenuPlugin.tsx:280-286,369-376` captures a DOM ref's bounding rect before the menu unmounts it — the bug is documented in-code by the file's own trailing comment.
6. **Leftover rename typos in shared state/props.** `frontend/App.tsx:87` (`selecteInkBlobId`/`setSelecteInkBlobId`) and `:187` (`filtereInkBlobs`) — both missing a "d" — propagate into `frontend/components/NoteList.tsx` props. Artifact of an unreviewed rename from an earlier "EtherNotes" project (`frontend/package.json` still says `"name": "ethernotes"`, `frontend/metadata.json` says `"EtherNotes"`).
7. **Add cover / Add icon buttons render but do nothing.** `frontend/components/Editor.tsx:267-279` has no `onClick` handlers; `types.ts` `icon`/`coverImage` fields are never read or written anywhere.
8. **`tailwindcss-animate` is used but not installed.** `animate-in`/`fade-in`/`zoom-in-95` classes appear throughout (`Modal.tsx:34,37`, `SlashMenuPlugin.tsx` popover, `FloatingToolbarPlugin.tsx` popover) but `frontend/package.json` has no `tailwindcss-animate` dependency and `frontend/index.html`'s inline Tailwind CDN config (lines 13-32) doesn't register it — these classes very likely render with zero visual effect (popups snap in instead of animating).

---

## Milestone 0 — Correctness fixes & quick wins

- Fix `selecteInkBlobId`/`filtereInkBlobs` typos (App.tsx, NoteList.tsx) — S
- Restore real markdown-transformer array (Editor.tsx:312) — S
- Fix table grid selector stale-ref bug (SlashMenuPlugin.tsx) — S
- Reconcile product name across package.json/metadata.json/UI — S
- Add ESLint/Prettier config — README documents `pnpm lint`, but `package.json` has no lint script and no eslint/prettier deps/config anywhere; the documented command fails outright — S
- Fix two divergent `Note` type definitions (`types.ts` vs. a locally-declared shadow interface in `hooks/useNotes.ts`) — S
- Either wire up or remove the non-functional cover/icon buttons — M
- Install `tailwindcss-animate` (or replace with real CSS) so existing animation classes actually work — S

## Milestone 1 — Core block-editor parity (Notion's core primitive)

- **No per-block hover controls** (drag handle, "+" add button) — no `DraggableBlockPlugin`/gutter markup anywhere in `Editor.tsx`/`theme.ts` — **blocker**, L
- **No block drag-and-drop reordering** — L
- **No block-level context menu** (duplicate/delete/turn-into/color) — L
- **No nested/collapsible blocks** (toggle lists) — only `ListNode`/`ListItemNode` registered — L
- **Title is a plain `<textarea>` outside the Lexical tree**, not a first-class block — no shared undo/redo, no markdown/slash support in the title (`Editor.tsx:281-293`) — M, needs contract-aware handling since `encrypted_title` is a separate on-chain field from body content
- **No images, embeds, mentions, comments, columns, text color/highlight, or callouts** — the single largest lift — XL
- **Link editing uses a native `prompt()`** instead of an inline popover (`FloatingToolbarPlugin.tsx:140-149`); clicking an existing link only removes it, no edit/open/copy — M
- **No Tab/Shift-Tab indent-outdent, no duplicate-block shortcut** — S

## Milestone 2 — Navigation & information architecture parity

- **No nested/infinite folder hierarchy in the UI despite full contract support.** `types.ts` `Folder` has no `parentId`; `Sidebar.tsx` renders a flat list; `hooks/useFolders.ts` discards `parent_id`/`sort_order` from the chain. Contract already has 5-level depth validation (`calculate_folder_depth`, `E_MAX_FOLDER_DEPTH`) and cycle prevention (`would_create_cycle`) — **this is pure frontend work**, no redeploy needed. **blocker**, L
- **No true recursive page-in-page nesting** (notes containing sub-notes) — the one gap here that genuinely needs a contract schema change (no parent-note reference exists at all) — XL, needs contract change
- **No breadcrumbs** — literal empty placeholder comment in `Editor.tsx:233-236` — S
- **No command palette / Cmd+K quick switcher** — zero matches repo-wide; search box only searches the current folder — M
- **No drag-to-reorder/reparent in Sidebar** despite `reorder_folder`/`batch_reorder_folders` being fully implemented on-chain with zero frontend wrapper — L
- **No "move note to folder" UI** despite `move_note` existing on-chain and emitting `NoteMoved` — M
- **No per-note options menu** (rename/duplicate/move/delete from the list) — M
- **`Note.icon`/`isPinned` fields declared but completely dead** — never rendered, no toggle, no Favorites section — M each

## Milestone 3 — Visual polish pass

- **Tailwind is loaded via CDN script with inline config** (`frontend/index.html:8,13-32`), not a real `tailwind.config.js`/build-time setup — no purging, runtime compilation cost, and a known production anti-pattern.
- **Aesthetic mismatch with "Notion-like" positioning.** Current look is heavy Web3 glassmorphism (backdrop-blur, neon-purple glow shadows like `shadow-[0_0_10px_rgba(139,92,246,0.2)]` in `Sidebar.tsx:60`, particle-canvas hero background in `LandingPage.tsx`) vs. Notion's actual near-flat, neutral, high-whitespace, sparing-color design language. Worth a product decision: is the target Notion's literal minimalism, or a "premium Web3-styled" look the PRD also describes? Recommend explicitly choosing one and applying it consistently.
- **Theme toggle exists but is buried in Settings** (`SettingsModal.tsx:163`) — reasonable (Notion does similar), not a blocker.
- **No responsive/mobile layout for the core app shell.** `Sidebar.tsx` (`w-64`) and `NoteList.tsx` (`w-80`) are fixed-width with no breakpoint or drawer/overlay pattern; on a ~375px phone the two panels alone exceed the viewport. `Header.tsx`/`LandingPage.tsx` do have some `md:`/`sm:` classes, but the three-pane workspace does not.
- **No `aria-label`s anywhere in `components/`** (confirmed via repo-wide search) despite 25+ `<button>` elements, many icon-only (sidebar toggle, save/delete/share, modal close, formatting buttons) — real accessibility gap for screen-reader users.
- **`.custom-scrollbar` class is referenced but never defined** in any CSS file — dead class name (though scrollbars still get styled via a global `::-webkit-scrollbar` rule in `index.html`, so no visible bug, just confusing dead code). Also Firefox has no `scrollbar-width`/`scrollbar-color` equivalent, so Firefox users see unstyled scrollbars.

## Milestone 4 — Reliability

- **No autosave — save is manual-only.** `handleEditorChange` only updates local state; persistence only fires from the Save button. Notion autosaves continuously. — **blocker**, M
- **Unsaved edits are lost silently** on refresh, crash, or note switch (Editor remounts keyed on `note.id`, no draft cache, no `beforeunload` warning) — **blocker**, M
- **Failed saves don't retry or preserve a dirty/pending state** — M
- **`isSavingRef` guard can silently drop a save** after an Editor remount desyncs it from the component's own `isSaving` state — S
- **Session-authorization flow duplicated near-verbatim** between `handleCreateNote` and `handleSaveNote` (`App.tsx:244-305`/`441-496`, plus a duplicated ~90-line "why no session" block at `:307-344`/`:529-564`) — M
- **`SessionContext.tsx` duplicates `authorizeSession`/`authorizeSessionWithSignature`** almost line-for-line, two ~270-line near-twins — L
- **No conflict detection between devices editing the same note** — always last-write-wins, no version/timestamp check before overwrite — L, needs contract-side CAS-style guard to do properly
- **Hot wallet encryption key reuses the same signature as note-content encryption** (`crypto/hotWalletStorage.ts:51-106`, `SessionContext.tsx:160-174`), weakening key isolation — compromise of one compromises both — L
- **~226 `console.*` call sites** across the frontend (55 in `App.tsx` alone), almost none dev-gated, some logging full object dumps of notebook/session state to any user's browser console — M
- **`tsconfig.json` has no `strict` flag; `any` used 71 times**, concentrated exactly in the Sui RPC parsing layer (`SessionContext.tsx`, `services/suiService.ts`) — the highest-risk, least-type-checked code in the app — L
- **`App.tsx` is an 856-line God component** — routing + all business logic + inline modals, no `useNoteActions`/`useFolderActions` hook — XL
- **Zero tests for `App.tsx`, hooks, or context providers** — only `crypto/__tests__` and `services/walrus/__tests__` exist — L

## Milestone 5 — Requires Move contract changes / redeploy

1. Add a working `delete_note` entry function (soft-delete via `is_deleted`, mirroring `delete_folder`) — blocks Immediate Bug #1 and Trash.
2. Recursive page-in-page nesting — needs a parent-note reference field + new entry function.
3. Add pin/icon/cover-image fields to the `Note` struct — currently `types.ts`'s client-side fields have no on-chain backing.
4. Sharing/collaboration primitive — `Notebook` has a single `owner`, `SessionCap` is per-device for the same owner, not multi-user; the Editor's Share icon (`Editor.tsx:258`) is unwired.
5. Restore/undelete for soft-deleted folders — `delete_folder` sets `is_deleted` but there's no restore path.
6. Conflict/version-check primitive (CAS-style guard in `update_note`) to support real conflict detection.
7. `process_wal_storage_rebate` (`notebook.move:393-418`) only emits an event; real coin minting is an unimplemented stub — any UI promising a WAL refund isn't backed on-chain.

**Already correctly implemented on-chain, no redeploy needed for these UX gaps:** folder depth cap + cycle detection (`create_folder`/`update_folder`), folder reordering (`reorder_folder`/`batch_reorder_folders`), note moving (`move_note`) — all fully tested per `docs/tests/contracts/`.

---

## Frontend-only vs. contract-blocked, at a glance

- **Frontend-only** (no redeploy needed): nested folder UI, breadcrumbs, command palette, drag-and-drop reorder/reparent for folders, move-note UI, per-note menu, icon/pin rendering, autosave, session-auth dedup, console-log cleanup, TS `strict` mode, God-component refactor, tests, ESLint config, typo fixes, visual polish pass.
- **Contract-blocked** (Milestone 5): working delete, page-in-page nesting, pin/icon/cover persistence, sharing/collaboration, folder restore, conflict-detection primitives, WAL rebate implementation.
