import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { subscribe, wake, ensureDelegation } from '@lib/wire.ts';
import type { UpdateConfig } from '@lib/engine.ts';
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

const appendWrapper = (html = '') => {
    const wrapper = makeWrapper();
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    return wrapper;
};

const firstSub = (wrapper: WrapperNode, path: string): UpdateConfig => {
    const config = wrapper._subs[path]?.[0];
    expect(config).toBeDefined();
    return config!;
};

const itemConfigs = (el: Element): UpdateConfig[] =>
    (el as Element & { _vItemConfigs?: UpdateConfig[] })._vItemConfigs ?? [];

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('parsePath (via subscribe behaviour)', () => {
    it('/key → path="key", isItemScoped=false', () => {
        const wrapper = appendWrapper('<span></span>');
        const el = wrapper.querySelector('span')!;

        subscribe(el, 'dynamic', '$text', '/key');

        const config = firstSub(wrapper, 'key');
        expect(config.path).toBe('key');
        expect(config.itemNode).toBeNull();
    });

    it('./key → path="key", isItemScoped=true', () => {
        const itemNode = document.createElement('li') as Element & {
            _vItem?: Record<string, unknown>;
        };
        itemNode._vItem = { key: 'Scoped value' };
        itemNode.innerHTML = '<span></span>';
        const el = itemNode.querySelector('span')!;

        subscribe(el, 'dynamic', '$text', './key', itemNode);

        const [config] = itemConfigs(itemNode);
        expect(config.path).toBe('key');
        expect(config.itemNode).toBe(itemNode);
        expect(el.textContent).toBe('Scoped value');
    });

    it('/user/name → path="user/name"', () => {
        const wrapper = appendWrapper('<span></span>');
        const el = wrapper.querySelector('span')!;

        subscribe(el, 'dynamic', '$text', '/user/name');

        expect(firstSub(wrapper, 'user/name').path).toBe('user/name');
    });

    it('?format=upper → pipes contains upper formatter', () => {
        const wrapper = appendWrapper('<span></span>');
        const el = wrapper.querySelector('span')!;

        subscribe(el, 'dynamic', '$text', '/name?format=upper');

        const config = firstSub(wrapper, 'name');
        expect(config.pipes).toHaveLength(1);
        expect(config.pipes[0]('ali')).toBe('ALI');
    });

    it('?format=trim&format=upper → two pipes in order', () => {
        const wrapper = appendWrapper('<span></span>');
        const el = wrapper.querySelector('span')!;

        subscribe(el, 'dynamic', '$text', '/name?format=trim&format=upper');

        const config = firstSub(wrapper, 'name');
        let formatted: unknown = '  ali  ';
        for (const pipe of config.pipes) formatted = pipe(formatted);
        expect(config.pipes).toHaveLength(2);
        expect(formatted).toBe('ALI');
    });

    it('?key=uuid → key="uuid"', () => {
        const wrapper = appendWrapper('<ul></ul>');
        const el = wrapper.querySelector('ul')!;

        subscribe(el, 'dynamic', '$list', '/users?key=uuid');

        expect(firstSub(wrapper, 'users').key).toBe('uuid');
    });

    it('//other/key → isCrossWrapper=true, skipped', () => {
        const wrapper = appendWrapper('<span></span>');
        const el = wrapper.querySelector('span')!;

        subscribe(el, 'dynamic', '$text', '//other/key');

        expect(wrapper._subs).toEqual({});
    });
});

