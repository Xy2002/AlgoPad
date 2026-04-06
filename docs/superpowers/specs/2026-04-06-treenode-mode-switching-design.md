# TreeNode Mode Switching Design

## Goal

Allow users to switch TreeNode between a general N-ary tree and a LeetCode-style binary tree on a per-file basis, with real-time Monaco IntelliSense type updates.

## Background

The runtime sandbox currently provides a single N-ary TreeNode class (`value` + `children[]`). Monaco type definitions match. `normalizeTree()` handles both binary (`left`/`right`) and N-ary at visualization time via duck-typing, but the editor only ever sees the N-ary type. Users practicing LeetCode binary tree problems must mentally map `left`/`right` to the N-ary API.

## Design

### 1. Data Model

`FileInfo` gains a `treeMode` field:

```ts
treeMode: "general" | "binary" // default: "general"
```

Persisted via existing Zustand/localStorage mechanism. Existing files default to `"general"` on upgrade — no migration needed.

### 2. UI — Toolbar Dropdown

A compact dropdown in the header, next to the existing language Badge. Only visible when a file is open (`openTabs.length > 0`).

Options:
- **General Tree (children)** — `treeMode: "general"`
- **Binary Tree (left/right)** — `treeMode: "binary"`

On selection: immediately update the current file's `treeMode` in the store, which triggers Monaco type refresh.

### 3. Dynamic Type Injection

Split `public/monaco-types.d.ts` into three files:

- `public/monaco-types-base.d.ts` — ListNode, expect, renderHeap, and all shared declarations (unchanged across modes)
- `public/monaco-types-general.d.ts` — General tree TreeNode:
  ```ts
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
  ```
- `public/monaco-types-binary.d.ts` — Binary tree TreeNode:
  ```ts
  declare class TreeNode {
      val: number;
      left: TreeNode | null;
      right: TreeNode | null;
      constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null);
  }
  ```

`CodeEditor.tsx` holds a ref to the current extraLib disposable. On mount and on `treeMode` change:

1. Dispose previous disposable
2. Fetch `monaco-types-base.d.ts` + the mode-specific file
3. Concatenate and call `addExtraLib()`
4. Monaco updates IntelliSense in real-time — no page refresh needed

### 4. Runtime Injection

`src/workers/data-structures.ts` exports two classes:

- `GeneralTreeNode` — current implementation (`value`, `children[]`)
- `BinaryTreeNode` — LeetCode style (`val`, `left`, `right`)

The execution worker inspects the entry file's `treeMode` from the `ExecutionRequest`. Before evaluating user code, it binds the appropriate class as `TreeNode` in the sandbox scope.

`ExecutionRequest` type extends to carry `treeMode` per file:

```ts
allFiles?: Record<string, {
    content: string;
    language: string;
    path: string;
    treeMode?: "general" | "binary";
}>;
```

### 5. Data Flow

```
User selects mode in dropdown
  → Store updates file.treeMode
    → CodeEditor reacts: dispose old extraLib, fetch + addExtraLib new one
      → Monaco IntelliSense updates immediately
    → On next Run: Home.tsx passes treeMode via allFiles
      → Worker injects correct TreeNode class into sandbox
```

## Files Changed

| File | Action |
|------|--------|
| `src/types/multiFile.ts` | Add `treeMode` to `FileInfo` |
| `src/store/usePlaygroundStore.ts` | Default `treeMode: "general"` |
| `public/monaco-types-base.d.ts` | Create (split from monaco-types.d.ts) |
| `public/monaco-types-general.d.ts` | Create (general tree TreeNode declaration) |
| `public/monaco-types-binary.d.ts` | Create (binary tree TreeNode declaration) |
| `public/monaco-types.d.ts` | Remove (replaced by three files above) |
| `src/components/CodeEditor.tsx` | Dynamic extraLib injection based on treeMode |
| `src/workers/data-structures.ts` | Add BinaryTreeNode class, rename existing to GeneralTreeNode |
| `src/workers/execution.worker.ts` (or equivalent) | Inject correct class based on treeMode |
| `src/workers/types.ts` | Extend ExecutionRequest with treeMode |
| `src/services/codeExecutionService.ts` | Pass treeMode through to worker |
| `src/pages/Home.tsx` | Pass treeMode in allFiles, add toolbar dropdown |
| `src/components/PredefinedFunctions.tsx` | Show mode-specific documentation |

## Out of Scope

- Visualization changes (normalizeTree already handles both shapes)
- Per-file mode persistence beyond localStorage (already handled by Zustand)
- Auto-detecting tree mode from code content
