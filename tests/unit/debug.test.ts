import { describe, it, expect, beforeEach, afterEach, spyOn } from '@tests/helpers.ts';
import { record } from '@lib/debug.ts';

// debug.ts holds module-private state (the `history` buffer) and a window.dw
// singleton. Tests exercise the real entry points — record() in, dw.history
// out — never the private snapshot()/clean() helpers, so the suite tracks the
// contract rather than the internals.

const dw = window.dw!;
type Rec = Record<string, unknown>;

// Read the newest entry — always this test's own record(), even if a
// component upgrade elsewhere in the suite emitted into the buffer first.
const last   = () => dw.history[dw.history.length - 1];
const detail = () => last().detail as Rec;

beforeEach(() => {
    dw.clear();
    document.body.innerHTML = '';
});

describe('record() — element snapshot', () => {
    it('captures tag, id, and a stable snapshot kind', () => {
        document.body.innerHTML = '<button id="go">x</button>';
        record('evt', document.getElementById('go')!, null);

        expect(last().ctx.kind).toBe('element');
        expect(last().ctx.tag).toBe('BUTTON');
        expect(last().ctx.id).toBe('go');
        expect(last().event).toBe('evt');
        expect(typeof last().at).toBe('number');
    });

    it('id is null when the element has none', () => {
        document.body.innerHTML = '<span></span>';
        record('evt', document.querySelector('span')!, null);
        expect(last().ctx.id).toBeNull();
    });

    it('ctx.dw collects only tokenized (@/$/*) attributes', () => {
        // happy-dom's HTML parser drops *-prefixed attributes, so tokenized
        // attributes go on via setAttribute — the same convention wire.test.ts uses.
        const b = document.createElement('button');
        b.id = 'b';
        b.className = 'c';
        b.setAttribute('@click', 'act');
        b.setAttribute('$text', 'msg');
        b.setAttribute('*list', 'items');
        b.setAttribute('data-x', 'y');
        document.body.appendChild(b);
        record('evt', b, null);

        expect(last().ctx.dw).toEqual(['@click="act"', '$text="msg"', '*list="items"']);
    });

    it('ctx.dw is empty for an element with no tokenized attributes', () => {
        document.body.innerHTML = '<div class="plain"></div>';
        record('evt', document.querySelector('div')!, null);
        expect(last().ctx.dw).toEqual([]);
    });

    it('wrapper is the owning <data-wrapper> id', () => {
        document.body.innerHTML = '<data-wrapper id="w1"><button>x</button></data-wrapper>';
        record('evt', document.querySelector('button')!, null);
        expect(last().ctx.wrapper).toBe('w1');
    });

    it('wrapper is null when no <data-wrapper> owns the element', () => {
        document.body.innerHTML = '<button>x</button>';
        record('evt', document.querySelector('button')!, null);
        expect(last().ctx.wrapper).toBeNull();
    });
});

describe('record() — detail sanitization', () => {
    let ctx: Element;
    beforeEach(() => {
        document.body.innerHTML = '<button>x</button>';
        ctx = document.querySelector('button')!;
    });

    it('passes primitives through unchanged', () => {
        record('s', ctx, 'hello');   expect(last().detail).toBe('hello');
        record('n', ctx, 42);        expect(last().detail).toBe(42);
        record('b', ctx, true);      expect(last().detail).toBe(true);
        record('z', ctx, null);      expect(last().detail).toBeNull();
    });

    it('reduces a nested Element to an element snapshot', () => {
        document.body.innerHTML += '<a id="link"></a>';
        record('evt', ctx, { node: document.getElementById('link') });

        const node = detail().node as Rec;
        expect(node.kind).toBe('element');
        expect(node.tag).toBe('A');
        expect(node.id).toBe('link');
    });

    it('reduces an Event to a descriptor with type and snapshotted targets', () => {
        const ev = new Event('click');
        ctx.dispatchEvent(ev);
        Object.assign(ev, { actionTarget: ctx });
        record('evt', ctx, { originalEvent: ev });

        const e = detail().originalEvent as Rec;
        expect(e.kind).toBe('event');
        expect(e.type).toBe('click');
        expect((e.target as Rec).tag).toBe('BUTTON');
        expect((e.action as Rec).tag).toBe('BUTTON');
    });

    it('reduces a File to a descriptor without its bytes', () => {
        const file = new File(['content'], 'notes.txt', { type: 'text/plain' });
        record('evt', ctx, { upload: file });

        expect(detail().upload).toEqual({
            kind: 'file', name: 'notes.txt', size: 7, type: 'text/plain',
        });
    });

    it('reduces a Blob to a descriptor', () => {
        record('evt', ctx, { blob: new Blob(['xyz'], { type: 'text/plain' }) });
        expect(detail().blob).toEqual({ kind: 'blob', size: 3, type: 'text/plain' });
    });

    it('depth-caps a deeply nested payload', () => {
        record('evt', ctx, { a: { b: { c: { d: { e: 'deep' } } } } });

        const a = detail().a as Rec, b = a.b as Rec, c = b.c as Rec;
        expect(c.d).toBe('[…]');
    });
});

