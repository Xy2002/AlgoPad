# Inline Rename Design

## Goal

Replace the modal `InputDialog` used for file/folder rename with VS Code-style inline editing directly in the file explorer tree. The user triggers rename via F2 or context menu, the filename becomes an editable input in-place, and the rename commits on Enter or cancels on Escape.

## Background

Currently, renaming a file or folder in the explorer opens a modal dialog (`InputDialog` component). This works but introduces a visual context switch that breaks the file management flow. VS Code and most modern IDEs use inline editing — the name text becomes an input field in-place, which feels faster and more direct.

The rename flow today:
1. User right-clicks a file/folder in the tree
2. Context menu appears with "Rename" option
3. Clicking "Rename" opens `InputDialog` (a modal with title, input, confirm/cancel buttons)
4. User types new name, presses Enter or clicks confirm
5. `FileContextMenu` calls `renameFile(targetId, value)` or `renameFolder(targetId, value)` via the Zustand store
6. Store delegates to `fileManager.renameFile/renameFolder` for validation and update
7. On error: `alert()` fires, dialog stays open for retry

## Design

### 1. Triggers

Inline rename is triggered by:
- **F2 key** when a file/folder item is focused in the tree
- **Context menu "Rename"** option (same as today)

Double-click is explicitly excluded. `FileItem.tsx` uses `onClick` for file open (single click), and the first click of a double-click would fire `openFile`, causing a store update and tree re-render that conflicts with the inline edit initialization. Using F2 and context menu only avoids this timing issue entirely.

### 2. Editing State

The editing state lives in `FileExplorer` component state (NOT Zustand) to avoid polluting the global store with transient UI state:

```ts
const [renamingItem, setRenamingItem] = useState<{
  id: string;
  type: "file" | "folder";
  originalName: string;
} | null>(null);
```

This state flows down via props:
- `FileExplorer` -> `FileTree` -> `FileItem` / `FolderItem`

Each item component receives:
```ts
isRenaming: boolean
onStartRename: () => void
onCommitRename: (newName: string) => void
onCancelRename: () => void
```

### 3. Inline Input Component

A new `InlineRenameInput` component handles the editing UI. It replaces the filename `<span>` within `FileItem` or `FolderItem` when `isRenaming` is true.

Key behaviors:
- **Uncontrolled input with ref**: Uses a React ref to access the DOM input directly. This preserves cursor position across re-renders (the tree re-renders frequently due to Zustand store subscriptions).
- **Extension-aware selection**: For files, selects the name portion before the last dot on mount (e.g., selects "my.component" in "my.component.tsx"). For folders, selects the entire name.
- **Fixed width**: Matches the available tree column width with horizontal overflow scroll for long names.

```tsx
function InlineRenameInput({
  value,
  onCommit,
  onCancel,
  selectRange,
}: {
  value: string;
  onCommit: (newValue: string) => void;
  onCancel: () => void;
  selectRange?: { start: number; end: number };
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input && selectRange) {
      input.setSelectionRange(selectRange.start, selectRange.end);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = inputRef.current?.value.trim();
      if (trimmed) onCommit(trimmed);
      else onCancel();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = inputRef.current?.value.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      className="flex-1 text-sm bg-background border border-primary outline-none px-1 min-w-0"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      autoFocus
    />
  );
}
```

### 4. Commit Flow

When the user presses Enter or clicks away (blur):

1. Trim the input value
2. If unchanged from original name, cancel (no-op)
3. If empty, cancel
4. Validate synchronously using the same rules as `fileManager.validateFileName` (no `<>:"/\|?*` characters)
5. Check for duplicate names in the same folder (synchronous scan of current `files`/`folders` from store)
6. If validation passes, call `renameFile(id, newName)` or `renameFolder(id, newName)` from store
7. If the async store call fails (localStorage write error), show a lightweight error indicator

On validation failure:
- Show red border on the input
- Do NOT dismiss the input — let the user correct the name
- Optionally show a brief tooltip with the error message

### 5. F2 Keyboard Handling

Add a `keydown` listener to the `FileExplorer` container or the individual `FileItem`/`FolderItem` components. When F2 is pressed on a focused item, call `onStartRename()`.

The current `FileItem` renders as a `<button>`, which is naturally focusable. The F2 handler checks if the focused element corresponds to a file/folder item and initiates rename.

### 6. Context Menu Integration

In `FileContextMenu.tsx`, the "Rename" action currently opens `InputDialog`. The change:
- Instead of `setDialogState({ type: "rename", ... })`, call a new callback `onStartRename(itemId, itemType)`
- This callback sets `renamingItem` in `FileExplorer` state
- The `InputDialog` is no longer used for rename (but remains for new file, new folder, and duplicate)

