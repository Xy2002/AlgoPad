# TreeNode Mode Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow per-file switching between N-ary TreeNode (children) and LeetCode-style binary TreeNode (val/left/right), with real-time Monaco IntelliSense updates.

**Architecture:** Store `treeMode` per-file in FileInfo. Split the Monaco type definitions into a base + two mode-specific files. CodeEditor dynamically injects the correct extraLib based on the active file's mode. The execution worker injects the matching TreeNode class at runtime.

**Tech Stack:** React, Zustand, Monaco Editor, TypeScript, Web Workers

---

### Task 1: Add `treeMode` to FileInfo and Store

**Files:**
- Modify: `src/types/multiFile.ts:4-17`
- Modify: `src/store/usePlaygroundStore.ts`

- [ ] **Step 1: Add `treeMode` field to `FileInfo` interface**

In `src/types/multiFile.ts`, add `treeMode` to the `FileInfo` interface after line 15:

```ts
export interface FileInfo {
	id: string;
	name: string;
	path: string; // 文件完整路径
	type: "file";
	parentId: string | null; // null表示根目录
	content: string;
	language: "javascript" | "typescript";
	size: number;
	createdAt: number;
	updatedAt: number;
	isModified: boolean;
	folderId?: string | null;
	treeMode?: "general" | "binary";
}
```

- [ ] **Step 2: Add `setFileTreeMode` action to the store interface**

In `src/store/usePlaygroundStore.ts`, find the store interface (around line 106 where `updateFileContent` is defined) and add after it:

```ts
setFileTreeMode: (fileId: string, mode: "general" | "binary") => void;
```

- [ ] **Step 3: Implement `setFileTreeMode` in the store**

Find the `updateFileContent` implementation (around line 953) and add the new action after it:

```ts
setFileTreeMode: (fileId: string, mode: "general" | "binary") => {
	const { files } = get();
	const file = files[fileId];
	if (!file) return;
	set({
		files: {
			...files,
			[fileId]: { ...file, treeMode: mode, updatedAt: Date.now() },
		},
	});
},
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors related to `FileInfo` or the new store method.

- [ ] **Step 5: Commit**

```bash
git add src/types/multiFile.ts src/store/usePlaygroundStore.ts
git commit -m "feat: add treeMode field to FileInfo and store action"
```

---

### Task 2: Split Monaco Type Definitions

**Files:**
- Create: `public/monaco-types-base.d.ts`
- Create: `public/monaco-types-general.d.ts`
- Create: `public/monaco-types-binary.d.ts`
- Delete: `public/monaco-types.d.ts`

- [ ] **Step 1: Create `public/monaco-types-base.d.ts`**

This file contains everything from `public/monaco-types.d.ts` EXCEPT the TreeNode class and renderTree function (lines 46-63). Copy lines 1-44 verbatim:

```ts
declare class ListNode {
	val: number;
	next: ListNode | null;
	constructor(val?: number, next?: ListNode | null);
}

declare function arrayToListNode(arr: number[]): ListNode | null;
declare function listNodeToArray(head: ListNode | null): number[];

// Minimal Vitest / Chai types for IntelliSense
interface Assertion<T = unknown> {
	not: Assertion<T>;
	toBe(expected: T): void;
	toEqual(expected: unknown): void;
	toBeTruthy(): void;
	toBeFalsy(): void;
	toBeNull(): void;
	toBeUndefined(): void;
	toBeDefined(): void;
	toBeNaN(): void;
	toContain(item: unknown): void;
	toBeGreaterThan(number: number): void;
	toBeGreaterThanOrEqual(number: number): void;
	toBeLessThan(number: number): void;
	toBeLessThanOrEqual(number: number): void;
	toBeInstanceOf(ctor: abstract new (...args: unknown[]) => unknown): void;
	toThrow(message?: string | RegExp): void;
}

interface ExpectStatic {
	<T = unknown>(actual: T): Assertion<T>;
	extend(matchers: Record<string, unknown>): void;
	soft<T = unknown>(actual: T): Assertion<T>;
	poll<T = unknown>(actual: T): Assertion<T>;
}

declare const expect: ExpectStatic;
declare const vi: unknown;
declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;

declare function renderHeap(heap: unknown[], description: string): void;
```

- [ ] **Step 2: Create `public/monaco-types-general.d.ts`**

```ts
// General N-ary tree TreeNode
declare class TreeNode<T = unknown> {
	value: T;
	children: TreeNode<T>[];
	constructor(value?: T, children?: TreeNode<T>[]);
	addChild(child: TreeNode<T> | T): void;
	removeChild(child: TreeNode<T>): void;
	find(predicate: (value: T) => boolean): TreeNode<T> | null;
	traverse(callback: (node: TreeNode<T>) => void): void;
	toString(): string;
}

declare function renderTree(
	root: TreeNode<unknown> | unknown,
	description?: string,
	highlightedNodes?: unknown[],
): void;
```

- [ ] **Step 3: Create `public/monaco-types-binary.d.ts`**

```ts
// LeetCode-style binary tree TreeNode
declare class TreeNode {
	val: number;
	left: TreeNode | null;
	right: TreeNode | null;
	constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null);
}

declare function renderTree(
	root: TreeNode | unknown,
	description?: string,
	highlightedNodes?: unknown[],
): void;
```

- [ ] **Step 4: Delete `public/monaco-types.d.ts`**

```bash
git rm public/monaco-types.d.ts
```

- [ ] **Step 5: Commit**

```bash
git add public/monaco-types-base.d.ts public/monaco-types-general.d.ts public/monaco-types-binary.d.ts
git commit -m "refactor: split monaco type definitions into base + tree mode variants"
```

---

### Task 3: Dynamic ExtraLib Injection in CodeEditor

**Files:**
- Modify: `src/components/CodeEditor.tsx`

- [ ] **Step 1: Add `treeMode` prop to CodeEditorProps**

In `src/components/CodeEditor.tsx`, update the `CodeEditorProps` interface (around line 33-45) to add `treeMode`:

```ts
interface CodeEditorProps {
	value: string;
	onChange: (value: string | undefined) => void;
	language: "javascript" | "typescript";
	theme: "vs-dark" | "vs";
	fontSize: number;
	readOnly?: boolean;
	filePath: string;
	onMarkersChange?: (markers: monaco.editor.IMarker[]) => void;
	onEditorMounted?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
	highlightRange?: HighlightRange | null;
	inlineEvalResults?: InlineEvalResult[];
	treeMode?: "general" | "binary";
}
```

- [ ] **Step 2: Destructure `treeMode` from props**

In the component function signature (around line 47-59), add `treeMode`:

```ts
export default function CodeEditor({
	value,
	onChange,
	language,
	theme,
	fontSize,
	readOnly = false,
	filePath,
	onMarkersChange,
	onEditorMounted,
	highlightRange,
	inlineEvalResults,
	treeMode = "general",
}: CodeEditorProps) {
```

- [ ] **Step 3: Add extraLib disposable ref**

After the existing refs (around line 65-68), add:

```ts
const extraLibDisposableRef = useRef<monaco.IDisposable | null>(null);
```

Note: You'll need to import `IDisposable` — but since `monaco` is used as a type import already, use the full qualified path or just type it as `{ dispose(): void } | null`. The simplest approach is:

```ts
const extraLibDisposableRef = useRef<{ dispose(): void } | null>(null);
```

- [ ] **Step 4: Replace the static `fetch("/monaco-types.d.ts")` with a ref-based loader**

Replace the `fetch("/monaco-types.d.ts")` block in `handleEditorDidMount` (lines 516-531) with code that stores the monaco instance in a ref and triggers the initial load:

```ts
// Store monaco instance for later type definition refresh
monacoRef.current = monaco;

// Load initial type definitions based on tree mode
loadTypeDefinitions(monaco, treeMode);
```

- [ ] **Step 5: Add `loadTypeDefinitions` helper function**

Before the component function body (after the `truncate` helper or similar utility), add a standalone helper:

```ts
async function loadTypeDefinitions(
	monacoInstance: typeof import("monaco-editor"),
	mode: "general" | "binary",
	existingDisposable?: { dispose(): void } | null,
): Promise<{ dispose(): void } | null> {
	try {
		const [baseRes, modeRes] = await Promise.all([
			fetch("/monaco-types-base.d.ts"),
			fetch(`/monaco-types-${mode}.d.ts`),
		]);
		const [baseSource, modeSource] = await Promise.all([
			baseRes.text(),
			modeRes.text(),
		]);
		const sourceCode = baseSource + "\n" + modeSource;

		if (existingDisposable) {
			existingDisposable.dispose();
		}

		const tsDisposable =
			monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
				sourceCode,
				"interface.d.ts",
			);
		const jsDisposable =
			monacoInstance.languages.typescript.javascriptDefaults.addExtraLib(
				sourceCode,
				"interface.d.ts",
			);

		return {
			dispose() {
				tsDisposable.dispose();
				jsDisposable.dispose();
			},
		};
	} catch (error) {
		console.warn("Failed to load type definitions:", error);
		return null;
	}
}
```

- [ ] **Step 6: Add useEffect to react to treeMode changes**

Add a new useEffect after the existing `useEffect` blocks (e.g., after the inline eval effect around line 269):

```ts
// Refresh type definitions when treeMode changes
useEffect(() => {
	const monacoInstance = monacoRef.current;
	if (!monacoInstance) return;

	loadTypeDefinitions(
		monacoInstance,
		treeMode,
		extraLibDisposableRef.current,
	).then((disposable) => {
		extraLibDisposableRef.current = disposable;
	});
}, [treeMode]);
```

- [ ] **Step 8: Clean up extraLib disposable on unmount**

In the cleanup useEffect (around line 72-83), add disposal of the extraLib ref:

```ts
useEffect(() => {
	return () => {
		decorationCollectionRef.current?.clear();
		if (inlineEvalOverlayRef.current) {
			inlineEvalOverlayRef.current.remove();
			inlineEvalOverlayRef.current = null;
		}
		if (extraLibDisposableRef.current) {
			extraLibDisposableRef.current.dispose();
			extraLibDisposableRef.current = null;
		}
		editorRef.current = null;
		monacoRef.current = null;
		setIsEditorReady(false);
	};
}, []);
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/CodeEditor.tsx
git commit -m "feat: dynamic Monaco extraLib injection based on treeMode"
```

---

### Task 4: Add BinaryTreeNode to Data Structures

**Files:**
- Modify: `src/workers/data-structures.ts:13-63`

- [ ] **Step 1: Rename existing `TreeNode` class export to `GeneralTreeNode`**

In `src/workers/data-structures.ts`, rename the class at line 13:

```ts
export class GeneralTreeNode {
	value: unknown;
	children: GeneralTreeNode[];

