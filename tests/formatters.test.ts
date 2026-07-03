// Built-in formatter contract. These tests drive real $ bindings and *list
// sources through wake(); they assert rendered output, not registry internals.
import { test, expect } from 'bun:test';
import { ComponentRuntime } from '../src/lib/component.ts';
import { rootContext, wake, type Wrapper } from '../src/lib/engine.ts';

const mount = (html: string, module: Record<string, unknown>): Wrapper => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el.innerHTML = html;
    el._component = new ComponentRuntime(el, module);
    wake(el, rootContext(el));
    return el;
};

const structuralTemplate = (
    directive: string,
    source:    string,
    child:     Element,
): HTMLTemplateElement => {
    const tpl = document.createElement('template');
    tpl.setAttribute(`*${directive}`, source);
    tpl.content.append(child);
    return tpl;
};

test('text formatters compose in query-param order', () => {
    const el = mount(`
        <output id="name" $text="name?trim&case=upper"></output>
        <output id="fallback" $text="missing?default=Unknown"></output>
        <output id="short" $text="short?truncate=5"></output>
        <output id="flag" $text="flag?bool=ready:waiting"></output>
    `, {
        name: '  ada lovelace  ',
        missing: '',
        short: 'abcdef',
        flag: true,
    });

    expect(el.querySelector('#name')?.textContent).toBe('ADA LOVELACE');
    expect(el.querySelector('#fallback')?.textContent).toBe('Unknown');
    expect(el.querySelector('#short')?.textContent).toBe('ab...');
    expect(el.querySelector('#flag')?.textContent).toBe('ready');
});

test('collection formatters count, join, unique, and sort static values', () => {
    const el = document.createElement('data-wrapper') as unknown as Wrapper;
    el._component = new ComponentRuntime(el, {
        tags: ['alpha', 'beta'],
        text: 'one two three',
        people: [
            { id: 1, name: 'Ada' },
            { id: 2, name: 'Grace' },
            { id: 1, name: 'Alan' },
        ],
    });
    el.innerHTML = `
        <output id="items" $text="tags?count"></output>
        <output id="words" $text="text?count=words"></output>
        <output id="chars" $text="text?count=chars"></output>
        <output id="joined" $text="tags?join=|"></output>
        <ul></ul>
    `;
    const li = document.createElement('li');
    li.setAttribute('$text', './name');
    el.querySelector('ul')?.append(structuralTemplate('list', 'people?unique=id&sort=-name', li));

    wake(el, rootContext(el));

    expect(el.querySelector('#items')?.textContent).toBe('2');
    expect(el.querySelector('#words')?.textContent).toBe('3');
    expect(el.querySelector('#chars')?.textContent).toBe('13');
    expect(el.querySelector('#joined')?.textContent).toBe('alpha|beta');
    expect([...el.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Grace', 'Ada']);
});

test('number formatters render stable locale output', () => {
    const el = mount(`
        <output id="number" $text="amount?number"></output>
        <output id="fixed" $text="amount?fixed=1"></output>
        <output id="percent" $text="ratio?percent=1"></output>
        <output id="currency" $text="amount?currency=EUR"></output>
    `, {
        amount: 1234.56,
        ratio: 0.125,
    });

    expect(el.querySelector('#number')?.textContent).toBe(new Intl.NumberFormat('en-US').format(1234.56));
    expect(el.querySelector('#fixed')?.textContent).toBe('1234.6');
    expect(el.querySelector('#percent')?.textContent).toBe(new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
    }).format(0.125));
    expect(el.querySelector('#currency')?.textContent).toBe(new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
    }).format(1234.56));
});

test('date and json formatters render date-like and object values', () => {
    const when = new Date(2026, 5, 30, 9, 5, 0);
    const payload = { ok: true, count: 2 };
    const el = mount(`
        <output id="date" $text="when?date"></output>
        <output id="time" $text="when?time"></output>
        <output id="datetime" $text="when?datetime"></output>
        <output id="json" $text="payload?json"></output>
    `, { when, payload });

    expect(el.querySelector('#date')?.textContent).toBe(when.toLocaleDateString('en-US'));
    expect(el.querySelector('#time')?.textContent).toBe(when.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    }));
    expect(el.querySelector('#datetime')?.textContent).toBe(when.toLocaleString('en-US'));
    expect(el.querySelector('#json')?.textContent).toBe(JSON.stringify(payload));
});

test('built-in formatters are null-safe', () => {
    const el = mount(`
        <output id="text" $text="nothing?trim&case=title"></output>
        <output id="count" $text="nothing?count"></output>
        <output id="money" $text="nothing?currency"></output>
        <output id="date" $text="nothing?date"></output>
        <output id="json" $text="nothing?json"></output>
    `, { nothing: null });

    expect(el.querySelector('#text')?.textContent).toBe('');
    expect(el.querySelector('#count')?.textContent).toBe('0');
    expect(el.querySelector('#money')?.textContent).toBe('');
    expect(el.querySelector('#date')?.textContent).toBe('');
    expect(el.querySelector('#json')?.textContent).toBe('null');
});
