export type Formatter = (v: unknown) => unknown;

export interface UpdateConfig {
    el:       Element;
    path:     string;
    prop:     string;
    pipes:    Formatter[];
    itemNode: Element | null;
    // TODO: add `mode: 'dynamic' | 'additive'` when _ token class behaviour is implemented
}

export interface Tokens {
    BIND: string; // $ — state → DOM
    ADD:  string; // _ — additive class binding (TODO: fully implement)
    EVT:  string; // @ — DOM event → action
}

export interface Config {
    TOKENS:  Tokens;
    NO_WAKE: string[];
}
