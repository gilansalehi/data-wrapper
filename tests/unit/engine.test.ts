import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { applyBinding, applyItemBindings, reconcile } from '@lib/engine.ts';

describe('applyBinding', () => {
    let el: HTMLElement;
    beforeEach(() => { el = document.createElement('span'); });

    it.todo('sets el.textContent when prop is "textContent"');
    it.todo('sets el[prop] for arbitrary props');
    it.todo('ignores null value (does not overwrite)');
    it.todo('ignores undefined value');
    it.todo('class: appends dynamic class to existing base classes');
    it.todo('class: replaces previous dynamic class on repeated calls');
    it.todo('class: preserves base classes across dynamic updates');
});

describe('applyItemBindings', () => {
    it.todo('applies all configs stored on node._vItemConfigs');
    it.todo('pipes are applied left-to-right before binding');
    it.todo('does nothing when _vItemConfigs is absent');
});

describe('reconcile', () => {
    let container: HTMLElement;
    let cache: Map<unknown, Element>;
    let tpl: HTMLTemplateElement;

    beforeEach(() => {
        container = document.createElement('ul');
        cache     = new Map();
        tpl       = document.createElement('template');
        tpl.innerHTML = '<li></li>';
        document.body.appendChild(container);
    });

    it.todo('appends one node per item');
    it.todo('reuses existing cache nodes on re-render');
    it.todo('removes nodes whose id is no longer in the data');
    it.todo('uses item[keyProp] as the cache key');
    it.todo('falls back to JSON.stringify when key is missing');
    it.todo('shows empty-state node when data is empty');
    it.todo('removes empty-state node when data becomes non-empty');
    it.todo('calls hydrate for new nodes, applyItemBindings for updates');
});
