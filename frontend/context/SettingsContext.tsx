import React, { createContext, useContext, useEffect, useState } from 'react';

interface SettingsContextType {
    showSessionStatus: boolean;
    toggleSessionStatus: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [showSessionStatus, setShowSessionStatus] = useState<boolean>(() => {
        // Check localStorage first
        const saved = localStorage.getItem('inkblob-settings-showSessionStatus');
        if (saved === 'true' || saved === 'false') return saved === 'true';
        // Default to true (show session status by default)
        return true;
    });

    useEffect(() => {
        localStorage.setItem('inkblob-settings-showSessionStatus', showSessionStatus.toString());
    }, [showSessionStatus]);

    const toggleSessionStatus = () => {
        setShowSessionStatus(prev => !prev);
    };

    return (
        <SettingsContext.Provider value={{ showSessionStatus, toggleSessionStatus }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};