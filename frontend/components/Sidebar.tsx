import React from 'react';
import { Folder as FolderIcon, Trash2, Archive, Grid, Plus, Sun, Moon } from 'lucide-react';
import { Folder } from '../types';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder?: () => void;
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  isOpen
}) => {
  const { theme, toggleTheme } = useTheme();

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
    <div className="w-64 bg-web3-card/30 h-full border-r border-web3-border/50 flex flex-col pt-10 select-none transition-all duration-300 ease-in-out backdrop-blur-md">
      <div className="px-4 pb-2">
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
          onClick={toggleTheme}
          className="flex items-center text-xs text-web3-textMuted justify-between cursor-pointer hover:text-web3-primary transition-colors group p-2 rounded hover:bg-web3-cardHover"
        >
          <span className="flex items-center gap-2">
            <div className="p-1 rounded bg-web3-card border border-web3-border group-hover:border-web3-primary transition-colors">
              {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            </div>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        </div>
      </div>
    </div>
  );
};