describe('record() — retention guarantee', () => {
    it('stores a plain snapshot, never a live Element', () => {
        document.body.innerHTML = '<button>x</button>';
        record('evt', document.querySelector('button')!, null);
        expect(last().ctx instanceof Element).toBe(false);
    });

    it('stores descriptors, never a live Event or File', () => {
        document.body.innerHTML = '<button>x</button>';
        const ctx = document.querySelector('button')!;
        const ev   = new Event('click');
        const file = new File(['x'], 'f.txt');
        record('evt', ctx, { originalEvent: ev, upload: file });

        expect(detail().originalEvent instanceof Event).toBe(false);
        expect(detail().upload instanceof File).toBe(false);
    });

    it('snapshot is frozen at record time — later DOM mutation cannot reach it', () => {
        document.body.innerHTML = '<button id="before">x</button>';
        const ctx = document.getElementById('before')!;
        record('evt', ctx, null);

        ctx.id = 'after';
        ctx.remove();

        expect(last().ctx.id).toBe('before');
    });
});

describe('history buffer mechanics', () => {
    it('caps at 1000 entries, evicting the oldest', () => {
        document.body.innerHTML = '<button>x</button>';
        const ctx = document.querySelector('button')!;
        for (let i = 0; i <= 1000; i++) record('evt', ctx, { i });

        expect(dw.history).toHaveLength(1000);
        expect((dw.history[0].detail as Rec).i).toBe(1);
        expect((dw.history[999].detail as Rec).i).toBe(1000);
    });

    it('clear() empties the buffer', () => {
        document.body.innerHTML = '<button>x</button>';
        record('evt', document.querySelector('button')!, null);
        expect(dw.history).toHaveLength(1);

        dw.clear();
        expect(dw.history).toHaveLength(0);
    });

    it('the history getter returns a copy — mutating it cannot grow the buffer', () => {
        document.body.innerHTML = '<button>x</button>';
        record('evt', document.querySelector('button')!, null);

        dw.history.push({} as never);
        expect(dw.history).toHaveLength(1);
    });
});

describe('record() — console gating', () => {
    let log: ReturnType<typeof spyOn>;
    beforeEach(() => { log = spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { log.mockRestore(); });

    // Built detached: never connected, so no component upgrade / connectedCallback
    // lifecycle emits — record()'s own log is the only call under test.
    const wrappedButton = (debug: boolean): Element => {
        const w = document.createElement('data-wrapper');
        w.id = 'w';
        if (debug) w.setAttribute('_debug', '');
        const btn = document.createElement('button');
        w.appendChild(btn);
        return btn;
    };

    it('stays silent when no [_debug] ancestor is present', () => {
        record('evt', wrappedButton(false), null);
        expect(log).not.toHaveBeenCalled();
    });

    it('logs once, prefixed with the wrapper id, under a [_debug] ancestor', () => {
        record('evt', wrappedButton(true), null);

        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0][0]).toBe('[dw:w]');
        expect(log.mock.calls[0][1]).toBe('evt');
    });

    it('still records to history when not logging', () => {
        document.body.innerHTML = '<button>x</button>';
        record('evt', document.querySelector('button')!, null);

        expect(log).not.toHaveBeenCalled();
        expect(dw.history).toHaveLength(1);
    });
});

describe('toJSON() — serializable projection', () => {
    it('projects each wrapper as id, state, channels and debug flag', () => {
        document.body.innerHTML = '<data-wrapper id="w1"></data-wrapper>';
        const w = document.querySelector('data-wrapper') as unknown as Rec;
        w.state = { count: 3 };
        w._subs = { count: [], name: [] };
        (w as unknown as Element).setAttribute('_debug', '');

        const json = dw.toJSON() as Rec;
        expect(json.version).toBe(dw.version);
        expect(json.wrappers).toEqual([
            { id: 'w1', state: { count: 3 }, channels: ['count', 'name'], debug: true },
        ]);
    });

    it('history tail is capped at 20 entries of {event, wrapper}', () => {
        document.body.innerHTML = '<data-wrapper id="w"><button>x</button></data-wrapper>';
        // toJSON() also walks every wrapper; stub the upgraded-component shape
        // so the un-upgraded test element doesn't trip its _subs lookup.
        (document.querySelector('data-wrapper') as unknown as Rec)._subs = {};
        const btn = document.querySelector('button')!;
        for (let i = 0; i < 25; i++) record(`e${i}`, btn, null);

        const json = dw.toJSON() as Rec;
        const tail = json.history as Rec[];
        expect(tail).toHaveLength(20);
        expect(tail[0]).toEqual({ event: 'e5', wrapper: 'w' });
        expect(tail[19]).toEqual({ event: 'e24', wrapper: 'w' });
    });
});
