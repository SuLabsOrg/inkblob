import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Folder as FolderIcon, RotateCcw } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { Editor } from './components/Editor';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { Modal } from './components/Modal';
import { NoteList } from './components/NoteList';
import { Onboarding } from './components/Onboarding';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { SharedModeBanner } from './components/SharedModeBanner';
import { SharedNotebooksModal } from './components/SharedNotebooksModal';
import { ActiveNotebookProvider, useActiveNotebookContext } from './context/ActiveNotebookContext';
import { EncryptionProvider, useEncryption } from './context/EncryptionContext';
import { SessionProvider } from './context/SessionContext';
import { SettingsProvider } from './context/SettingsContext';
import { SyncProvider } from './context/SyncContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { encryptText } from './crypto/encryption';
import { deriveX25519KeyPair } from './crypto/keySharing';
import { bytesToBlobSizeMb, calculateWalStorageFee, WAL_MIN_PAYMENT } from './services/suiService';
import { useContentSearchIndex } from './hooks/useContentSearchIndex';
import { useFolders } from './hooks/useFolders';
import { useNotebook } from './hooks/useNotebook';
import { useNotebookMutation } from './hooks/useNotebookMutation';
import { useWalFeeReserve } from './hooks/useWalFeeReserve';
import { useWalCoin } from './hooks/useWalCoin';
import { useNotes } from './hooks/useNotes';
import { useSuiService } from './hooks/useSuiService';
import { SaveResult } from './hooks/useAutosave';
import * as walrusService from './services/walrus';
import { Folder, Note } from './types';
import { getDescendantFolderIds } from './utils/folderTree';
import { canNestNoteUnder } from './utils/noteTree';
import { fuzzyMatch } from './utils/fuzzyMatch';
import { ToastTemplates, sanitizeWeb3Error, getMoveAbortCode } from './utils/toastUtils';

// Move contract abort code for a CAS/optimistic-concurrency version mismatch on update_note(s)
// (see E_VERSION_MISMATCH in contracts/inkblob/sources/notebook.move) - kept in sync manually
// since the frontend has no generated bindings for Move error constants.
const E_VERSION_MISMATCH = 24;

// Mock Data (Fallback)
const INITIAL_FOLDERS: Folder[] = [
  { id: 'notes', name: 'Notes', icon: 'file-text', type: 'system' },
  { id: 'trash', name: 'Trash', icon: 'trash', type: 'system' },
];

