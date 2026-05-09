(() => {
    const key  = 'data-wrapper:theme';
    const root = document.documentElement;

    const set = theme => {
        root.dataset.theme = theme;
        try { localStorage.setItem(key, theme); } catch {}
        return theme;
    };

    const load = () => {
        try {
            const saved = localStorage.getItem(key);
            if (saved === 'light' || saved === 'dark') return set(saved);
        } catch {}
        return root.dataset.theme || 'light';
    };

    window.theme = {
        load,
        set,
        toggle: () => set(root.dataset.theme === 'dark' ? 'light' : 'dark'),
    };

    load();
})();