describe('wake', () => {
    let wrapper: WrapperNode;
    beforeEach(() => {
        wrapper = makeWrapper();
        document.body.appendChild(wrapper as unknown as HTMLElement);
    });

    it('registers $text binding in wrapper._subs', () => {
        wrapper.innerHTML = '<span $text="/name"></span>';

        wake(wrapper);

        const config = firstSub(wrapper, 'name');
        expect(config.prop).toBe('text');
        expect(config.el).toBe(wrapper.querySelector('span')!);
    });

    it.skip('wires _data-active as state-to-attribute binding when additive tokens graduate from todo', () => {
        wrapper.innerHTML = '<span _data-active="/active"></span>';

        wake(wrapper);

        const config = firstSub(wrapper, 'active');
        expect(config.prop).toBe('data-active');
        expect(config.el).toBe(wrapper.querySelector('span')!);
    });

    it('wires @click event via ensureDelegation', () => {
        wrapper.innerHTML = '<button @click="topic"></button>';

        wake(wrapper);

        expect(wrapper._boundEvents.has('click')).toBe(true);
    });

    it('marks wired elements with _vWoke to prevent double-wiring', () => {
        wrapper.innerHTML = '<span $text="/name"></span>';

        wake(wrapper);
        wake(wrapper);

        const el = wrapper.querySelector('span') as Element & { _vWoke?: boolean };
        expect(el._vWoke).toBe(true);
        expect(wrapper._subs.name).toHaveLength(1);
    });

    it('does not descend into nested data-wrapper elements', () => {
        wrapper.innerHTML = `
            <span $text="/outer"></span>
            <data-wrapper>
                <span $text="/inner"></span>
            </data-wrapper>
        `;

        wake(wrapper);

        expect(firstSub(wrapper, 'outer').path).toBe('outer');
        expect(wrapper._subs.inner).toBeUndefined();
    });

    it('does not descend into <template> elements', () => {
        wrapper.innerHTML = `
            <span $text="/outside"></span>
            <template>
                <span $text="/inside"></span>
            </template>
        `;

        wake(wrapper);

        expect(firstSub(wrapper, 'outside').path).toBe('outside');
        expect(wrapper._subs.inside).toBeUndefined();
    });

    it('item-scoped ./path is stored on itemNode._vItemConfigs, not wrapper._subs', () => {
        const itemNode = document.createElement('li') as Element & {
            _vItem?: Record<string, unknown>;
        };
        itemNode._vItem = { task: 'Ship tests' };
        itemNode.innerHTML = '<span $text="./task"></span>';
        wrapper.appendChild(itemNode);

        wake(itemNode, itemNode);

        const [config] = itemConfigs(itemNode);
        expect(config.path).toBe('task');
        expect(config.el).toBe(itemNode.querySelector('span')!);
        expect(wrapper._subs.task).toBeUndefined();
        expect(itemNode.querySelector('span')!.textContent).toBe('Ship tests');
    });
});

describe('ensureDelegation', () => {
    let wrapper: WrapperNode;
    beforeEach(() => {
        wrapper = makeWrapper();
        document.body.appendChild(wrapper as unknown as HTMLElement);
    });

    it('adds event type to wrapper._boundEvents', () => {
        ensureDelegation(wrapper, 'click');

        expect(wrapper._boundEvents.has('click')).toBe(true);
    });

    it('does not add duplicate listeners for the same event type', () => {
        wrapper.innerHTML = '<button @click="topic"></button>';
        let calls = 0;
        wrapper.addEventListener('topic', () => { calls += 1; });

        ensureDelegation(wrapper, 'click');
        ensureDelegation(wrapper, 'click');
        wrapper.querySelector('button')!.click();

        expect(wrapper._boundEvents).toHaveLength(1);
        expect(calls).toBe(1);
    });

    it('fires registered handler when delegated element is clicked', () => {
        wrapper.innerHTML = '<button @click="topic"></button>';
        let fired = false;
        wrapper.addEventListener('topic', () => { fired = true; });

        ensureDelegation(wrapper, 'click');
        wrapper.querySelector('button')!.click();

        expect(fired).toBe(true);
    });

    it('passes original event in CustomEvent.detail', () => {
        wrapper.innerHTML = '<button @click="topic"></button>';
        let detail: unknown;
        wrapper.addEventListener('topic', e => { detail = (e as CustomEvent).detail; });

        ensureDelegation(wrapper, 'click');
        const event = new Event('click', { bubbles: true });
        wrapper.querySelector('button')!.dispatchEvent(event);

        expect(detail).toBe(event);
    });

    it('sets delegateTarget on the event detail', () => {
        wrapper.innerHTML = '<button @click="topic"><span>Click</span></button>';
        let detail: (Event & { delegateTarget?: Element | null }) | undefined;
        wrapper.addEventListener('topic', e => { detail = (e as CustomEvent).detail; });

        ensureDelegation(wrapper, 'click');
        wrapper.querySelector('span')!.dispatchEvent(new Event('click', { bubbles: true }));

        expect(detail?.delegateTarget).toBe(wrapper.querySelector('button'));
    });
});
