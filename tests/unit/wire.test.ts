import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { wake, ensureDelegation } from '@lib/wire.ts';
import type { WrapperNode } from '@lib/wire.ts';

// Minimal WrapperNode stub for unit tests
const makeWrapper = (): WrapperNode => {
    const el = document.createElement('data-wrapper') as WrapperNode;
    el.state        = {};
    el._subs        = {};
    el._boundEvents = new Set();
    el._listCache   = new Map();
    el._sub         = (path, config) => {
        (el._subs[path] ??= []).push(config);
    };
    return el;
};

describe('parsePath (via subscribe behaviour)', () => {
    it.todo('/key → path="key", isItemScoped=false');
    it.todo('./key → path="key", isItemScoped=true');
    it.todo('/user/name → path="user/name"');
    it.todo('?format=upper → pipes contains upper formatter');
    it.todo('?format=trim&format=upper → two pipes in order');
    it.todo('?key=uuid → key="uuid"');
    it.todo('//other/key → isCrossWrapper=true, skipped');
});

describe('wake', () => {
    let wrapper: WrapperNode;
    beforeEach(() => {
        wrapper = makeWrapper();
        document.body.appendChild(wrapper as unknown as HTMLElement);
    });

    it.todo('registers $text binding in wrapper._subs');
    it.todo('wires @click event via ensureDelegation');
    it.todo('marks wired elements with _vWoke to prevent double-wiring');
    it.todo('does not descend into nested data-wrapper elements');
    it.todo('does not descend into <template> elements');
    it.todo('item-scoped ./path is stored on itemNode._vItemConfigs, not wrapper._subs');
});

describe('ensureDelegation', () => {
    let wrapper: WrapperNode;
    beforeEach(() => {
        wrapper = makeWrapper();
        document.body.appendChild(wrapper as unknown as HTMLElement);
    });

    it.todo('adds event type to wrapper._boundEvents');
    it.todo('does not add duplicate listeners for the same event type');
    it.todo('fires registered handler when delegated element is clicked');
    it.todo('passes original event in CustomEvent.detail');
    it.todo('sets delegateTarget on the event detail');
});
