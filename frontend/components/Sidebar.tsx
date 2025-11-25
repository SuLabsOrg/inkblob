import { Archive, Folder as FolderIcon, Grid, Plus, Settings, Trash2 } from 'lucide-react';
import React from 'react';
import { Folder } from '../types';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder?: () => void;
  onOpenSettings?: () => void;
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onOpenSettings,
  isOpen
}) => {

  if (!isOpen) return null;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'trash': return <Trash2 size={16} />;
      case 'archive': return <Archive size={16} />;
      case 'smart': return <Grid size={16} />;
      default: return <FolderIcon size={16} />;
    }
  };

  return (
    <div className="w-64 bg-web3-card/30 h-full border-r border-web3-border/50 flex flex-col select-none transition-all duration-300 ease-in-out backdrop-blur-md">
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

      <div className="px-4 pb-2 pt-4">
        <h3 className="text-xs font-bold text-web3-textMuted uppercase tracking-wider mb-2 pl-2">Library</h3>
        <ul>
          {folders.map(folder => (
            <li key={folder.id} className="mb-1">
              <button
                onClick={() => onSelectFolder(folder.id)}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${selectedFolderId === folder.id
                  ? 'bg-web3-primary/20 text-web3-primary shadow-[0_0_10px_rgba(139,92,246,0.2)]'
                  : 'text-web3-textMuted hover:bg-web3-cardHover hover:text-web3-text'
                  }`}
              >
                <span className={`mr-3 ${selectedFolderId === folder.id ? 'text-web3-primary' : 'text-web3-textMuted'}`}>
                  {getIcon(folder.icon)}
                </span>
                {folder.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom area */}
      <div className="mt-auto p-4 border-t border-web3-border/30 flex flex-col gap-2">
        <div
          onClick={onCreateFolder}
          className="flex items-center text-xs text-web3-textMuted justify-between cursor-pointer hover:text-web3-accent transition-colors group p-2 rounded hover:bg-web3-cardHover"
        >
          <span className="flex items-center gap-2">
            <div className="p-1 rounded bg-web3-card border border-web3-border group-hover:border-web3-accent transition-colors">
              <Plus size={12} />
            </div>
            New Folder
          </span>
        </div>

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
      </div>
    </div>
  );
};