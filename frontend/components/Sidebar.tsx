import React from 'react';
import { Folder as FolderIcon, Trash2, Archive, Grid, Plus } from 'lucide-react';
import { Folder } from '../types';

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string;
  onSelectFolder: (id: string) => void;
  isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  folders, 
  selectedFolderId, 
  onSelectFolder,
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
    <div className="w-64 bg-mac-sidebar h-full border-r border-mac-border flex flex-col pt-10 select-none transition-all duration-300 ease-in-out">
      <div className="px-4 pb-2">
        <h3 className="text-xs font-bold text-mac-textMuted uppercase tracking-wider mb-2 pl-2">iCloud</h3>
        <ul>
          {folders.map(folder => (
            <li key={folder.id} className="mb-0.5">
              <button
                onClick={() => onSelectFolder(folder.id)}
                className={`w-full flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                  selectedFolderId === folder.id
                    ? 'bg-mac-sidebarActive/20 text-yellow-700' // Mac active state simulation
                    : 'text-mac-text hover:bg-black/5'
                }`}
              >
                <span className={`mr-2 ${selectedFolderId === folder.id ? 'text-yellow-600' : 'text-gray-500'}`}>
                  {getIcon(folder.icon)}
                </span>
                {folder.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
      
      {/* Simulation of bottom area */}
      <div className="mt-auto p-4 border-t border-mac-border/50">
         <div className="flex items-center text-xs text-gray-500 justify-between cursor-pointer hover:opacity-70 transition-opacity">
            <span className="flex items-center gap-1">
                <Plus size={14} /> New Folder
            </span>
         </div>
      </div>
    </div>
  );
};