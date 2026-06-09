import { describe, it, expect, beforeEach } from '@tests/helpers.ts';
import { p } from '@lib/utils.ts';
import { wake, reconcile } from '@lib/engine.ts';
import type { Row, Station } from '@lib/engine.ts';
import '@lib/component.ts';

interface TestWrapper extends HTMLElement {
    state:    Record<string, unknown>;
    _subs:    Station;
    put:      (key: string, val: unknown | ((prev: unknown) => unknown)) => void;
    handlePut(e: CustomEvent): void;
}

const make = (html = '', dataset: Record<string, string> = {}): TestWrapper => {
    const el = document.createElement('data-wrapper') as TestWrapper;
    for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('pURL parsing — put: protocol forms', () => {
    it('parses put:/key as absolute path', () => {
        const r = p('put:/done');
        expect(r.protocol).toBe('put:');
        expect(r.path).toBe('done');
        expect(r.isRel).toBe(false);
    });

    it('parses put:./key as relative path', () => {
        const r = p('put:./done');
        expect(r.protocol).toBe('put:');
        expect(r.path).toBe('done');
        expect(r.isRel).toBe(true);
    });

    it('parses put:key (bare) as wrapper-scoped path', () => {
        const r = p('put:done');
        expect(r.protocol).toBe('put:');
        expect(r.path).toBe('done');
        expect(r.isRel).toBe(false);
    });

    it('parses put://host/key with authority', () => {
        const r = p('put://other/done');
        expect(r.protocol).toBe('put:');
        expect(r.host).toBe('other');
        expect(r.path).toBe('done');
        expect(r.isRel).toBe(false);
    });

    it('parses nested put:/a/b/c as a deep path', () => {
        const r = p('put:/user/name/first');
        expect(r.path).toBe('user/name/first');
        expect(r.isRel).toBe(false);
    });

    it('does not eat the leading character on bare put:key', () => {
        // Regression guard for the opaque-pathname slice bug
        const r = p('put:done');
        expect(r.path).toBe('done');
        expect(r.path).not.toBe('one');
    });
});

describe('put: dispatch — wire @ branch', () => {
    it('emits "put:" as the event topic when protocol is put:', () => {
        const wrapper = make('<input @change="put:/message" name="message">');
        let putFired = false;
        let messageFired = false;
        wrapper.addEventListener('put:', () => { putFired = true; });
        wrapper.addEventListener('message', () => { messageFired = true; });

        wrapper.querySelector('input')!.dispatchEvent(new Event('change', { bubbles: true }));

        expect(putFired).toBe(true);
        expect(messageFired).toBe(false);
    });

    it('emits the path topic when protocol is default (legacy callbacks still work)', () => {
        const wrapper = make('<button @click="todo/add"></button>');
        let putFired = false;
        let topicFired = false;
        wrapper.addEventListener('put:', () => { putFired = true; });
        wrapper.addEventListener('todo/add', () => { topicFired = true; });

        wrapper.querySelector('button')!.click();

        expect(topicFired).toBe(true);
        expect(putFired).toBe(false);
    });

    it('puts path and isRel into the event detail', () => {
        const wrapper = make('<input @change="put:./done" name="done">');
        let detail: { path?: string; isRel?: boolean } = {};
        wrapper.addEventListener('put:', (e) => {
            detail = (e as CustomEvent).detail;
        });

        const input = wrapper.querySelector('input') as HTMLInputElement;
        input.dispatchEvent(new Event('change', { bubbles: true }));

        expect(detail.path).toBe('done');
        expect(detail.isRel).toBe(true);
    });

    it('preserves originalEvent and payload in detail', () => {
        const wrapper = make('<input @change="put:/message" name="message" value="hi">');
        let detail: { originalEvent?: Event; payload?: Record<string, unknown> } = {};
        wrapper.addEventListener('put:', (e) => {
            detail = (e as CustomEvent).detail;
        });

        const input = wrapper.querySelector('input') as HTMLInputElement;
        input.value = 'hello';
        input.dispatchEvent(new Event('change', { bubbles: true }));

        expect(detail.originalEvent).toBeInstanceOf(Event);
        expect(detail.payload).toEqual({ message: 'hello' });
    });
});

describe('element-aware payload extraction (via put: dispatch)', () => {
    it('checkbox contributes its boolean checked state, not the value attribute', () => {
        const wrapper = make('<input type="checkbox" @change="put:/agreed" name="agreed" value="on">');
        let payload: Record<string, unknown> = {};
        wrapper.addEventListener('put:', (e) => {
            payload = (e as CustomEvent).detail.payload;
        });

        const cb = wrapper.querySelector('input') as HTMLInputElement;
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));

        expect(payload).toEqual({ agreed: true });
    });

    it('unchecked checkbox contributes false (not omitted as FormData would)', () => {
        const wrapper = make('<input type="checkbox" @change="put:/agreed" name="agreed">');
        let payload: Record<string, unknown> = {};
        wrapper.addEventListener('put:', (e) => {
            payload = (e as CustomEvent).detail.payload;
        });

        const cb = wrapper.querySelector('input') as HTMLInputElement;
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));

        expect(payload).toEqual({ agreed: false });
    });

    it('select multiple contributes an array of selected values', () => {
        const wrapper = make(`
            <select multiple @change="put:/picks" name="picks">
                <option value="a">A</option>
                <option value="b">B</option>
                <option value="c">C</option>
            </select>
        `);
        let payload: Record<string, unknown> = {};
        wrapper.addEventListener('put:', (e) => {
            payload = (e as CustomEvent).detail.payload;
        });

        const sel = wrapper.querySelector('select') as HTMLSelectElement;
        (sel.options[0] as HTMLOptionElement).selected = true;
        (sel.options[2] as HTMLOptionElement).selected = true;
        sel.dispatchEvent(new Event('change', { bubbles: true }));

        expect(payload).toEqual({ picks: ['a', 'c'] });
    });

    it('text input contributes el.value', () => {
        const wrapper = make('<input @input="put:/message" name="message">');
        let payload: Record<string, unknown> = {};
        wrapper.addEventListener('put:', (e) => {
            payload = (e as CustomEvent).detail.payload;
        });

        const input = wrapper.querySelector('input') as HTMLInputElement;
        input.value = 'hello';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(payload).toEqual({ message: 'hello' });
    });

    it('form harvest iterates named children with element-aware extraction', () => {
        const wrapper = make(`
            <form @submit="put:/draft?prevent">
                <input name="title" value="A title">
                <input type="checkbox" name="published" checked>
                <button type="submit">Save</button>
            </form>
        `);
        let payload: Record<string, unknown> = {};
        wrapper.addEventListener('put:', (e) => {
            payload = (e as CustomEvent).detail.payload;
        });

        const form = wrapper.querySelector('form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(payload).toEqual({ title: 'A title', published: true });
    });

    it('only the checked radio in a group contributes to form payload', () => {
        const wrapper = make(`
            <form @submit="put:/choice?prevent">
                <input type="radio" name="pick" value="a">
                <input type="radio" name="pick" value="b" checked>
                <input type="radio" name="pick" value="c">
                <button type="submit">Pick</button>
            </form>
        `);
        let payload: Record<string, unknown> = {};
        wrapper.addEventListener('put:', (e) => {
            payload = (e as CustomEvent).detail.payload;
        });

        const form = wrapper.querySelector('form') as HTMLFormElement;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(payload).toEqual({ pick: 'b' });
    });
});

