// main.js — site bootstrap.
//
// Custom directives live here, in site code — not in the framework.
// data-wrapper exposes `DW_DIRECTIVES` as an extension point; registering
// into it is the supported way to add structural behavior, and exercising it
// from here proves the directive system works for users exactly as it does
// for the built-in `list` and `if`.
//
// `*source` is a docs-site concern, not a reactivity primitive — which is
// precisely why it does not belong in the lib. It renders another element's
// markup as escaped text: the mechanism behind every "view the HTML" code
// listing. The target is snapshotted once at wake (source markup is static,
// so no subscription is kept); the framework's own `_`-prefixed markers
// (`_live`, `_debug`, …) are stripped so the listing shows authored markup,
// not wake residue.
import { DW_DIRECTIVES } from '/dist/data-wrapper.js';

const stripFramework = (el) => {
    const clone = el.cloneNode(true);
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
        for (const attr of [...node.attributes]) {
            if (attr.name[0] === '_') node.removeAttribute(attr.name);
        }
    }
    return clone.innerHTML;
};

const dedent = (htmlString) => {
    const splitter = htmlString.split('<data-wrapper ')[0];
    return htmlString.split(splitter).join('\n');
}

// *source="elementId" — find the target by id, render its inner HTML as text.
DW_DIRECTIVES.set('source', ({ el, path }) => {
    const target = document.getElementById(path);
    if (target) el.textContent = dedent(stripFramework(target)).trim();
    return () => {};
});