	constructor(value: unknown, children: GeneralTreeNode[] = []) {
		this.value = value;
		this.children = children;
	}

	addChild(child: GeneralTreeNode | unknown) {
		this.children.push(
			child instanceof GeneralTreeNode ? child : new GeneralTreeNode(child),
		);
	}

	removeChild(child: GeneralTreeNode) {
		const index = this.children.indexOf(child);
		if (index > -1) {
			this.children.splice(index, 1);
		}
	}

	find(predicate: (value: unknown) => boolean): GeneralTreeNode | null {
		if (predicate(this.value)) return this;
		for (const child of this.children) {
			const found = child.find(predicate);
			if (found) return found;
		}
		return null;
	}

	traverse(callback: (node: GeneralTreeNode) => void) {
		callback(this);
		for (const child of this.children) {
			child.traverse(callback);
		}
	}

	toString(): string {
		const result = [String(this.value)];
		if (this.children.length > 0) {
			result.push(
				`(${this.children.map((c) => c.toString()).join(", ")})`,
			);
		}
		return result.join("");
	}

	toJSON(): {
		value: unknown;
		children: ReturnType<GeneralTreeNode["toJSON"]>[];
	} {
		return {
			value: this.value,
			children: this.children.map((c) => c.toJSON()),
		};
	}
}
```

- [ ] **Step 2: Add `BinaryTreeNode` class after `GeneralTreeNode`**

Add the following class after the `GeneralTreeNode` class (after the closing `}` of `GeneralTreeNode`):

```ts
export class BinaryTreeNode {
	val: number;
	left: BinaryTreeNode | null;
	right: BinaryTreeNode | null;