describe('handlePut — wrapper-scoped writes', () => {
    it('writes payload[leaf] to state.path for matching leaf-key payload', () => {
        const wrapper = make();
        wrapper.handlePut(new CustomEvent('put:', {
            detail: { path: 'message', isRel: false, payload: { message: 'hello' } },
        }));
        expect(wrapper.state.message).toBe('hello');
    });

    it('writes the whole payload when path leaf does not match a key', () => {
        const wrapper = make();
        wrapper.handlePut(new CustomEvent('put:', {
            detail: { path: 'draft', isRel: false, payload: { title: 'A', body: 'B' } },
        }));
        expect(wrapper.state.draft).toEqual({ title: 'A', body: 'B' });
    });

    it('runs end-to-end when a put: dispatch is fired on a wired element', () => {
        const wrapper = make('<input @input="put:/message" name="message">');

        const input = wrapper.querySelector('input') as HTMLInputElement;
        input.value = 'echo';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(wrapper.state.message).toBe('echo');
    });

    it('handles a button-as-action with name + value (filter-button pattern)', () => {
        const wrapper = make(`
            <button @click="put:/filter" name="filter" value="active"></button>
        `);

        wrapper.querySelector('button')!.click();

        expect(wrapper.state.filter).toBe('active');
    });
});

