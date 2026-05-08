// Re-exports bun:test with a corrected `todo` signature.
// bun-types types todo as Test<T> (requiring a fn arg), but the runtime
// accepts a label-only call.  Fix it once here rather than suppressing
// errors across every test file.

import {
    test as _test,
    it   as _it,
    describe,
    expect,
    beforeEach,
    afterEach,
    beforeAll,
    afterAll,
    mock,
    spyOn,
} from 'bun:test';

type TodoFn = (label: string, fn?: () => void | Promise<void>) => void;
type TestFn = (label: string, fn?: () => void | Promise<void>) => void;
type WithFlexTodo<T> = TestFn & Omit<T, 'todo'> & { todo: TodoFn };

export const test = _test as unknown as WithFlexTodo<typeof _test>;
export const it   = _it   as unknown as WithFlexTodo<typeof _it>;
export { describe, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn };
