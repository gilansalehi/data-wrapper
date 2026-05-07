// Runs before every bun test file (configured via bunfig.toml).
// happy-dom environment is already active (set in bunfig.toml);
// this file extends expect() with @testing-library/jest-dom matchers.

import '@testing-library/jest-dom';
