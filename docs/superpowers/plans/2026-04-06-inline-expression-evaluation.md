# Inline Expression Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show expression results inline in the Monaco editor as light-colored injected text after each expression line, auto-evaluated after 500ms debounce.

**Architecture:** Reuse the existing execution worker by adding a new `inline-eval` message type. The worker classifies lines via regex, transforms code to capture each expression's result, executes in the same `new Function()` sandbox, and returns `InlineEvalResult[]`. The main thread's `CodeExecutionService` gains an `executeInlineEval()` method. `Home.tsx` debounces code changes and passes results to `CodeEditor` which renders Monaco `after: InjectedTextOptions` decorations.

**Tech Stack:** TypeScript, Monaco Editor 0.52, Web Worker, existing safeStringify

---

## File Structure

| File | Action | Responsibility |
|------|--------|-----------------|
| `src/workers/types.ts` | Modify | Add `InlineEvalResult` type |
| `src/workers/inline-eval.ts` | Create | Line classification and code transformation logic |
| `src/workers/execution.worker.ts` | Modify | Add `inline-eval` message handler |
| `src/services/codeExecutionService.ts` | Modify | Add `executeInlineEval()` method |
| `src/index.css` | Modify | Add inline eval CSS classes |
| `src/components/CodeEditor.tsx` | Modify | Add `inlineEvalResults` prop and decoration rendering |
| `src/pages/Home.tsx` | Modify | Wire debounce, state, service calls |

---

### Task 1: Add `InlineEvalResult` type

**Files:**
- Modify: `src/workers/types.ts` (after line 68, the `ExecutionResult` interface)

- [ ] **Step 1: Add the type**

Add after the `ExecutionResult` interface (after line 68):

```ts
export interface InlineEvalResult {
	line: number;
	value: string;
	error?: string;
}
```

- [ ] **Step 2: Verify type check passes**

Run: `pnpm check`
Expected: No new errors (the type is standalone, nothing references it yet).

- [ ] **Step 3: Commit**

```bash
git add src/workers/types.ts
git commit -m "feat: add InlineEvalResult type for inline expression evaluation"
```

---

### Task 2: Create line classification and code transformation module

**Files:**
- Create: `src/workers/inline-eval.ts`

This module is imported by the execution worker. It takes raw source code, classifies each line, transforms it to capture results, and provides a function to execute the transformed code.

- [ ] **Step 1: Create `src/workers/inline-eval.ts`**