// Global Error Boundary
class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Global Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 flex flex-col items-center justify-center h-full bg-background text-red-500">
          <h2 className="text-xl font-bold mb-4">Something went wrong</h2>
          <pre className="bg-red-500/10 p-4 rounded text-sm overflow-auto max-w-2xl">
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-web3-primary text-white rounded hover:bg-web3-primary/90"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const currentAccount = useCurrentAccount();
  const { encryptionKey, lastSignature, lastUserAddress } = useEncryption();
  const { data: notebook, isLoading: isNotebookLoading, refetch: refetchNotebook } = useNotebook();
  // Shared-viewing mode (ActiveNotebookContext): 'own' by default - in that mode
  // activeNotebookId/activeKey below are byte-for-byte the same values the handlers always used
  // (notebook?.data?.objectId / encryptionKey), so owner behavior is unchanged. When a shared
  // notebook is open, every mutation handler targets the shared id and encrypts with the
  // unwrapped shared content key instead.
  const { active, isShared, isReadOnly, exitShared } = useActiveNotebookContext();
  const activeNotebookId = active.kind === 'shared' ? active.notebookId : (notebook?.data?.objectId ?? null);
  const activeKey = active.kind === 'shared' ? active.contentKey : encryptionKey;
  // update_note/update_note_with_session both require the notebook's WalFeeReserve object as
  // an argument (see useWalFeeReserve's doc comment) - looked up once per notebook and reused
  // by every note create/save call below. Works for shared notebooks too: the reserve id is
  // discovered from public events, not from anything owner-gated.
  const { data: walFeeReserveId } = useWalFeeReserve(activeNotebookId);
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const suiService = useSuiService();
  const { runSessionableMutation, runWalletOnlyMutation, ensureSessionAuthorized, executeWithSigner } = useNotebookMutation();
  const { getSpendableWalCoin } = useWalCoin();
  const { ensureIndexed, getIndexedContent, indexVersion } = useContentSearchIndex();
  const toast = useToast();
  const suiClient = useSuiClient();

  // Whether the most recent note save actually attached a real WAL storage-fee payment (vs.
  // skipping WAL accounting, e.g. due to insufficient balance) - surfaced read-only near the
  // editor so the user has an honest signal of whether their storage is actually being paid for
  // on-chain, not just a static "feature enabled" indicator. Starts null (unknown/no save yet).
  const [lastSaveWalPaymentActive, setLastSaveWalPaymentActive] = useState<boolean | null>(null);

  // Hooks for data fetching
  const { data: fetchedFolders } = useFolders();
  const { data: fetchedNotes } = useNotes();

  // State
  const [folders, setFolders] = useState<Folder[]>(INITIAL_FOLDERS);
  const [notes, setNotes] = useState<Note[]>([]);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('notes');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSharedWithMe, setShowSharedWithMe] = useState(false);

  // Notebook initialization state
  const [isInitializingNotebook, setIsInitializingNotebook] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  // Ref to persist loading toast ID across re-renders
  const loadingToastIdRef = useRef<string | null>(null);

  // Note ids currently "locked" against a concurrent save - covers both an in-flight save
  // (handleSaveNote) AND an in-flight creation transaction (handleCreateNote), since a freshly
  // created note isn't safe to update-on-chain until its creation tx has landed. handleSaveNote
  // returns 'skipped' (not persisted) rather than throwing when it finds an id already locked, so
  // callers like useAutosave can tell "skipped, try again" apart from "actually saved" apart from
  // "conflict, stop retrying".
  const isSavingRef = useRef<Set<string>>(new Set());

  // Ref to prevent duplicate notebook-initialization transactions - state alone isn't a safe
  // guard here because React.StrictMode invokes this effect twice back-to-back before the first
  // invocation's setIsInitializingNotebook(true) has committed, so both could pass a state-only check.
  const isInitializingRef = useRef(false);

  // Set of note ids with unsaved local edits, reported per-id by each note's autosave hook (Editor
  // -> onDirtyChange). Keyed by id (not one shared boolean) so a stale in-flight save completing
  // for a note the user has since switched away from can't incorrectly clear a *different* note's
  // dirty flag - it only ever touches its own id's entry.
  const dirtyNoteIdsRef = useRef<Set<string>>(new Set());

  // Warn on tab close/refresh if any note has unsaved changes autosave hasn't flushed yet
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyNoteIdsRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Tracks the last non-null active notebook id, so the reset effect below only fires on a REAL
  // notebook switch (own<->shared, or a different wallet's notebook) and never on a transient
  // id -> null -> same-id blip. useNotebook's queryFn returns null (rather than throwing) on any
  // caught RPC error during its periodic background refetch, so without this guard a flaky
  // fullnode response would wipe the owner's open editor, selection, and dirty-note tracking -
  // and a subsequent autosave flush against the reset (empty-content) notes state could even
  // overwrite the note's Walrus blob with empty content.
  const lastActiveNotebookIdRef = useRef<string | null>(null);

  // Reset every local mirror of notebook data whenever the ACTIVE notebook changes (entering or
  // exiting shared mode, or the own notebook id itself changing). REQUIRED, not cosmetic: the
  // fetchedNotes/fetchedFolders sync effects below only overwrite local state when the fetched
  // list is non-empty, so without this a shared notebook with fewer/zero items would keep
  // displaying the previous notebook's (e.g. the user's OWN) notes and folders.
  useEffect(() => {
    if (activeNotebookId === null) return; // transient loading/error gap - never wipe on null
    if (lastActiveNotebookIdRef.current === activeNotebookId) return; // same notebook re-resolved
    lastActiveNotebookIdRef.current = activeNotebookId;

    setNotes([]);
    setFolders(INITIAL_FOLDERS);
    setSelectedNoteId(null);
    setSelectedFolderId('notes');
    setSearchQuery('');
    dirtyNoteIdsRef.current.clear();
    setLastSaveWalPaymentActive(null);
  }, [activeNotebookId]);

  // Effect to update state when hooks return data
  useEffect(() => {
    if (currentAccount && fetchedFolders && fetchedFolders.length > 0) {
      setFolders(fetchedFolders);
    }
  }, [fetchedFolders, currentAccount]);

  useEffect(() => {
    if (currentAccount && fetchedNotes && fetchedNotes.length > 0) {
      setNotes(fetchedNotes);
    }
  }, [fetchedNotes, currentAccount]);

  // Auto-initialize notebook after unlock
  useEffect(() => {
    const initializeNotebook = async () => {
      // Only run if:
      // 1. User is connected
      // 2. Encryption key is derived (unlocked)
      // 3. Notebook query has completed (not loading)
      // 4. No notebook exists
      // 5. Not already initializing (ref check first - synchronous, safe against StrictMode's
      //    back-to-back double-invoke, unlike the isInitializingNotebook state check below)
      if (isInitializingRef.current) return;
      if (!currentAccount || !encryptionKey || isNotebookLoading || notebook || isInitializingNotebook) {
        return;
      }

      console.log('[App] Auto-initialization triggered:', {
        account: currentAccount.address,
        hasEncryptionKey: !!encryptionKey,
        notebookExists: !!notebook,
        isInitializing: isInitializingNotebook,
      });

      isInitializingRef.current = true;
      setIsInitializingNotebook(true);
      setInitializationError(null);

      try {
        // Generate a default notebook name with timestamp
        const notebookName = `My Notebook - ${new Date().toLocaleDateString()}`;

        console.log('[App] Creating notebook transaction with name:', notebookName);
        const tx = suiService.createNotebookTx(notebookName);

        console.log('[App] Signing and executing transaction...');
        const result = await signAndExecuteTransaction({
          transaction: tx,
        });

        console.log('[App] Notebook creation successful:', result);

        // Wait for blockchain state to propagate (2 seconds)
        console.log('[App] Waiting for blockchain state propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Refetch notebook to update UI
        console.log('[App] Refetching notebook...');
        const refetchResult = await refetchNotebook();

        if (refetchResult.data) {
          console.log('[App] Notebook initialization complete:', refetchResult.data);
        } else {
          console.warn('[App] Notebook refetch returned no data, but creation succeeded');
        }

      } catch (error) {
        console.error('[App] Failed to initialize notebook:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setInitializationError(errorMessage);

        // Show user-friendly error
        const errorInfo = sanitizeWeb3Error(error);
        toast.error(errorInfo.title, errorInfo.description + '\n\nPlease try refreshing the page or check your wallet balance.');
      } finally {
        isInitializingRef.current = false;
        setIsInitializingNotebook(false);
      }
    };

    initializeNotebook();
  }, [currentAccount, encryptionKey, notebook, isNotebookLoading, isInitializingNotebook]);

  // Ref to make the once-per-session encryption-key registration idempotent across re-renders/
  // effect re-runs (e.g. React.StrictMode's back-to-back double-invoke) - keyed by address so a
  // wallet switch (disconnect + reconnect as a different account) re-registers for the new
  // address rather than being permanently skipped after the first account's registration.
  const registeredEncryptionKeyForAddressRef = useRef<string | null>(null);

  // Best-effort, fire-and-forget background registration of this session's envelope-encryption
  // X25519 public key (see frontend/crypto/keySharing.ts) into the on-chain EncryptionKeyRegistry,
  // once per unlock. This is NOT on the critical path for the app to function - it only enables
  // OTHER people to later wrap a shared content key for this address (see ShareModal), so any
  // failure here is caught and logged, never surfaced to the user as an error/toast. Deliberately
  // does not touch encryptionKey/deriveEncryptionKey/hotWalletStorage - it independently re-derives
  // a completely separate keypair from the same cached wallet signature (see keySharing.ts).
  useEffect(() => {
    if (!currentAccount || !lastSignature || !lastUserAddress) return;
    if (registeredEncryptionKeyForAddressRef.current === lastUserAddress) return;

    registeredEncryptionKeyForAddressRef.current = lastUserAddress;

    (async () => {
      try {
        const registryId = await suiService.fetchEncryptionKeyRegistryId();
        if (!registryId) {
          console.warn('[App] Skipping encryption key registration: no EncryptionKeyRegistry id configured.');
          return;
        }

        const { publicKeyRaw } = await deriveX25519KeyPair(lastSignature);
        const tx = suiService.registerEncryptionKeyTx(registryId, publicKeyRaw);
        await signAndExecuteTransaction({ transaction: tx });
        console.log('[App] Registered envelope-encryption public key for', lastUserAddress);
      } catch (error) {
        // Background best-effort registration - never block or alarm the user over this.
        console.error('[App] Failed to register envelope-encryption public key (non-blocking):', error);
      }
    })();
  }, [currentAccount, lastSignature, lastUserAddress, suiService, signAndExecuteTransaction]);

  // Derived State
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Folder Filter
    if (selectedFolderId === 'trash') {
      filtered = filtered.filter(n => n.isDeleted);
    } else if (selectedFolderId === 'all') {
      filtered = filtered.filter(n => !n.isDeleted);
    } else {
      filtered = filtered.filter(n => n.folderId === selectedFolderId && !n.isDeleted);
    }

    // Search Filter - matches against title always, and body content once it's been indexed
    // (see useContentSearchIndex; body content is '' for notes that haven't been indexed/opened yet)
    if (searchQuery.trim()) {
      filtered = filtered.filter(n =>
        fuzzyMatch(searchQuery, n.title) ||
        fuzzyMatch(searchQuery, getIndexedContent(n.blobId) || n.content)
      );
    }

    // Sort by Date Descending
    return filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [notes, selectedFolderId, searchQuery, getIndexedContent, indexVersion]);

  // Deleted folders (Trash view) - useFolders now returns the full list including soft-deleted
  // entries, so this is the counterpart to filteredNotes' trash branch for folders.
  const deletedFolders = useMemo(() => folders.filter(f => f.isDeleted), [folders]);

  // Sub-pages of the currently open note (Editor's "Sub-pages" section) - live children only,
  // matching filteredNotes' isDeleted exclusion so a soft-deleted child can't be navigated into
  // accidentally from its parent's page.
  const childNotes = useMemo(
    () => notes.filter(n => n.parentNoteId === selectedNoteId && !n.isDeleted),
    [notes, selectedNoteId]
  );

  // Only pass valid folder addresses to the contract - filters out special
  // UI-only folders like 'all', 'notes', 'trash'
  const isValidFolderAddress = (folderId: string) => {
    return !!folderId && /^0x[0-9a-fA-F]{64}$/.test(folderId);
  };

  // Actions
  // NOTE on WAL payment: handleCreateNote/handleCreateSubNote deliberately do NOT attach a real
  // WAL payment - a freshly created note has no content yet (empty blob_id placeholder), so
  // there's nothing real to size/charge for. createNoteTx/createNoteTxWithSession's walCoinId/
  // blobSizeMb params default to null here, preserving the previous no-payment behavior. The
  // first real payment happens on the note's first handleSaveNote call, once actual Walrus blob
  // content (and therefore a real byte size) exists.
  const handleCreateNote = async () => {
    // Defense in depth - the Create buttons are already hidden in read-only shared mode.
    if (isReadOnly) return;
    const blockchainNoteId = suiService.generateUniqueId();

    // 1. Optimistic Update
    const newNote: Note = {
      id: blockchainNoteId, // Use blockchain ID for consistency
      title: '',
      content: '',
      folderId: selectedFolderId === 'trash' || selectedFolderId === 'all' ? 'notes' : selectedFolderId,
      updatedAt: new Date(),
      blobId: '',
    };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);

    if (!activeNotebookId || !activeKey || !walFeeReserveId) {
      // Fallback for local testing if notebook/reserve not ready (bypassed mode)
      return;
    }

    // Block autosave/manual-save from racing this note's own creation transaction - reuses the
    // same lock handleSaveNote already checks, rather than a parallel guard.
    isSavingRef.current.add(newNote.id);

    try {
      const encryptedTitle = await encryptText(newNote.title || 'Untitled', activeKey);
      const contractFolderId = isValidFolderAddress(selectedFolderId) ? selectedFolderId : null;

      if (isShared) {
        // Session caps are owner-only on-chain (authorize_session_and_fund asserts
        // notebook.owner == sender), so a grantee MUST NOT attempt the session path -
        // plain wallet signing only, with the identical wallet-branch builder/arguments.
        await runWalletOnlyMutation(() => suiService.createNoteTx(
          activeNotebookId,
          walFeeReserveId,
          encryptedTitle,
          contractFolderId,
          blockchainNoteId
        ));
      } else {
        await runSessionableMutation(activeNotebookId, {
          session: (sessionCapId) => suiService.createNoteTxWithSession(
            activeNotebookId,
            walFeeReserveId,
            sessionCapId,
            encryptedTitle,
            contractFolderId,
            blockchainNoteId
          ),
          wallet: () => suiService.createNoteTx(
            activeNotebookId,
            walFeeReserveId,
            encryptedTitle,
            contractFolderId,
            blockchainNoteId
          ),
        });
      }

      toast.success('Note Created', 'Your note has been created successfully!');
      // SyncContext will handle invalidation
    } catch (error) {
      console.error('Failed to create note:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Note could not be created. ' + errorInfo.description);
      // Revert optimistic update
      setNotes(prev => prev.filter(n => n.id !== newNote.id));
      if (selectedNoteId === newNote.id) setSelectedNoteId(null);
    } finally {
      isSavingRef.current.delete(newNote.id);
    }
  };

  /**
   * Creates a new note nested as a sub-page of parentNoteId (Editor's "Sub-pages" section "+ New
   * sub-page" row). Closely mirrors handleCreateNote's optimistic-insert-then-create-on-chain
   * shape and isSavingRef locking, just threading parentNoteId through and navigating to the new
   * note instead of leaving folder/list selection untouched.
   */
  const handleCreateSubNote = async (parentNoteId: string) => {
    // Defense in depth - the "+ New sub-page" row is already hidden in read-only shared mode.
    if (isReadOnly) return;
    // Client-side pre-check mirroring canNestUnder's use for folders - for a brand-new note this
    // should always be allowed (a fresh id can't already appear in the parent's ancestor chain),
    // but running it anyway keeps this path consistent with whatever future re-parenting UI reuses
    // the same check, and gives instant feedback if the parent turns out to be stale/deleted.
    const nestingCheck = canNestNoteUnder(notes, null, parentNoteId);
    if (!nestingCheck.allowed) {
      toast.error('Cannot Create Sub-page', nestingCheck.reason ?? 'This sub-page could not be created here.');
      return;
    }

    const blockchainNoteId = suiService.generateUniqueId();
    const parent = notes.find(n => n.id === parentNoteId);

    // 1. Optimistic Update
    const newNote: Note = {
      id: blockchainNoteId, // Use blockchain ID for consistency
      title: '',
      content: '',
      folderId: parent?.folderId ?? (selectedFolderId === 'trash' || selectedFolderId === 'all' ? 'notes' : selectedFolderId),
      updatedAt: new Date(),
      blobId: '',
      parentNoteId,
    };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);

    if (!activeNotebookId || !activeKey || !walFeeReserveId) {
      // Fallback for local testing if notebook/reserve not ready (bypassed mode)
      return;
    }

    // Block autosave/manual-save from racing this note's own creation transaction - reuses the
    // same lock handleSaveNote already checks, rather than a parallel guard.
    isSavingRef.current.add(newNote.id);

    try {
      const encryptedTitle = await encryptText(newNote.title || 'Untitled', activeKey);
      const contractFolderId = isValidFolderAddress(newNote.folderId) ? newNote.folderId : null;

      if (isShared) {
        // Grantees can never hold a SessionCap (owner-only on-chain) - wallet signing only,
        // same wallet-branch builder/arguments as below.
        await runWalletOnlyMutation(() => suiService.createNoteTx(
          activeNotebookId,
          walFeeReserveId,
          encryptedTitle,
          contractFolderId,
          blockchainNoteId,
          parentNoteId
        ));
      } else {
        await runSessionableMutation(activeNotebookId, {
          session: (sessionCapId) => suiService.createNoteTxWithSession(
            activeNotebookId,
            walFeeReserveId,
            sessionCapId,
            encryptedTitle,
            contractFolderId,
            blockchainNoteId,
            parentNoteId
          ),
          wallet: () => suiService.createNoteTx(
            activeNotebookId,
            walFeeReserveId,
            encryptedTitle,
            contractFolderId,
            blockchainNoteId,
            parentNoteId
          ),
        });
      }

      toast.success('Sub-page Created', 'Your sub-page has been created successfully!');
      // SyncContext will handle invalidation
    } catch (error) {
      console.error('Failed to create sub-page:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Sub-page could not be created. ' + errorInfo.description);
      // Revert optimistic update
      setNotes(prev => prev.filter(n => n.id !== newNote.id));
      if (selectedNoteId === newNote.id) setSelectedNoteId(null);
    } finally {
      isSavingRef.current.delete(newNote.id);
    }
  };

  const openCreateFolderModal = (parentId: string | null = null) => {
    setNewFolderName('');
    setNewFolderParentId(parentId);
    setIsFolderModalOpen(true);
  };

  const handleCreateFolder = async () => {
    // Defense in depth - every opener of the folder modal is hidden in read-only shared mode.
    if (isReadOnly) return;
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    const parentId = newFolderParentId;
    setIsFolderModalOpen(false);

    const newFolderId = suiService.generateUniqueId();

    // 1. Optimistic Update
    const newFolder: Folder = {
      id: newFolderId,
      name,
      icon: 'folder',
      type: 'user',
      parentId,
      sortOrder: 0,
    };
    setFolders(prev => [...prev, newFolder]);

    if (!activeNotebookId || !activeKey) {
      // Local fallback
      return;
    }

    try {
      const encryptedName = await encryptText(name, activeKey);
      await runWalletOnlyMutation(() =>
        suiService.createFolderTx(activeNotebookId, encryptedName, parentId, newFolderId)
      );
      toast.success('Folder Created', `Folder "${name}" has been created successfully!`);
    } catch (error) {
      console.error('Failed to create folder:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Folder could not be created. ' + errorInfo.description);
      // Revert optimistic update
      setFolders(prev => prev.filter(f => f.id !== newFolder.id));
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    // Defense in depth - the rename affordance is hidden in read-only shared mode.
    if (isReadOnly) return;
    const name = newName.trim();
    if (!name) return;
    const previous = folders.find(f => f.id === folderId);
    if (!previous) return;

    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name } : f));

    if (!activeNotebookId || !activeKey) return;

    try {
      const encryptedName = await encryptText(name, activeKey);
      await runWalletOnlyMutation(() =>
        // Passing the folder's current parentId (not null) - update_folder always overwrites
        // parent_id with whatever is passed, so omitting it here would reparent to root.
        suiService.updateFolderTx(activeNotebookId, folderId, encryptedName, previous.parentId ?? null)
      );
    } catch (error) {
      console.error('Failed to rename folder:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Folder could not be renamed. ' + errorInfo.description);
      setFolders(prev => prev.map(f => f.id === folderId ? previous : f));
    }
  };

  const handleReparentFolder = async (folderId: string, newParentId: string | null) => {
    // Defense in depth - folder drag-and-drop is disabled in read-only shared mode.
    if (isReadOnly) return;
    const previous = folders.find(f => f.id === folderId);
    if (!previous) return;

    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, parentId: newParentId } : f));

    if (!activeNotebookId || !activeKey) return;

    try {
      const encryptedName = await encryptText(previous.name, activeKey);
      await runWalletOnlyMutation(() =>
        suiService.updateFolderTx(activeNotebookId, folderId, encryptedName, newParentId)
      );
    } catch (error) {
      console.error('Failed to move folder:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Folder could not be moved. ' + errorInfo.description);
      setFolders(prev => prev.map(f => f.id === folderId ? previous : f));
    }
  };

  const handleReorderFolders = async (folderIds: string[], sortOrders: number[]) => {
    // Defense in depth - folder drag-and-drop is disabled in read-only shared mode.
    if (isReadOnly) return;
    const previous = folders;
    setFolders(prev => prev.map(f => {
      const idx = folderIds.indexOf(f.id);
      return idx === -1 ? f : { ...f, sortOrder: sortOrders[idx] };
    }));

    if (!activeNotebookId) return;

    try {
      await runWalletOnlyMutation(() =>
        suiService.batchReorderFoldersTx(activeNotebookId, folderIds, sortOrders)
      );
    } catch (error) {
      console.error('Failed to reorder folders:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Folders could not be reordered. ' + errorInfo.description);
      setFolders(previous);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    // Defense in depth - the delete affordance is hidden in read-only shared mode.
    if (isReadOnly) return;
    // Deleting a folder doesn't cascade - subfolders and notes still point to it, they just
    // won't be reachable from the tree anymore. Warn before deleting anything non-empty, counting
    // the full descendant subtree (not just direct children) since nested content is affected too.
    const liveFolders = folders.filter(f => !f.isDeleted);
    const descendantFolderIds = new Set([folderId, ...getDescendantFolderIds(liveFolders, folderId)]);
    const childFolderCount = descendantFolderIds.size - 1;
    const childNoteCount = notes.filter(n => descendantFolderIds.has(n.folderId)).length;
    if (childFolderCount > 0 || childNoteCount > 0) {
      const parts = [
        childNoteCount > 0 ? `${childNoteCount} note${childNoteCount === 1 ? '' : 's'}` : null,
        childFolderCount > 0 ? `${childFolderCount} subfolder${childFolderCount === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' and ');
      const confirmed = await toast.confirm({
        title: 'Delete Non-Empty Folder?',
        description: `This folder contains ${parts}. Deleting it won't delete its contents, but they will no longer be reachable from the folder tree.`,
        confirmLabel: 'Delete Anyway',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
    }

    const previous = folders;
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (selectedFolderId === folderId) setSelectedFolderId('notes');

    if (!activeNotebookId) return;

    try {
      await runWalletOnlyMutation(() => suiService.deleteFolderTx(activeNotebookId, folderId));
      toast.success('Folder Deleted', 'The folder has been deleted.');
    } catch (error) {
      console.error('Failed to delete folder:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Folder could not be deleted. ' + errorInfo.description);
      setFolders(previous);
    }
  };

  const handleMoveNote = async (noteId: string, newFolderId: string | null) => {
    // Defense in depth - "Move to folder..." and note drag are hidden/disabled in read-only shared mode.
    if (isReadOnly) return;
    const previous = notes.find(n => n.id === noteId);
    if (!previous) return;

    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folderId: newFolderId ?? 'notes' } : n));

    if (!activeNotebookId) return;

    try {
      await runWalletOnlyMutation(() => suiService.moveNoteTx(activeNotebookId, noteId, newFolderId));
      toast.success('Note Moved', 'The note has been moved.');
    } catch (error) {
      console.error('Failed to move note:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Note could not be moved. ' + errorInfo.description);
      setNotes(prev => prev.map(n => n.id === noteId ? previous : n));
    }
  };

  const handleUpdateNote = (id: string, updates: Partial<Note>) => {
    // Optimistic update only - no network calls
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  /**
   * Returns the 3-way outcome of the save attempt (see `SaveResult` in hooks/useAutosave):
   * 'saved' if actually persisted, 'skipped' if not persisted but transient (lock held, generic
   * failure), or 'conflict' if the on-chain note was changed elsewhere (CAS/version mismatch,
   * E_VERSION_MISMATCH) - a doomed outcome that must NOT be treated the same as a transient skip,
   * since retrying with the same expected_updated_at will deterministically fail again forever.
   * callers like useAutosave rely on this distinction to know whether to keep auto-retrying.
   */
  const handleSaveNote = async (id: string, options?: { silent?: boolean }): Promise<SaveResult> => {
    // Defense in depth - read-only shared mode renders no save affordance at all (editor is
    // non-editable, Save button hidden), so nothing should ever get here; refuse regardless.
    if (isReadOnly) return 'skipped';
    const silent = options?.silent ?? false;

    // Skip if the id is locked by another in-flight save OR by its own still-pending creation
    // transaction (see isSavingRef's declaration comment) - not an error, just not our turn yet.
    if (isSavingRef.current.has(id)) {
      return 'skipped';
    }

    if (!activeNotebookId || !activeKey || !walFeeReserveId) return 'skipped';

    const note = notes.find(n => n.id === id);
    if (!note) return 'skipped';

    // Mark as saving
    isSavingRef.current.add(id);

    try {
      // Resolve the session signer once - it's reused for both the Walrus upload and the note
      // update. HARD RULE for shared notebooks: signer stays null (plain wallet signing) -
      // session caps are owner-only on-chain (authorize_session_and_fund asserts
      // notebook.owner == sender), so a grantee can never obtain one and the session path must
      // never even be attempted. With signer null, the Walrus upload below takes its existing
      // wallet writeFilesFlow branch and executeWithSigner takes the wallet builder branch.
      const signer = isShared ? null : await ensureSessionAuthorized(activeNotebookId);

      if (!silent) {
        loadingToastIdRef.current = toast.loading('Saving Note', 'Encrypting content and uploading to storage...');
      }

      const result = await walrusService.uploadInkBlobContent(
        note.content,
        activeKey,
        signer?.ephemeralKeypair,
        1,
        currentAccount?.address,
        signAndExecuteTransaction
      );
      const blobId = result.blobId;

      const encryptedTitle = await encryptText(note.title, activeKey);
      const contractFolderId = isValidFolderAddress(note.folderId) ? note.folderId : null;
      const contractParentNoteId = note.parentNoteId ?? null;
      // CAS guard: the contract asserts this matches the note's current on-chain updated_at
      // before overwriting (skipped entirely when the note doesn't exist yet on-chain, i.e. its
      // creation tx hasn't landed) - lets us detect a concurrent edit from another device/tab.
      const expectedUpdatedAt = note.updatedAt.getTime();

      // Real WAL storage-fee payment: compute the fee for the content actually just uploaded,
      // then look up a spendable Coin<WAL> owned by whichever address will sign this PTB - the
      // ephemeral hot wallet when a session is active (executeWithSession sets that as the PTB
      // sender), or the connected wallet otherwise. Falls back to skipping WAL accounting (same
      // as before this feature existed) if no session/wallet address is resolvable, the coin
      // lookup fails, or the balance is insufficient - saving content must never be blocked by a
      // WAL-payment edge case.
      const blobSizeMb = bytesToBlobSizeMb(result.encryptedSizeBytes);
      const requiredFee = calculateWalStorageFee(blobSizeMb);
      const paymentSignerAddress = signer ? signer.ephemeralKeypair.toSuiAddress() : currentAccount?.address;

      let walCoinId: string | null = null;
      let effectiveBlobSizeMb: number | null = null;
      if (paymentSignerAddress) {
        const spendableCoin = await getSpendableWalCoin(paymentSignerAddress);
        if (spendableCoin && spendableCoin.balance >= Math.max(requiredFee, WAL_MIN_PAYMENT)) {
          walCoinId = spendableCoin.coinObjectId;
          effectiveBlobSizeMb = blobSizeMb;
        } else if (!silent) {
          // Only warn on non-silent (explicit) saves - autosave firing this toast on every
          // debounce cycle for a user who simply has no WAL would be noisy and repetitive.
          toast.info(
            'Storage Fee Payment Skipped',
            'Storage fee payment skipped - insufficient WAL balance, note saved without fee tracking.'
          );
        }
      }

      await executeWithSigner(signer, {
        session: (sessionCapId) => suiService.updateNoteTxWithSession(
          activeNotebookId,
          walFeeReserveId,
          sessionCapId,
          id,
          blobId,
          encryptedTitle,
          contractFolderId,
          contractParentNoteId,
          expectedUpdatedAt,
          walCoinId,
          effectiveBlobSizeMb
        ),
        wallet: () => suiService.updateNoteTx(
          activeNotebookId,
          walFeeReserveId,
          id,
          blobId,
          encryptedTitle,
          contractFolderId,
          contractParentNoteId,
          expectedUpdatedAt,
          walCoinId,
          effectiveBlobSizeMb
        ),
      });

      // Only reflect the payment state once the transaction has actually landed - an in-flight
      // attempt that later throws must not be reported as having paid (or definitively not paid).
      setLastSaveWalPaymentActive(walCoinId !== null);

      if (loadingToastIdRef.current) toast.dismiss(loadingToastIdRef.current);
      loadingToastIdRef.current = null;
      if (!silent) {
        toast.success('Note Saved', 'Your changes have been saved successfully!');
      }
      return 'saved';

    } catch (error) {
      console.error('Failed to save note:', error);
      if (loadingToastIdRef.current) toast.dismiss(loadingToastIdRef.current);
      loadingToastIdRef.current = null;
      // Always surface save failures, even for silent (autosave) saves - a silently-failing
      // autosave that never tells the user would itself be a data-loss bug.
      const errorInfo = sanitizeWeb3Error(error);

      // A version-mismatch abort (E_VERSION_MISMATCH) means the note was changed elsewhere and
      // retrying with this same expected_updated_at will deterministically fail again forever -
      // distinct from a transient/lock-skip failure, so it must NOT be reported the same way (see
      // handleSaveNote's return-type doc). Surface this loudly even when silent, arguably more so
      // than a generic failure, since the user needs to know their edits can't be saved until they
      // reload the note.
      if (getMoveAbortCode(error) === E_VERSION_MISMATCH) {
        toast.error(errorInfo.title, errorInfo.description);
        return 'conflict';
      }

      toast.error(errorInfo.title, 'Note could not be saved. ' + errorInfo.description);
      return 'skipped';
    } finally {
      // Always clear the saving flag
      isSavingRef.current.delete(id);
    }
  };

  const handleDeleteNote = (id: string) => {
    setDeleteNoteId(id);
  };

  /**
   * Soft-delete (move to Trash) - recoverable via handleRestoreNote, not a permanent removal.
   */
  const confirmDeleteNote = async () => {
    // Defense in depth - the Delete affordances are hidden in read-only shared mode.
    if (isReadOnly) return;
    if (!deleteNoteId) return;
    const id = deleteNoteId;
    setDeleteNoteId(null);

    // Optimistic update - mark deleted rather than removing from `notes`, so it still shows up
    // under Trash immediately instead of only reappearing there after the next refetch.
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isDeleted: true } : n));
    // The note disappears from its current (non-Trash) view once marked deleted, so navigate
    // away from it if it was open - staying on a note that just vanished from the list is confusing.
    if (selectedNoteId === id && selectedFolderId !== 'trash') setSelectedNoteId(null);

    if (!activeNotebookId) return;

    try {
      const tx = suiService.deleteNoteTx(activeNotebookId, id);
      await signAndExecuteTransaction({ transaction: tx });
      toast.success('Moved to Trash', 'The note has been moved to Trash.');
    } catch (error) {
      console.error('Failed to delete note:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Note could not be deleted. ' + errorInfo.description);
      // Roll back the optimistic update - the note was never actually deleted on-chain
      setNotes(prev => prev.map(n => n.id === id ? { ...n, isDeleted: false } : n));
    }
  };

  /**
   * Restore a note out of Trash - the counterpart to confirmDeleteNote.
   */
  const handleRestoreNote = async (id: string) => {
    // Defense in depth - Restore affordances are hidden in read-only shared mode.
    if (isReadOnly) return;
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isDeleted: false } : n));

    if (!activeNotebookId) return;

    try {
      const tx = suiService.restoreNoteTx(activeNotebookId, id);
      await signAndExecuteTransaction({ transaction: tx });
      toast.success('Note Restored', 'The note has been restored from Trash.');
    } catch (error) {
      console.error('Failed to restore note:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Note could not be restored. ' + errorInfo.description);
      setNotes(prev => prev.map(n => n.id === id ? { ...n, isDeleted: true } : n));
    }
  };

  /**
   * Claim back the escrowed WAL storage-fee rebate for a deleted note (see NoteList's "Claim WAL
   * Rebate" row action, notebook.move's claim_wal_storage_rebate). Only meaningful for notes with
   * unclaimed walPaid > 0 - NoteList already gates the button on that, this is a defense-in-depth
   * re-check plus the actual on-chain call. Always wallet-signed (not session-capable on the
   * contract side), matching the other Trash actions (restore/delete) above.
   */
  const handleClaimWalRebate = async (id: string) => {
    // No shared path at all - the rebate refunds the OWNER's escrowed WAL, so the affordance is
    // hidden for grantees in BOTH shared modes (NoteList) and refused here as defense in depth.
    if (isShared) return;
    const note = notes.find(n => n.id === id);
    if (!note || !note.walPaid || note.walPaid <= 0 || note.rebateClaimed) return;
    if (!activeNotebookId || !walFeeReserveId) return;

    // Optimistic update - mark claimed so the button disappears immediately.
    setNotes(prev => prev.map(n => n.id === id ? { ...n, rebateClaimed: true, walPaid: 0 } : n));

    try {
      const tx = suiService.claimWalRebateTx(activeNotebookId, walFeeReserveId, id);
      await signAndExecuteTransaction({ transaction: tx });
      toast.success('WAL Rebate Claimed', 'The escrowed storage fee has been refunded to the notebook owner.');
    } catch (error) {
      console.error('Failed to claim WAL rebate:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'WAL rebate could not be claimed. ' + errorInfo.description);
      // Roll back - the claim never actually landed on-chain.
      setNotes(prev => prev.map(n => n.id === id ? { ...n, rebateClaimed: note.rebateClaimed, walPaid: note.walPaid } : n));
    }
  };

  /**
   * Restore a folder out of Trash - the counterpart to handleDeleteFolder.
   */
  const handleRestoreFolder = async (folderId: string) => {
    // Defense in depth - the Trash-view folder Restore buttons are hidden in read-only shared mode.
    if (isReadOnly) return;
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isDeleted: false } : f));

    if (!activeNotebookId) return;

    try {
      const tx = suiService.restoreFolderTx(activeNotebookId, folderId);
      await signAndExecuteTransaction({ transaction: tx });
      toast.success('Folder Restored', 'The folder has been restored from Trash.');
    } catch (error) {
      console.error('Failed to restore folder:', error);
      const errorInfo = sanitizeWeb3Error(error);
      toast.error(errorInfo.title, 'Folder could not be restored. ' + errorInfo.description);
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isDeleted: true } : f));
    }
  };

  /**
   * Exit shared-viewing mode (SharedModeBanner's button). exitShared drops the shared content
   * key from ActiveNotebookContext state; the selection/search resets below are belt-and-braces
   * on top of the activeNotebookId-change reset effect (which fires anyway when the active id
   * flips back to the own notebook).
   */
  const handleExitShared = () => {
    exitShared();
    setSelectedNoteId(null);
    setSelectedFolderId('notes');
    setSearchQuery('');
  };

  // --- Render Logic ---

  // 1. Not Connected
  if (!currentAccount) {
    console.log('[App] Render: Landing page (no account)');
    return <LandingPage />;
  }

  // 2. Connected, but Locked (No Encryption Key)
  if (!encryptionKey) {
    console.log('[App] Render: Unlock screen (no encryption key)');
    return <Onboarding mode="unlock" />;
  }

  // 3. Unlocked, waiting for notebook query to finish
  if (isNotebookLoading) {
    console.log('[App] Render: Loading notebook...');
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">Loading your notebook...</p>
      </div>
    );
  }

  // 4. Auto-initializing notebook (first time user)
  if (isInitializingNotebook) {
    console.log('[App] Render: Initializing notebook...');
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-lg font-medium mb-2">Initializing Your Notebook</p>
        <p className="text-muted-foreground text-center max-w-md">
          Creating your secure notebook on Sui blockchain...
          <br />
          This will only take a moment.
        </p>
      </div>
    );
  }

  // 5. Initialization failed, show retry option
  if (!notebook && initializationError) {
    console.log('[App] Render: Initialization error screen');
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Initialization Failed</h1>
          <p className="text-muted-foreground">
            Failed to create your notebook on the blockchain.
            <br />
            <span className="text-sm">Error: {initializationError}</span>
          </p>
          <button
            onClick={() => {
              setInitializationError(null);
              refetchNotebook();
            }}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  console.log('[App] Render: Main app', { hasNotebook: !!notebook });

  // 4. Main App (Unlocked & Initialized)
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={(id) => {
          setSelectedFolderId(id);
          // Auto-close the mobile drawer on selection - on desktop the sidebar is a static
          // persistent panel (md:static in Sidebar.tsx) so this check is a no-op there.
          if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false);
        }}
        onCreateFolder={openCreateFolderModal}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onReparentFolder={handleReparentFolder}
        onReorderFolders={handleReorderFolders}
        onMoveNote={handleMoveNote}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSharedWithMe={() => setShowSharedWithMe(true)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        readOnly={isReadOnly}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Persistent, non-dismissable while viewing someone else's notebook - the only way out
            is the Exit button (or wallet change/lock, which reset shared mode at the provider). */}
        {active.kind === 'shared' && (
          <SharedModeBanner
            notebookId={active.notebookId}
            permission={active.permission}
            expiresAt={active.expiresAt}
            onExit={handleExitShared}
          />
        )}
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          folderName={folders.find(f => f.id === selectedFolderId)?.name}
          onCreateNote={handleCreateNote}
          walPaymentActive={lastSaveWalPaymentActive}
          isSharedMode={isShared}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Below md, only one of NoteList/Editor is visible at a time (phone-width screens
              don't have room for a 3-pane layout) - which one is driven by whether a note is
              selected, so no extra state is needed beyond selectedNoteId itself. At md+ both
              are always shown side by side, unchanged from the original layout. */}
          <div className={`${selectedNoteId ? 'hidden md:block' : 'block'} w-full md:w-80 shrink-0`}>
            {selectedFolderId === 'trash' && deletedFolders.length > 0 && (
              <div className="px-2 pt-3">
                <h3 className="px-3 py-1 text-xs font-semibold text-web3-textMuted/70 uppercase tracking-widest">
                  Deleted Folders
                </h3>
                <ul className="space-y-1">
                  {deletedFolders.map(folder => (
                    <li
                      key={folder.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-web3-textMuted"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderIcon size={14} className="shrink-0 opacity-70" />
                        <span className="text-sm truncate">{folder.name}</span>
                      </div>
                      {/* Folder restore is a mutation - hidden entirely in read-only shared mode. */}
                      {!isReadOnly && (
                        <button
                          onClick={() => handleRestoreFolder(folder.id)}
                          title="Restore"
                          aria-label={`Restore folder ${folder.name}`}
                          className="p-1 rounded hover:bg-web3-cardHover text-web3-textMuted hover:text-web3-text shrink-0"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <NoteList
              notes={filteredNotes}
              folders={folders}
              selectedNoteId={selectedNoteId}
              onSelectNote={setSelectedNoteId}
              onCreateNote={handleCreateNote}
              onMoveNote={handleMoveNote}
              onDeleteNote={handleDeleteNote}
              onRestoreNote={handleRestoreNote}
              onClaimWalRebate={handleClaimWalRebate}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchFocus={() => ensureIndexed(notes)}
              readOnly={isReadOnly}
              isSharedMode={isShared}
            />
          </div>

          <main className={`${selectedNoteId ? 'flex' : 'hidden md:block'} flex-1 bg-background overflow-y-auto relative`}>
            {selectedNoteId ? (
              <GlobalErrorBoundary>
                <Editor
                  key={selectedNoteId}
                  note={notes.find(n => n.id === selectedNoteId)!}
                  notes={notes}
                  folders={folders}
                  childNotes={childNotes}
                  onUpdateNote={handleUpdateNote}
                  onSave={handleSaveNote}
                  onDeleteNote={handleDeleteNote}
                  onRestoreNote={handleRestoreNote}
                  onCreateNote={handleCreateNote}
                  onCreateSubNote={handleCreateSubNote}
                  onNavigateToFolder={(folderId) => { setSelectedFolderId(folderId); setSelectedNoteId(null); }}
                  onNavigateToNote={(noteId) => setSelectedNoteId(noteId)}
                  onDirtyChange={(noteId, isDirty) => {
                    if (isDirty) dirtyNoteIdsRef.current.add(noteId);
                    else dirtyNoteIdsRef.current.delete(noteId);
                  }}
                  onBack={() => setSelectedNoteId(null)}
                  readOnly={isReadOnly}
                  isSharedMode={isShared}
                  // Only used by the owner-only Share button/ShareModal - passed as null in
                  // shared mode (Share is hidden there anyway) as defense in depth.
                  notebookId={isShared ? null : (notebook?.data?.objectId ?? null)}
                />
              </GlobalErrorBoundary>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a note or create a new one
              </div>
            )}
          </main>
        </div>
      </div>

      <Modal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title="Create New Folder"
        className="w-full max-w-md"
      >
        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Folder Name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full bg-web3-bg/50 px-4 py-2 rounded-lg border border-web3-border focus:border-web3-primary focus:ring-1 focus:ring-web3-primary outline-none text-web3-text"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsFolderModalOpen(false)}
              className="px-4 py-2 rounded-lg text-web3-textMuted hover:bg-web3-cardHover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFolder}
              className="px-4 py-2 rounded-lg bg-web3-primary text-white hover:bg-web3-primary/90 transition-colors font-medium"
            >
              Create Folder
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteNoteId}
        onClose={() => setDeleteNoteId(null)}
        title="Move to Trash"
      >
        <div className="flex flex-col gap-4">
          <p className="text-web3-textMuted">This note will be moved to Trash. You can restore it later from there.</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteNoteId(null)}
              className="px-4 py-2 rounded-lg text-web3-textMuted hover:bg-web3-cardHover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteNote}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors font-medium border border-red-500/20"
            >
              Move to Trash
            </button>
          </div>
        </div>
      </Modal>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Shared With Me Modal - discovery of notebooks other people have shared with this
          wallet; "Open" unwraps the shared content key and switches the app into that notebook
          (see SharedNotebooksModal doc comment). */}
      <SharedNotebooksModal
        isOpen={showSharedWithMe}
        onClose={() => setShowSharedWithMe(false)}
        getHasUnsavedChanges={() => dirtyNoteIdsRef.current.size > 0}
      />

      {/* Global Cmd/Ctrl+K quick switcher */}
      <CommandPalette
        notes={notes}
        folders={folders}
        getIndexedContent={getIndexedContent}
        onOpenIntent={() => ensureIndexed(notes)}
        onSelectNote={(id) => {
          const note = notes.find(n => n.id === id);
          if (note) setSelectedFolderId(note.folderId);
          setSelectedNoteId(id);
        }}
        onSelectFolder={(id) => { setSelectedFolderId(id); setSelectedNoteId(null); }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <EncryptionProvider>
        <SessionProvider>
          {/* ActiveNotebookProvider sits below dapp-kit/EncryptionProvider (it consumes both)
              and above SyncProvider (which gates its event subscription on the ACTIVE notebook
              id, own or shared - see useActiveNotebook). */}
          <ActiveNotebookProvider>
            <SettingsProvider>
              <ToastProvider>
                <SyncProvider>
                  <AppContent />
                </SyncProvider>
              </ToastProvider>
            </SettingsProvider>
          </ActiveNotebookProvider>
        </SessionProvider>
      </EncryptionProvider>
    </ThemeProvider>
  );
}