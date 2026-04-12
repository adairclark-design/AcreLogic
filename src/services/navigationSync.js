import { Platform } from 'react-native';

const NAVIGATION_STORAGE_KEY = 'acrelogic_nav_state';

// ─── Load Navigation State ───────────────────────────────────────────────────
// Hydrates the React Navigation tree exactly from where the user left off.
export const loadNavigationState = async () => {
    if (Platform.OS !== 'web') return undefined;
    try {
        const savedStateString = localStorage.getItem(NAVIGATION_STORAGE_KEY);
        const state = savedStateString ? JSON.parse(savedStateString) : undefined;
        return state;
    } catch (e) {
        // If state is corrupted (e.g. invalid JSON from a previous version), wipe it out safely.
        localStorage.removeItem(NAVIGATION_STORAGE_KEY);
        return undefined;
    }
};

// ─── Save Navigation State ───────────────────────────────────────────────────
// Serializes the active screen, history stack, and all params back to localStorage.
export const saveNavigationState = (state) => {
    if (Platform.OS !== 'web' || !state) return;
    try {
        // Warning: Some edge React objects cannot be safely serialized via JSON.stringify.
        // However, AcreLogic relies on pure JSON objects inside its param routing loops.
        localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        // Silently swallow quota limit errors or non-serializable param exceptions.
        console.warn('navigationSync: Could not save navigation state', e);
    }
};
