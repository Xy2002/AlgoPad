# Inline Expression Evaluation

## Summary

Show expression results inline in the Monaco editor as the user types. After a 500ms debounce, all expression statements are evaluated in a sandboxed Web Worker and their results are injected as light-colored text at the end of each line using Monaco's `after: InjectedTextOptions` decoration API.

## Requirements

- **Trigger**: Automatic, after 500ms of no typing activity (debounce)
- **Scope**: All expression statements (assignments, function calls, arithmetic, property access, `console.log`)
- **Context**: Full global context — code is executed from the top of the file, each expression has access to all previously defined variables
- **Display**: Result injected at end of line as `// → <value>`, rendered in light color (opacity 0.5), italic
- **Skip**: Function/class declarations, import/export, control flow (`if/for/while/switch`), empty lines, comments

## Data Model

### InlineEvalResult

```ts
interface InlineEvalResult {
  line: number       // 1-based line number
  value: string      // serialized result, e.g. "5", "[1,2,3]", "undefined"
  error?: string     // error message if evaluation failed, e.g. "ReferenceError: x is not defined"
}
```

### Worker Messages

**Request** (main → worker):
```ts
{
  type: "inline-eval",
  code: string,
  language: "javascript" | "typescript",
  executionId: string
}
```

**Response** (worker → main):
```ts
{
  type: "inline-eval-result",
  executionId: string,
  results: InlineEvalResult[]
}
```

## Expression Detection

### Line Classification

For each line of code, classify whether it should show a result:

| Line Type | Example | Show Result? |
|-----------|---------|-------------|
| Variable assignment | `let x = 1 + 2` | Yes (`// → 3`) |
| Const assignment | `const name = "test"` | Yes (`// → "test"`) |
| Function call | `fibonacci(6)` | Yes (`// → 8`) |
| Method call | `arr.push(4)` | Yes (`// → 4`) |
| Property access | `arr.length` | Yes (`// → 3`) |
| Arithmetic expression | `2 ** 10` | Yes (`// → 1024`) |
| Logical expression | `a > 3 && b < 10` | Yes (`// → true`) |
| console.log | `console.log(x)` | Yes (`// → undefined`) |
| Function declaration | `function foo() {}` | No |
| Class declaration | `class Bar {}` | No |
| Import/Export | `import ... from ...` | No |
| Control flow | `if/for/while/switch/try` | No |
| Return statement | `return x` | No |
| Empty line | | No |
| Comment | `// comment` | No |
| Block closing | `}` | No |

### Detection Strategy

Use regex-based line classification for simplicity and performance:

1. Strip comments and trim whitespace
2. Skip empty lines
3. Skip lines starting with: `function `, `class `, `import `, `export `, `if (`, `for (`, `while (`, `switch (`, `try {`, `return `, `//`, `/*`, `}`
4. Skip lines that are only a closing brace `}`
5. Remaining lines are treated as expression statements

## Evaluation Pipeline

### Step 1: Transpile (if TypeScript)

Reuse existing SWC WASM transpilation from `src/workers/swc.ts`. If SWC is not ready, fall back to regex-based transpilation.

### Step 2: Wrap each expression line

Transform the code so each expression line's result is captured. Use `__safeStringify` (already available in worker scope) for serialization instead of `String()` to handle circular references and complex objects.

**For assignment statements** (`let/const/var x = expr`), insert a capture line after the assignment that reads the variable:

```
// Original:
let a = 5
let sum = a + 10

// Transformed:
let a = 5
try { __inlineResults[1] = __safeStringify(a) } catch(__e) { __inlineResults[1] = "⚠ " + __e.message }
let sum = a + 10
try { __inlineResults[2] = __safeStringify(sum) } catch(__e) { __inlineResults[2] = "⚠ " + __e.message }
```

**For standalone expressions** (function calls, property access, arithmetic), replace the expression with an IIFE that captures the result:

```
// Original:
fibonacci(6)

// Transformed:
__inlineResults[3] = (function() { try { return __safeStringify(fibonacci(6)) } catch(__e) { return "⚠ " + __e.message } })()
```

This avoids double-evaluation — the expression runs once inside the IIFE.

