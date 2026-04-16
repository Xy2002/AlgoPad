# Flexible Panel Layout Design

## Summary

Make the bottom panel tabs draggable (reorderable) and detachable into floating in-page windows. All tabs (Output, Tests, Problems, Predefined Functions, Trace, Debugger) support both behaviors. Layout state persists to localStorage.

## User Requirements

1. **Drag to reorder**: Drag any tab to change its position in the tab bar
2. **Drag to detach**: Drag a tab outward (past ~40px threshold) to create a floating window
3. **Drag back to dock**: Drag a floating window back to the tab bar area to re-dock it
4. **Multiple floating windows**: Several tabs can be floating simultaneously
5. **Layout persistence**: Tab order and floating window positions/sizes saved to localStorage

## Technical Approach

- **`@dnd-kit/core` + `@dnd-kit/sortable`**: Tab reorder and detach detection
- **`react-rnd`**: Floating window drag and resize
- **Zustand + localStorage**: Layout state persistence

## Architecture

### State

Add to `usePlaygroundStore`:

```ts
panelLayout: {
  tabOrder: string[],          // ordered tab IDs, default: ["output", "tests", "problems", "predefined", "trace", "debugger"]
  floatingPanels: Array<{
    tabId: string,             // which tab is floating
    x: number,                 // window left position (px)
    y: number,                 // window top position (px)
    width: number,             // window width (px, min 300)
    height: number,            // window height (px, min 200)
    zIndex: number,            // stacking order
  }>
}
```

Active tab selection remains as `activeOutputTab: string`.

### Component Structure

```
Home.tsx
├── <PanelLayoutManager>           ← new: orchestrates tabs + floating windows
│   ├── <DraggableTabBar>          ← replaces hardcoded Radix TabsTrigger list
│   │   └── <SortableTab> × N      ← each tab wrapped in @dnd-kit useSortable
│   ├── <TabContent>               ← renders the active non-floating tab's content
│   └── <FloatingPanelLayer>       ← portal overlay for all floating windows
│       └── <FloatingPanel> × N    ← react-rnd wrapper per floating tab
│           └── <TabContent>       ← same content component, rendered in floating context
```

### Tab Bar: Drag Reorder

1. `SortableContext` wraps the tab bar with `panelLayout.tabOrder` (excluding floating tabs)
2. Each `SortableTab` uses `useSortable` hook — listeners attached to the tab element itself (no separate drag handle)
3. `onDragEnd` callback: if the tab was only reordered within the bar, update `tabOrder` in store
4. Drag animation via `CSS.Transform.toString(transform)` + `transition` on the sortable item

### Tab Bar: Drag to Detach

1. `onDragStart`: record starting position
2. `onDragOver` / `onDragEnd`: check if the drag delta exceeds the detach threshold (40px upward or outward from tab bar bounds)
3. If detached:
   - Remove tab from `tabOrder`
   - Add entry to `floatingPanels` at the mouse position with default size (e.g., 500×400)
   - If this was the active tab, switch active to the first remaining tab

### Floating Window

1. `react-rnd` component with:
   - Title bar showing tab label + close button (X)
   - Close button = remove from `floatingPanels`, re-insert into `tabOrder` at original position
   - `minWidth: 300, minHeight: 200`
   - `bounds: "parent"` to keep within the page (or viewport)
2. `onDragStop` / `onResizeStop`: persist position/size to store
3. z-index management: clicking a floating window brings it to front (max z-index + 1)
4. Double-click title bar: re-dock the tab (same as close button)

### Drag Back to Dock

1. Each floating window has `@dnd-kit` drag sensor on its title bar
2. `onDragOver`: detect if the floating window is being dragged over the tab bar area
3. If over tab bar (within a 60px drop zone):
   - Show a visual indicator in the tab bar (insertion line between tabs)
   - `onDragEnd`: if dropped on tab bar, remove from `floatingPanels`, insert into `tabOrder` at the drop position

### Content Rendering

Each tab's content component is the same regardless of docked/floating state:

| Tab ID | Content Component |
|--------|-------------------|
| output | OutputDisplay |
| tests | TestVisualization |
| problems | ProblemsPanel |
| predefined | PredefinedFunctions |
| trace | RecursiveTraceVisualization |
| debugger | DebuggerPanel |

A `renderTabContent(tabId: string)` function returns the correct component. Called from both `<TabContent>` (docked) and `<FloatingPanel>` (floating).

### Visibility Rules

Tabs that are currently floating are **hidden** from the tab bar. The tab bar only shows `tabOrder` entries minus `floatingPanels` entries.

Conditional tabs (tests, trace, debugger) still follow their existing visibility rules — they are hidden from both tab bar AND floating when their condition is false. If a tab was floating and its condition becomes false (e.g., debug session ends), the floating window auto-closes and the tab returns to `tabOrder`.

### Persistence

- Store `panelLayout` in Zustand (already persisted to localStorage via existing mechanism)
- On page load: restore `tabOrder` and `floatingPanels`
- Validate on restore: remove any tabs from `floatingPanels` that shouldn't exist (e.g., `debugger` when not debugging)
- Default values: standard tab order, no floating panels

## Key Files to Modify

| File | Change |
|------|--------|
| `src/pages/Home.tsx` | Replace hardcoded tab bar with `PanelLayoutManager` |
| `src/components/PanelLayoutManager.tsx` | **NEW**: orchestrates tab bar + floating windows |
| `src/components/DraggableTabBar.tsx` | **NEW**: sortable tab bar using @dnd-kit |
| `src/components/FloatingPanel.tsx` | **NEW**: react-rnd based floating window |
| `src/store/usePlaygroundStore.ts` | Add `panelLayout` state + actions |

## Dependencies to Add

```json
{
  "@dnd-kit/core": "^6.x",
  "@dnd-kit/sortable": "^8.x",
  "@dnd-kit/utilities": "^3.x",
  "react-rnd": "^10.x"
}
```

## Edge Cases

- **All tabs floated**: Tab bar becomes empty; show a subtle hint ("Drag a panel back or click here to reset layout")
- **Resize to very small**: Clamp floating window to minWidth/minHeight
- **Tab condition becomes false while floating**: Auto-close floating window, return tab to docked state
- **Browser resize**: Floating windows clamped to viewport bounds
- **Reset layout**: Add a "Reset Layout" option in the tab bar context menu or settings
