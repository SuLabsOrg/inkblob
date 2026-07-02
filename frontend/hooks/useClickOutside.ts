import { RefObject, useEffect } from 'react';

/** Closes a portaled popover/menu when a mousedown lands outside `ref`'s element. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutsideClick: () => void): void {
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onOutsideClick();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [ref, onOutsideClick]);
}