```ts
import type { InlineEvalResult } from "./types";
import { safeStringify } from "./serialization";
import { transpileTypeScript } from "./swc";

type LineClass = "skip" | "assignment" | "expression";

const SKIP_PREFIXES = [
	"function ",
	"function*",
	"async function ",
	"class ",
	"import ",
	"export ",
	"if (",
	"if(",
	"for (",
	"for(",
	"while (",
	"while(",
	"switch (",
	"switch(",
	"try {",
	"try{",
	"catch (",
	"catch(",
	"finally {",
	"finally{",
	"return ",
	"return;",
	"throw ",
	"//",
	"/*",
	"*/",
	"do {",
	"do{",
	"else ",
	"else{",
	"else if",
	"@",
];

function classifyLine(trimmed: string): LineClass {
	if (!trimmed) return "skip";
	if (trimmed === "}" || trimmed === "};") return "skip";

	for (const prefix of SKIP_PREFIXES) {
		if (trimmed.startsWith(prefix)) return "skip";
	}

	// Assignment: let/const/var followed by identifier
	if (/^(?:let|const|var)\s+\w/.test(trimmed)) {
		return "assignment";
	}

	return "expression";
}

const MAX_RESULT_LENGTH = 120;

function truncate(s: string): string {
	if (s.length > MAX_RESULT_LENGTH) {
		return `${s.substring(0, MAX_RESULT_LENGTH)}...`;
	}
	return s;
}

/**
 * Extract the variable name(s) from a simple assignment line.
 * For `let x = ...` returns ["x"].
 * For destructuring, returns an empty array (capture falls back to no-op).
 */
function extractVarNames(line: string): string[] {
	const simpleMatch = /^(?:let|const|var)\s+(\w+)\s*=/.exec(line);
	if (simpleMatch) return [simpleMatch[1]];

	// Destructuring — try to extract first-level names
	const objDestructure = /^(?:let|const|var)\s+\{\s*([^}]+)\}/.exec(line);
	if (objDestructure) {
		return objDestructure[1]
			.split(",")
			.map((s) => s.trim().split(":")[0].trim())
			.filter((s) => s.length > 0);
	}

	const arrDestructure = /^(?:let|const|var)\s+\[\s*([^\]]+)\]/.exec(line);
	if (arrDestructure) {
		return arrDestructure[1]
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	return [];
}

export async function evaluateInline(
	code: string,
	language: "javascript" | "typescript",
): Promise<InlineEvalResult[]> {
	// Step 1: Transpile if TypeScript
	let jsCode = code;
	if (language === "typescript") {
		try {
			jsCode = await transpileTypeScript(code);
		} catch {
			// If transpilation fails, skip evaluation
			return [];
		}
	}

	// Step 2: Classify lines
	const lines = jsCode.split("\n");
	const classifications: LineClass[] = lines.map((line) =>
		classifyLine(line.trim()),
	);

	// Step 3: Build transformed code
	let transformed = "var __ir = {};\n";

	for (let i = 0; i < lines.length; i++) {
		const lineNum = i + 1; // 1-based
		const cls = classifications[i];
		const original = lines[i];

		if (cls === "skip") {
			transformed += `${original}\n`;
			continue;
		}

		if (cls === "assignment") {
			transformed += `${original}\n`;
			const varNames = extractVarNames(original);
			for (const v of varNames) {
				transformed += `try{__ir[${lineNum}]=(${v}!==undefined&&${v}!==null&&typeof ${v}==="object"?__safeStringify(${v}):String(${v}))}catch(__e){__ir[${lineNum}]="\\u26a0 "+__e.message}\n`;
			}
			if (varNames.length === 0) {
				// Complex destructuring we couldn't parse — skip
			}
			continue;
		}

		// expression: wrap in IIFE to capture result without double-evaluation
		transformed += `__ir[${lineNum}]=(function(){try{return(${original})===undefined?"undefined":__safeStringify(${original})}catch(__e){return"\\u26a0 "+__e.message}})()\n`;
	}

	transformed += "return __ir;\n";

	// Step 4: Execute in sandbox
	const globalsObj: Record<string, unknown> = {
		console: {
			log: () => {},
			error: () => {},
			warn: () => {},
			info: () => {},
			debug: () => {},
			trace: () => {},
			dir: () => {},
			dirxml: () => {},
			table: () => {},
			count: () => {},
			countReset: () => {},
			group: () => {},
			groupEnd: () => {},
			time: () => {},
			timeEnd: () => {},
			assert: () => {},
			clear: () => {},
		},
		__safeStringify: (obj: unknown) => truncate(safeStringify(obj)),
		Math,
		Date,
		JSON,
		Array,
		Object,
		String,
		Number,
		Boolean,
		RegExp,
		Error,
		TypeError,
		ReferenceError,
		SyntaxError,
		Map,
		Set,
		Promise,
		Symbol,
		parseInt,
		parseFloat,
		isNaN,
		isFinite,
		undefined,
		NaN,
		Infinity,
	};

	// Restricted globals
	const restricted: Record<string, undefined> = {
		fetch: undefined,
		XMLHttpRequest: undefined,
		WebSocket: undefined,
		Worker: undefined,
		localStorage: undefined,
		sessionStorage: undefined,
		location: undefined,
		document: undefined,
		window: undefined,
		global: undefined,
		globalThis: undefined,
		self: undefined,
		eval: undefined,
		Function: undefined,
	};

	const merged = { ...globalsObj, ...restricted };

	try {
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const fn = new Function(
			...Object.keys(merged),
			transformed,
		) as (...args: unknown[]) => Record<string, string>;
		const results = fn(...Object.values(merged));

		// Step 5: Convert to InlineEvalResult[]
		const evalResults: InlineEvalResult[] = [];
		for (let i = 0; i < lines.length; i++) {
			const lineNum = i + 1;
			const val = results[lineNum];
			if (val !== undefined) {
				const isErr = val.startsWith("\u26a0 ");
				evalResults.push({
					line: lineNum,
					value: isErr ? "" : val,
					error: isErr ? val.substring(2) : undefined,
				});
			}
		}

		return evalResults;
	} catch {
		return [];
	}
}
```