### 7. Error Handling

The modal dialog naturally stays open on error. Inline editing needs a different approach:

**Synchronous validation (before commit)**:
- Invalid characters: red border + tooltip "File name contains invalid characters"
- Empty name: no action, input stays
- Duplicate name: red border + tooltip "A file with this name already exists"

**Async errors (after commit)**:
- If `renameFile`/`renameFolder` throws after the input has already dismissed, briefly highlight the item in red (flash animation) to indicate failure, then revert to the original name in the store.
- Log the error to console (existing behavior).

This avoids the need for a full toast/notification system. The visual feedback is immediate and local to the item.

### 8. Scroll Behavior

The tree is wrapped in `<ScrollArea>`. If the user scrolls while editing, the inline input scrolls naturally with the tree. No special handling needed.

After a rename that changes alphabetical sort position, the renamed item may shift in the tree. Use `scrollIntoView({ block: "nearest" })` on the item's DOM node after the store update to keep it visible.

### 9. Accessibility

- The inline input uses `role="textbox"` and `aria-label="Rename file"` when active
- Focus moves to the input when rename starts, returns to the tree item on cancel/commit
- Screen readers announce the editing state change

### 10. Mobile

No changes needed for mobile. The context menu "Rename" trigger already works via long-press on touch devices. The inline input should have a minimum height of 36px for touch targets (slightly above the current 44px recommendation but consistent with the tree's compact styling).

## Data Flow

```
User presses F2 or clicks "Rename" in context menu
  -> FileExplorer sets renamingItem state
    -> FileTree passes isRenaming=true to the target FileItem/FolderItem
      -> FileItem/FolderItem renders InlineRenameInput instead of filename span
        -> User types new name
        -> On Enter: validate synchronously, then call store.renameFile/renameFolder
          -> On success: clear renamingItem, store updates, tree re-renders with new name
          -> On failure: flash item red, revert name, clear renamingItem
        -> On Escape or blur (unchanged): clear renamingItem, revert to display mode
```

## Edge Cases

1. **Tree re-render during edit**: The input uses uncontrolled mode (`defaultValue` + ref), so React re-renders do not reset the cursor or text content. The `renamingItem` state in `FileExplorer` persists across renders because it's component state, not derived from store data.

2. **Item deleted while editing**: If another operation deletes the file/folder being renamed, `files[targetId]` or `folders[targetId]` becomes undefined. The commit handler checks for this and silently cancels.

3. **Rename to same name**: No-op. The input dismisses without calling the store.

4. **Very long filenames**: The input uses `overflow-x: auto` with the same width as the tree column. Users can scroll horizontally within the input.

5. **Unicode/CJK filenames**: The validation regex `<>:"/\|?*` allows CJK and Unicode characters. Browser input handling for CJK is well-supported. No special code needed.

6. **Extension-only files (e.g., ".gitignore")**: `name.lastIndexOf('.')` returns 0 for dotfiles. Selection range defaults to `[0, 0]` which selects nothing. Special case: if the dot is at position 0, select the entire name instead.

7. **Folder rename cascading paths**: `fileManager.renameFolder` (line 339-370) updates the folder name but does NOT cascade path updates to child files. This is a pre-existing bug. It should be fixed as part of this work since inline rename makes folder rename feel more casual and the bug will surface more often.

## Files Changed

| File | Action |
|------|--------|
| `src/components/InlineRenameInput.tsx` | Create: reusable inline rename input component |
| `src/components/FileItem.tsx` | Conditionally render `InlineRenameInput` when renaming |
| `src/components/FolderItem.tsx` | Conditionally render `InlineRenameInput` when renaming |
| `src/components/FileTree.tsx` | Thread rename props through to items |
| `src/components/FileExplorer.tsx` | Add `renamingItem` state, F2 handler, start/cancel/commit callbacks |
| `src/components/FileContextMenu.tsx` | Call `onStartRename` instead of opening `InputDialog` for rename |
| `src/services/fileManager.ts` | Fix `renameFolder` to cascade path updates to children |

## Files NOT Changed

- `src/store/usePlaygroundStore.ts` — rename logic stays the same, no new state
- `src/components/InputDialog.tsx` — still used for new file, new folder, duplicate
- `src/types/multiFile.ts` — no type changes needed
- `src/locales/*.json` — no new user-facing text strings

## Out of Scope

- Double-click to rename (conflicts with single-click file open)
- Multi-select rename (F2 with multiple files selected)
- Batch rename patterns
- Drag-and-drop during rename (prevented by input focus capture)
- Toast/notification system for async errors (using inline visual feedback instead)