describe('handlePut — row-relative writes', () => {
    const buildRowedWrapper = () => {
        const wrapper = make();
        wrapper.put('todos', [
            { id: 1, task: 'Master the DOM',    done: true  },
            { id: 2, task: 'Ship data-wrapper', done: false },
        ]);
        const list = document.createElement('ul');
        list.setAttribute('*list', '/todos');
        wrapper.appendChild(list);
        return { wrapper, list };
    };

    const addRow = (list: Element, item: Record<string, unknown>) => {
        const row = document.createElement('li');
        row.setAttribute('_key', String(item.id));
        row.innerHTML = `
            <input type="checkbox" name="done"
                   @change="put:./done"
                   ${item.done ? 'checked' : ''}>
        `;
        list.appendChild(row);
        wake(row);   // wire @change after appending (no reconcile path here)
        return row;
    };

    it('writes back via identity-keyed immutable update on the parent array', () => {
        const { wrapper, list } = buildRowedWrapper();
        addRow(list, { id: 1, task: 'A', done: true  });
        const row2 = addRow(list, { id: 2, task: 'B', done: false });

        const cb = row2.querySelector('input') as HTMLInputElement;
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));

        const todos = wrapper.state.todos as Array<{ id: number; done: boolean }>;
        expect(todos.find(t => t.id === 1)?.done).toBe(true);   // unchanged
        expect(todos.find(t => t.id === 2)?.done).toBe(true);   // flipped
    });

    it('toggling a different row leaves the other row untouched', () => {
        const { wrapper, list } = buildRowedWrapper();
        const row1 = addRow(list, { id: 1, task: 'A', done: true  });
        addRow(list, { id: 2, task: 'B', done: false });

        const cb = row1.querySelector('input') as HTMLInputElement;
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));

        const todos = wrapper.state.todos as Array<{ id: number; done: boolean }>;
        expect(todos.find(t => t.id === 1)?.done).toBe(false);  // flipped
        expect(todos.find(t => t.id === 2)?.done).toBe(false);  // unchanged
    });

    it('respects ?key= override on the *list attribute', () => {
        const wrapper = make();
        wrapper.put('items', [
            { uuid: 'a-1', label: 'A', done: false },
            { uuid: 'b-2', label: 'B', done: false },
        ]);
        const list = document.createElement('ul');
        list.setAttribute('*list', '/items?key=uuid');
        wrapper.appendChild(list);

        const row = document.createElement('li');
        row.setAttribute('_key', 'b-2');
        row.innerHTML = '<input type="checkbox" @change="put:./done" name="done">';
        list.appendChild(row);
        wake(row);

        const cb = row.querySelector('input') as HTMLInputElement;
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));

        const items = wrapper.state.items as Array<{ uuid: string; done: boolean }>;
        expect(items.find(i => i.uuid === 'a-1')?.done).toBe(false);
        expect(items.find(i => i.uuid === 'b-2')?.done).toBe(true);
    });

    it('throws when a relative-path put: fires outside any *list row', () => {
        const wrapper = make();
        const detail = { path: 'done', isRel: true, payload: { done: true } };
        const event  = new CustomEvent('put:', { detail });
        const target = document.createElement('div');
        wrapper.appendChild(target);
        Object.defineProperty(event, 'target', { value: target });

        expect(() => wrapper.handlePut(event)).toThrow(/outside a \*list row/);
    });

    it('throws when a relative-path put: fires in a row not inside a *list container', () => {
        const wrapper = make();
        const stray  = document.createElement('li');
        stray.setAttribute('_key', '42');
        const div    = document.createElement('div');     // not a *list
        div.appendChild(stray);
        wrapper.appendChild(div);

        const event = new CustomEvent('put:', {
            detail: { path: 'done', isRel: true, payload: { done: true } },
        });
        Object.defineProperty(event, 'target', { value: stray });

        expect(() => wrapper.handlePut(event)).toThrow(/not inside a \*list container/);
    });
});

describe('reconcile — _key marker', () => {
    it('sets _key="<id>" on each new row matching its identity', () => {
        const container = document.createElement('ul');
        document.body.appendChild(container);
        const tpl = document.createElement('template');
        tpl.innerHTML = '<li></li>';
        const cache = new Map();

        reconcile(container, [
            { id: 1, label: 'One' },
            { id: 2, label: 'Two' },
        ], cache, tpl);

        const rows = container.querySelectorAll('li');
        expect(rows[0]?.getAttribute('_key')).toBe('1');
        expect(rows[1]?.getAttribute('_key')).toBe('2');
    });

    it('uses ?key= override for the _key value when keyProp is overridden', () => {
        const container = document.createElement('ul');
        document.body.appendChild(container);
        const tpl = document.createElement('template');
        tpl.innerHTML = '<li></li>';
        const cache = new Map();

        reconcile(container, [
            { uuid: 'a-1', label: 'A' },
            { uuid: 'b-2', label: 'B' },
        ], cache, tpl, 'uuid');

        const rows = container.querySelectorAll('li');
        expect(rows[0]?.getAttribute('_key')).toBe('a-1');
        expect(rows[1]?.getAttribute('_key')).toBe('b-2');
    });

    it('persists the _key marker across re-renders of an existing row', () => {
        const container = document.createElement('ul');
        document.body.appendChild(container);
        const tpl = document.createElement('template');
        tpl.innerHTML = '<li></li>';
        const cache = new Map();

        reconcile(container, [{ id: 7, label: 'Seven' }], cache, tpl);
        const original = container.firstElementChild;

        reconcile(container, [{ id: 7, label: 'Seven updated' }], cache, tpl);

        // Same node — reconcile reused it from cache — keeps _key.
        expect(container.firstElementChild).toBe(original);
        expect(container.firstElementChild?.getAttribute('_key')).toBe('7');
    });
});

describe('cross-wrapper put: via host', () => {
    it('dispatches on the host wrapper, writing to its state', () => {
        const other = make('', { foo: 'untouched' });
        other.id = 'other';

        const local = make('<button @click="put://other/foo" name="foo" value="updated"></button>');

        local.querySelector('button')!.click();

        expect(other.state.foo).toBe('updated');
    });
});