- [ ] **Step 2: Verify type check passes**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/workers/inline-eval.ts
git commit -m "feat: create inline evaluation line classifier and code transformer"
```

---

### Task 3: Add inline-eval message handler to execution worker

**Files:**
- Modify: `src/workers/execution.worker.ts` (lines 56-63, the `onmessage` handler entry)

- [ ] **Step 1: Add import**

At the top of `execution.worker.ts`, add after the existing imports (after line 26):

```ts
import { evaluateInline } from "./inline-eval";
```

- [ ] **Step 2: Add type routing to the message handler**

Replace lines 56-63 of `execution.worker.ts`:

```ts
workerSelf.onmessage = async (e: MessageEvent) => {
	const data = e.data;

	// Route by message type
	if (data.type === "inline-eval") {
		const { code, language, executionId } = data;
		try {
			const results = await evaluateInline(code, language);
			postMessageFn({
				type: "inline-eval-result",
				executionId,
				results,
			});
		} catch (error) {
			postMessageFn({
				type: "inline-eval-result",
				executionId,
				results: [],
			});
		}
		return;
	}

	const {
		code,
		language,
		executionId,
		allFiles: rawAllFiles,
		entryFilePath,
	} = data as ExecutionRequest;
```

This adds a type-based dispatch at the top of the handler. If `type === "inline-eval"`, it delegates to `evaluateInline()` and returns early. Normal execution requests continue unchanged.

- [ ] **Step 3: Verify type check passes**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/workers/execution.worker.ts
git commit -m "feat: add inline-eval message handler to execution worker"
```

---

### Task 4: Add `executeInlineEval()` to CodeExecutionService

**Files:**
- Modify: `src/services/codeExecutionService.ts`

This adds a new method to the existing service that sends inline-eval requests to the same worker. It uses the same Promise-based pattern as `executeCode()`.

- [ ] **Step 1: Add the import for InlineEvalResult**

At the top of `codeExecutionService.ts`, the existing import from `@/workers/types` (line 2) already re-exports everything. Add `InlineEvalResult` to the imports from `@/workers/types`:

Find the existing import line:
```ts
import type { ExecutionResult, SWCLoadProgress } from "@/workers/types";
```

Replace with:
```ts
import type {
	ExecutionResult,
	InlineEvalResult,
	SWCLoadProgress,
} from "@/workers/types";
```

- [ ] **Step 2: Add `executeInlineEval` method**

Add this method to the `CodeExecutionService` class, after the `executeCode()` method (after line 283):

```ts
	async executeInlineEval(
		code: string,
		language: "javascript" | "typescript",
	): Promise<InlineEvalResult[]> {
		if (!this.worker || this.isExecuting) {
			return [];
		}

		const executionId = `ie_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				this.worker?.removeEventListener("message", handleMessage);
				resolve([]);
			}, 3000);

			const handleMessage = (event: MessageEvent) => {
				const data = event.data;
				if (
					data.type !== "inline-eval-result" ||
					data.executionId !== executionId
				) {
					return;
				}

				clearTimeout(timeout);
				this.worker?.removeEventListener("message", handleMessage);
				resolve(data.results || []);
			};

			this.worker.addEventListener("message", handleMessage);
			this.worker.postMessage({
				type: "inline-eval",
				code,
				language,
				executionId,
			});
		});
	}
