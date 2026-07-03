// Preloaded before every test (see bunfig.toml). Registers a DOM on the global
// scope so the engine runs against real `document` / `customElements`, the same
// surface a browser gives it. No per-test DOM boilerplate.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://example.test/' });
await import('../src/lib/element.ts');