### Step 3: Execute in Sandbox

Reuse the existing sandbox environment from `execution.worker.ts`. The wrapped code runs in a `new Function()` with the same whitelisted globals.

### Step 4: Collect Results

After execution, `__inlineResults` contains the serialized value (or error message) for each evaluated line. Return as `InlineEvalResult[]`.

### Step 5: Apply Decorations

On the main thread, convert results to Monaco decorations:

```ts
decorations.set(
  results.map(result => ({
    range: new monaco.Range(result.line, 1, result.line, 1),
    options: {
      isWholeLine: true,
      after: {
        content: ` // → ${result.error || result.value}`,
        inlineClassName: result.error
          ? "inline-eval-error"
          : "inline-eval-result",
        cursorStops: monaco.editor.InjectedTextCursorStops.None,
      },
    },
  }))
)
```

## UI Styling

### CSS Classes

Add to `src/index.css`:

```css
.inline-eval-result {
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
  font-size: 0.9em;
}

.inline-eval-error {
  color: rgba(239, 68, 68, 0.5);
  font-style: italic;
  font-size: 0.9em;
}
```

For light theme:
```css
.vs .inline-eval-result {
  color: rgba(0, 0, 0, 0.35);
}
.vs .inline-eval-error {
  color: rgba(220, 38, 38, 0.5);
}
```

## Component Integration

### CodeEditor.tsx Changes

1. Add a new `IEditorDecorationsCollection` ref for inline eval decorations (separate from trace highlight collection)
2. Accept a new prop `inlineEvalResults?: InlineEvalResult[]`
3. In a `useEffect`, apply decorations when `inlineEvalResults` changes

### Home.tsx Changes

1. Add state for inline eval: `inlineEvalResults`, debounce timer
2. On code change: clear existing timer, set new 500ms timer
3. Timer fires: call inline eval service
4. On service response: update `inlineEvalResults` state

### inlineEvalService.ts (New)

Main-thread service that:
1. Sends inline-eval request to existing execution worker
2. Receives results
3. Deduplicates identical results (skips update if nothing changed)

### execution.worker.ts Changes

Add a new message handler for `type: "inline-eval"`:
1. Transpile TypeScript if needed
2. Classify lines (expression vs skip)
3. Transform code to capture expression results
4. Execute in sandbox with 3s timeout
5. Return `InlineEvalResult[]`

## Edge Cases

1. **Side effects**: Expression `arr.push(4)` modifies `arr`. Since we capture the result of the expression itself (the push return value), this is fine — the side effect happens once during evaluation. Functions with side effects (like `console.log`) will execute once.

2. **TDZ / uninitialized variables**: `let x` without assignment → `// → undefined`. Accessing `x` before its line → `// → ⚠ ReferenceError: Cannot access 'x' before initialization`.

3. **Circular references**: Use existing `safeStringify` from `src/workers/serialization.ts` instead of `String()` for complex objects.

4. **Long results**: Truncate at 120 characters with `...` suffix to avoid visual clutter.

5. **Performance**: 500ms debounce + 3s execution timeout. Only evaluate when code changes, not on cursor movement. Worker is reused (no new worker creation per evaluation).

6. **Multi-file mode**: Only evaluate the currently active editor file. Other files in the virtual filesystem are available as imports but not inline-evaluated.

7. **Code changes during evaluation**: Each request has a unique `executionId`. Stale results (from old code) are discarded.

## Files Changed

| File | Change |
|------|--------|
| `src/workers/types.ts` | Add `InlineEvalResult` type |
| `src/workers/execution.worker.ts` | Add `inline-eval` message handler |
| `src/services/inlineEvalService.ts` | Create: main-thread inline eval service |
| `src/components/CodeEditor.tsx` | Add inline eval decoration rendering |
| `src/pages/Home.tsx` | Wire inline eval: debounce, state, service calls |
| `src/index.css` | Add inline eval CSS classes |

## Files NOT Changed

- `src/store/usePlaygroundStore.ts` — no persistent state needed
- `src/workers/recursive-trace.ts` — independent feature
- `src/workers/module-system.ts` — single-file only for now
- `src/locales/*.json` — no user-facing text (inline results are code, not UI labels)