```

- [ ] **Step 3: Export the method as a convenience function**

After the existing convenience exports (after line ~351), add:

```ts
export const executeInlineEval = (
	code: string,
	language: "javascript" | "typescript",
) => codeExecutionService.executeInlineEval(code, language);
```

- [ ] **Step 4: Verify type check passes**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/codeExecutionService.ts
git commit -m "feat: add executeInlineEval method to CodeExecutionService"
```

---

### Task 5: Add CSS classes and CodeEditor decorations

**Files:**
- Modify: `src/index.css` (after line 278)
- Modify: `src/components/CodeEditor.tsx`

- [ ] **Step 1: Add CSS classes**

In `src/index.css`, after line 278 (after the closing `}` of the `*` block), add:

```css
/* Inline expression evaluation decorations */
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

.vs .inline-eval-result {
	color: rgba(0, 0, 0, 0.3);
}
.vs .inline-eval-error {
	color: rgba(220, 38, 38, 0.45);
}
```

- [ ] **Step 2: Add `inlineEvalResults` prop to CodeEditor**

In `src/components/CodeEditor.tsx`:

Add import at the top (after the existing imports):
```ts
import type { InlineEvalResult } from "@/services/codeExecutionService";
```

Add to the `CodeEditorProps` interface (after `highlightRange`):
```ts
	inlineEvalResults?: InlineEvalResult[];
```

Destructure it in the component (add after `highlightRange` in the destructuring):
```ts
	inlineEvalResults,
```

- [ ] **Step 3: Add decoration ref and effect**

Add a new ref after the existing `decorationCollectionRef` (after line 64):
```ts
const inlineEvalDecorationsRef =
	useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
```

Add a new `useEffect` after the trace range highlighting effect (after line 167):

```ts
	// Inline expression evaluation decorations
	useEffect(() => {
		const editor = editorRef.current;
		const monacoInstance = monacoRef.current;
		if (!editor || !monacoInstance || !isEditorReady) {
			return;
		}

		if (!inlineEvalDecorationsRef.current) {
			inlineEvalDecorationsRef.current =
				editor.createDecorationsCollection([]);
		}

		if (!inlineEvalResults || inlineEvalResults.length === 0) {
			inlineEvalDecorationsRef.current.clear();
			return;
		}

		inlineEvalDecorationsRef.current.set(
			inlineEvalResults.map((result) => ({
				range: new monacoInstance.Range(result.line, 1, result.line, 1),
				options: {
					isWholeLine: true,
					after: {
						content: ` // \u2192 ${result.error || result.value}`,
						inlineClassName: result.error
							? "inline-eval-error"
							: "inline-eval-result",
						cursorStops:
							monacoInstance.editor.InjectedTextCursorStops.None,
					},
				},
			})),
		);
	}, [inlineEvalResults, isEditorReady]);
```

Also add cleanup in the unmount effect (lines 67-74), clear the inline eval decorations. Add after `decorationCollectionRef.current?.clear();`:
```ts
			inlineEvalDecorationsRef.current?.clear();
```

And add cleanup in the completion provider cleanup effect (lines 104-115). After `decorationCollectionRef.current.clear();`:
```ts
			if (inlineEvalDecorationsRef.current) {
				inlineEvalDecorationsRef.current.clear();
			}
```

- [ ] **Step 4: Verify type check passes**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/components/CodeEditor.tsx
git commit -m "feat: add inline eval CSS classes and Monaco decoration rendering"
```

---

### Task 6: Wire inline eval in Home.tsx

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Add import**

Add after the existing imports (in the services import block):
```ts
import { executeInlineEval } from "@/services/codeExecutionService";
```

And add the type import:
```ts
import type { InlineEvalResult } from "@/services/codeExecutionService";
```

- [ ] **Step 2: Add state**

After the existing local state declarations (after line 120, the `swcToastIdRef`), add:

```ts
const [inlineEvalResults, setInlineEvalResults] = useState<InlineEvalResult[]>([]);
const inlineEvalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Add debounce effect**

Add a new `useEffect` that watches for code changes and triggers inline eval after 500ms debounce. Place it after the existing trace highlight sync effect (after line 196):

```ts
	// Inline expression evaluation on code change (debounced)
	useEffect(() => {
		// Clear previous timer
		if (inlineEvalTimerRef.current) {
			clearTimeout(inlineEvalTimerRef.current);
		}

		// Clear results immediately while typing
		setInlineEvalResults([]);

		const currentCode = getCurrentCode();
		const currentLang = getCurrentLanguage();

		if (!currentCode.trim()) {
			return;
		}

		inlineEvalTimerRef.current = setTimeout(async () => {
			try {
				const results = await executeInlineEval(
					currentCode,
					currentLang as "javascript" | "typescript",
				);
				setInlineEvalResults(results);
			} catch {
				setInlineEvalResults([]);
			}
		}, 500);

		return () => {
			if (inlineEvalTimerRef.current) {
				clearTimeout(inlineEvalTimerRef.current);
			}
		};
	}, [code, activeFileId, fileContents]);
```

- [ ] **Step 4: Pass `inlineEvalResults` to CodeEditor**

Find the `<CodeEditor>` component usage (around lines 778-794) and add the new prop after `highlightRange`:

```tsx
inlineEvalResults={inlineEvalResults}
```

- [ ] **Step 5: Clean up timer on unmount**

In the cleanup effect (lines 562-577), add cleanup for the inline eval timer. Find the cleanup block and add inside it:

```ts
if (inlineEvalTimerRef.current) {
	clearTimeout(inlineEvalTimerRef.current);
}
```

- [ ] **Step 6: Verify type check passes**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 7: Verify lint passes**

Run: `pnpm lint`
Expected: No new errors beyond existing warnings.

- [ ] **Step 8: Manual test**

Run: `pnpm dev`

Test with this code in the playground:

```js
let a = 5
let sum = a + 10
fibonacci(6)

function fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}
```

Expected behavior:
1. After 500ms of no typing, inline results appear:
   - Line 1: `// → 5`
   - Line 2: `// → 15`
   - Line 3: `// → 8`
   - Line 4-7: No results (function declaration)
2. Results are shown in light italic text
3. Results clear while typing, reappear after 500ms pause

- [ ] **Step 9: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: wire inline expression evaluation with debounce in Home"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|-----------------|------|
| `InlineEvalResult` type | Task 1 |
| Line classification (skip/expression/assignment) | Task 2 (`classifyLine`) |
| Code transformation with IIFE + capture | Task 2 (`evaluateInline`) |
| TS transpilation reuse | Task 2 (`transpileTypeScript`) |
| `safeStringify` for serialization | Task 2 (used in `evaluateInline`) |
| Worker inline-eval message handler | Task 3 |
| Service method `executeInlineEval()` | Task 4 |
| Monaco `after: InjectedTextOptions` decorations | Task 5 |
| CSS classes (dark + light theme) | Task 5 |
| 500ms debounce on code change | Task 6 |
| Result truncation at 120 chars | Task 2 (`truncate`) |
| Error handling (try/catch per line) | Task 2 (in IIFE wrappers) |
| Stale result discard (executionId) | Task 4 |

### Placeholder Scan

No TBD, TODO, or placeholder patterns found.

### Type Consistency

- `InlineEvalResult` defined in Task 1 (`types.ts`), imported in Task 2 (`inline-eval.ts`), Task 4 (`codeExecutionService.ts`), Task 5 (`CodeEditor.tsx`), Task 6 (`Home.tsx`) — consistent throughout.
- `evaluateInline()` returns `Promise<InlineEvalResult[]>` in Task 2, consumed by worker in Task 3, service in Task 4, and Home in Task 6.
- Monaco decoration range uses `new monacoInstance.Range(result.line, 1, result.line, 1)` with 1-based line numbers matching `InlineEvalResult.line`.
