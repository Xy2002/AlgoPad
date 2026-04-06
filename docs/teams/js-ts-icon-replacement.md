# JS/TS File Icon Replacement

## Overview

Replaced generic `FileCode` icons from lucide-react with distinctive text badges for JavaScript and TypeScript files.

## Changes

### New Component: `FileIcon`

Created `src/components/ui/FileIcon.tsx` — a reusable icon component that renders text-based badges instead of generic icons.

**Icon colors:**
- **JavaScript (`.js`, `.jsx`)**: Yellow badge (`#F7DF1E`) with black text
- **TypeScript (`.ts`, `.tsx`)**: Blue badge (`#3178C6`) with white text
- **JSON (`.json`)**: Settings gear icon (lucide-react)
- **Other**: Default document icon (lucide-react `FileText`)

### Modified Files

1. **`src/components/FileItem.tsx`**
   - Removed inline `getFileIcon()` function
   - Uses `<FileIcon>` component with `w-4 h-4` size

2. **`src/components/FileTab.tsx`**
   - Uses `<FileIcon>` component with `w-3.5 h-3.5` size (smaller for tabs)

## Implementation

```tsx
<FileIcon fileName={file.name} className="w-4 h-4" />
```

The component automatically detects the file extension and renders the appropriate icon.
