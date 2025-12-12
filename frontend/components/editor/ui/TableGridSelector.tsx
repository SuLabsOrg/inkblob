import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface TableGridSelectorProps {
    onSelect: (rows: number, cols: number) => void;
    close: () => void;
    position: { top: number; left: number };
}

export const TableGridSelector: React.FC<TableGridSelectorProps> = ({ onSelect, close, position }) => {
    const [hoveredRows, setHoveredRows] = useState(0);
    const [hoveredCols, setHoveredCols] = useState(0);

    const MAX_ROWS = 10;
    const MAX_COLS = 10;

    const handleMouseEnter = (r: number, c: number) => {
        setHoveredRows(r);
        setHoveredCols(c);
    };

    const handleClick = () => {
        if (hoveredRows > 0 && hoveredCols > 0) {
            onSelect(hoveredRows, hoveredCols);
            close();
        }
    };

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Close if clicking outside logic handled or just use a backdrop
        };
        // Simple "close on any click outside this component" is tricky with portals without a backdrop
        // relying on SlashMenu's close mechanism might be interfering.
        // Let's add a transparent backdrop.
        return () => { };
    }, [close]);

    return createPortal(
        <>
            <div className="fixed inset-0 z-50" onClick={close} />
            <div
                className="fixed z-50 p-3 bg-web3-card border border-web3-border rounded-lg shadow-xl flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
                style={{ top: position.top, left: position.left }}
                onMouseLeave={() => {
                    setHoveredRows(0);
                    setHoveredCols(0);
                }}
            >
                <div className="text-xs text-web3-textMuted font-medium mb-1 text-center">
                    {hoveredRows > 0 ? `${hoveredCols} x ${hoveredRows}` : 'Insert Table'}
                </div>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${MAX_COLS}, minmax(0, 1fr))` }}>
                    {Array.from({ length: MAX_ROWS }).map((_, r) => (
                        Array.from({ length: MAX_COLS }).map((_, c) => {
                            const row = r + 1;
                            const col = c + 1;
                            const isActive = row <= hoveredRows && col <= hoveredCols;

                            return (
                                <div
                                    key={`${r}-${c}`}
                                    className={`w-4 h-4 border rounded-sm cursor-pointer transition-colors ${isActive
                                        ? 'bg-web3-primary border-web3-primary'
                                        : 'bg-web3-cardHover border-web3-border'
                                        }`}
                                    onMouseEnter={() => handleMouseEnter(row, col)}
                                    onClick={handleClick}
                                />
                            );
                        })
                    ))}
                </div>
            </div>
        </>,
        document.body
    );
};
