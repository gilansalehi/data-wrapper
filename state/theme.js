import { action } from '/dist/data-wrapper.js';

const KEY  = 'data-wrapper:theme';
const root = document.documentElement;

// The inline <head> script already applied any saved theme to the <html>
// element before parse, so reading the attribute here picks up that value
// without re-running localStorage.
export let theme = root.dataset.theme === 'dark' ? 'dark' : 'light';

const persist = (v) => {
    root.dataset.theme = v;
    try { localStorage.setItem(KEY, v); } catch {}
};

export const { setTheme, toggleTheme } = action({
    setTheme:    (v) => { theme = v; persist(v); },
    toggleTheme: ()  => { theme = theme === 'dark' ? 'light' : 'dark'; persist(theme); },
});
