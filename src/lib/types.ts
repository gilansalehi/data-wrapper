export type Formatter = (v: unknown) => unknown;
export type Unsubscribe = () => void;
export type SubscribeMode = 'dynamic' | 'additive';
export type SyncType = 'dynamic' | 'additive';

export interface UpdateConfig {
    el: Element;
    path: string;
    prop: string;
    pipes: Formatter[];
    itemNode: Element | null;
}

export interface Tokens {
    BIND: string;
    ADD: string;
    EVT: string;
}

export interface Config {
    TOKENS: Tokens;
    NO_WAKE: string[];
}