	constructor(
		val?: number,
		left?: BinaryTreeNode | null,
		right?: BinaryTreeNode | null,
	) {
		this.val = val ?? 0;
		this.left = left ?? null;
		this.right = right ?? null;
	}
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm check`

Expected: There will be compile errors in `execution.worker.ts` because it imports `TreeNode`. We'll fix those in Task 5. If the errors are only about the missing `TreeNode` import, that's expected — proceed.

- [ ] **Step 4: Commit**

```bash
git add src/workers/data-structures.ts
git commit -m "feat: add BinaryTreeNode class and rename TreeNode to GeneralTreeNode"
```

---

### Task 5: Update Worker to Inject Correct TreeNode Based on treeMode

**Files:**
- Modify: `src/workers/types.ts:90-99`
- Modify: `src/workers/execution.worker.ts`

- [ ] **Step 1: Extend `ExecutionRequest` with `treeMode`**

In `src/workers/types.ts`, update the `allFiles` type in `ExecutionRequest`:

```ts
export interface ExecutionRequest {
	code: string;
	language: "javascript" | "typescript";
	executionId: string;
	allFiles?: Record<
		string,
		{
			content: string;
			language: string;
			path: string;
			treeMode?: "general" | "binary";
		}
	>;
	entryFilePath?: string;
}
```

- [ ] **Step 2: Update imports in execution worker**

In `src/workers/execution.worker.ts`, update the import at line 6-13 to use the new names:

```ts
import {
	ListNode,
	GeneralTreeNode,
	BinaryTreeNode,
	arrayToListNode,
	listNodeToArray,
	type VisualizationEntry,
} from "./data-structures";
```

- [ ] **Step 3: Determine entry file's treeMode in the worker**

After the `isMultiFile` determination (around line 106), add code to extract the entry file's `treeMode`:

```ts
// Determine tree mode from entry file
const entryTreeMode: "general" | "binary" =
	(entryFilePath &&
		allFiles[entryFilePath]?.treeMode) ||
	(entryFilePath &&
		allFiles[entryFilePath.startsWith("/") ? entryFilePath.substring(1) : entryFilePath]?.treeMode) ||
	"general";
const TreeNode = entryTreeMode === "binary" ? BinaryTreeNode : GeneralTreeNode;
```

- [ ] **Step 4: Use the aliased `TreeNode` in all injection points**

In the multi-file mode section (around lines 186-191), the `TreeNode` variable is already used — no change needed since it's now aliased above.

In the single-file mode globals (around lines 258-261), the `TreeNode` variable is also used — no change needed since it's aliased above.

The key change is that `TreeNode` is now a local variable pointing to the correct class, rather than a direct import.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/workers/types.ts src/workers/execution.worker.ts
git commit -m "feat: worker injects correct TreeNode class based on file treeMode"
```

---

### Task 6: Pass treeMode Through codeExecutionService

**Files:**
- Modify: `src/services/codeExecutionService.ts`

- [ ] **Step 1: Update `executeCode` method signature**

In `src/services/codeExecutionService.ts`, update the `allFiles` parameter type in the `executeCode` method (around line 183-191) and the exported function (around line 376-391) to include `treeMode`:

```ts
async executeCode(
	code: string,
	language: "javascript" | "typescript",
	allFiles?: Record<
		string,
		{
			content: string;
			language: string;
			path: string;
			treeMode?: "general" | "binary";
		}
	>,
	entryFilePath?: string,
): Promise<ExecutionResult> {
```

Also update the exported convenience function at the bottom of the file:

```ts
export const executeCode = (
	code: string,
	language: "javascript" | "typescript",
	allFiles?: Record<
		string,
		{
			content: string;
			language: string;
			path: string;
			treeMode?: "general" | "binary";
		}
	>,
	entryFilePath?: string,
): Promise<ExecutionResult> => {
	return codeExecutionService.executeCode(
		code,
		language,
		allFiles,
		entryFilePath,
	);
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/codeExecutionService.ts
git commit -m "feat: pass treeMode through codeExecutionService to worker"
```

---

### Task 7: Pass treeMode from Home.tsx and Add Toolbar Dropdown

**Files:**
- Modify: `src/pages/Home.tsx:60-91` (destructure `setFileTreeMode`)
- Modify: `src/pages/Home.tsx:280-300` (allFilesInfo building)
- Modify: `src/pages/Home.tsx:644-653` (toolbar dropdown)
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`

- [ ] **Step 1: Add i18n keys for tree mode**

In `src/locales/en.json`, add a `treeMode` section after the `language` section (after line 31):

```json
"treeMode": {
	"general": "General",
	"binary": "Binary",
	"generalLabel": "General Tree",
	"binaryLabel": "Binary Tree"
},
```

In `src/locales/zh.json`, add the same section after line 31:

```json
"treeMode": {
	"general": "通用",
	"binary": "二叉",
	"generalLabel": "通用树",
	"binaryLabel": "二叉树"
},
```

- [ ] **Step 2: Destructure `setFileTreeMode` from store**

In `src/pages/Home.tsx`, in the store destructuring (around line 61-91), add `setFileTreeMode`:

```ts
const {
	// ... existing destructured values ...
	setFileTreeMode,
} = usePlaygroundStore();
```

- [ ] **Step 3: Include `treeMode` in allFilesInfo**

In the `handleRunCode` callback, update the `allFilesInfo` building loop (around lines 286-300) to include `treeMode`:

```ts
allFilesInfo[file.path] = {
	content,
	language: fileLanguage,
	path: file.path,
	treeMode: file.treeMode,
};
```

- [ ] **Step 4: Add the tree mode dropdown to the header**

In the header JSX (around line 644-653), after the language `Badge`, add a dropdown for tree mode. Use the existing shadcn Select component:

First, check if `Select` is already imported. If not, add to the imports:

```ts
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
```

Then add the dropdown after the language Badge (after line 652):

```tsx
{openTabs.length > 0 && activeFileId && (
	<Select
		value={files[activeFileId]?.treeMode || "general"}
		onValueChange={(value) => {
			if (activeFileId) {
				setFileTreeMode(activeFileId, value as "general" | "binary");
			}
		}}
	>
		<SelectTrigger className="h-6 w-auto border-0 p-0 gap-1 text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground focus:ring-0 focus:ring-offset-0">
			<TreesIcon className="w-3 h-3" />
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			<SelectItem value="general">
				{t("treeMode.generalLabel")}
			</SelectItem>
			<SelectItem value="binary">
				{t("treeMode.binaryLabel")}
			</SelectItem>
		</SelectContent>
	</Select>
)}
```

- [ ] **Step 5: Pass `treeMode` prop to CodeEditor**

In the `CodeEditor` JSX (around line 828-845), add the `treeMode` prop:

```tsx
<CodeEditor
	value={getCurrentCode()}
	onChange={handleCodeChange}
	language={getCurrentLanguage()}
	theme={settings.theme}
	fontSize={settings.fontSize}
	filePath={
		activeFileId && files[activeFileId]
			? `file:///${files[activeFileId].path.startsWith("/") ? files[activeFileId].path.substring(1) : files[activeFileId].path}`
			: `file:///main.${getCurrentLanguage() === "typescript" ? "ts" : "js"}`
	}
	onMarkersChange={handleMarkersChange}
	onEditorMounted={(editor) => {
		editorRef.current = editor;
	}}
	highlightRange={highlightRange}
	inlineEvalResults={inlineEvalResults}
	treeMode={activeFileId ? files[activeFileId]?.treeMode || "general" : "general"}
/>
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Home.tsx src/locales/en.json src/locales/zh.json
git commit -m "feat: add tree mode dropdown in toolbar and wire data flow"
```

---

### Task 8: Update PredefinedFunctions for Mode-Aware Docs

**Files:**
- Modify: `src/components/PredefinedFunctions.tsx`

- [ ] **Step 1: Import store hook**

In `src/components/PredefinedFunctions.tsx`, add the store import:

```ts
import { usePlaygroundStore } from "@/store/usePlaygroundStore";
```

- [ ] **Step 2: Read current treeMode from store**

Inside the component function, after `const { t } = useTranslation();`:

```ts
const { activeFileId, files } = usePlaygroundStore();
const currentTreeMode = activeFileId
	? files[activeFileId]?.treeMode || "general"
	: "general";
```

- [ ] **Step 3: Replace the static TreeNode entry with mode-aware entries**

Replace lines 38-44 (the TreeNode entry in the "Data Structures" category):

```ts
// For general tree mode:
{
	name: "TreeNode",
	description: t("predefined.treeNode.description"),
	signature: "class TreeNode<T> { value: T; children: TreeNode<T>[] }",
	example: `const root = new TreeNode('root');
root.addChild(new TreeNode('child'));`,
},
```

With:

```ts
currentTreeMode === "general"
	? {
			name: "TreeNode",
			description: t("predefined.treeNode.description"),
			signature:
				"class TreeNode<T> { value: T; children: TreeNode<T>[] }",
			example: `const root = new TreeNode('root');
root.addChild(new TreeNode('child'));`,
		}
	: {
			name: "TreeNode",
			description: t("predefined.treeNode.binaryDescription"),
			signature:
				"class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null }",
			example: `const root = new TreeNode(1);
root.left = new TreeNode(2);
root.right = new TreeNode(3);`,
		},
```

- [ ] **Step 4: Add i18n key for binary TreeNode description**

In `src/locales/en.json`, in the `predefined.treeNode` section, add:

```json
"binaryDescription": "LeetCode-style binary tree node with val, left, and right properties"
```

In `src/locales/zh.json`, in the same section:

```json
"binaryDescription": "LeetCode 风格二叉树节点，包含 val、left 和 right 属性"
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `pnpm check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/PredefinedFunctions.tsx src/locales/en.json src/locales/zh.json
git commit -m "feat: show mode-specific TreeNode docs in PredefinedFunctions"
```

---

### Task 9: Update Inline Eval for BinaryTreeNode

**Files:**
- Modify: `src/workers/inline-eval.ts`

- [ ] **Step 1: Update import in inline-eval**

In `src/workers/inline-eval.ts`, the file currently doesn't import from `data-structures.ts` (it creates its own sandbox via `new Function`). No change needed here — the inline eval sandbox doesn't provide TreeNode classes (they're only in the execution worker). Skip this task if the file doesn't reference TreeNode.

Check: if `inline-eval.ts` doesn't import or reference `TreeNode`, skip to Task 10.

- [ ] **Step 2: Commit (if changes were needed)**

```bash
git add src/workers/inline-eval.ts
git commit -m "feat: update inline eval for binary tree mode"
```

---

### Task 10: End-to-End Verification

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test general tree mode (default)**

1. Open or create a `.ts` file
2. Type `const root = new TreeNode('root');` — IntelliSense should show `value`, `children`, `addChild` etc.
3. Click Run — should work without errors
4. Verify the toolbar shows "General Tree" in the dropdown

- [ ] **Step 3: Test binary tree mode**

1. Switch the dropdown to "Binary Tree"
2. Type `const root = new TreeNode(1);` — IntelliSense should show `val`, `left`, `right`
3. `root.left` and `root.right` should autocomplete
4. Click Run — should work without errors

- [ ] **Step 4: Test switching back**

1. Switch dropdown back to "General Tree"
2. IntelliSense should revert to `value`, `children` style

- [ ] **Step 5: Test multi-file**

1. Create two files, set one to binary and one to general
2. Switch between tabs — IntelliSense should update per file
3. Run each file — correct TreeNode class should be injected

- [ ] **Step 6: Test persistence**

1. Set a file to binary mode
2. Refresh the page
3. The file should still be in binary mode

- [ ] **Step 7: Run full type check and lint**

Run: `pnpm check && pnpm lint`
Expected: No errors.

- [ ] **Step 8: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
