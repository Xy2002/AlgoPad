import { useEffect, useRef } from "react";

interface InlineRenameInputProps {
	value: string;
	onCommit: (newValue: string) => void;
	onCancel: () => void;
	selectRange?: { start: number; end: number };
}

export default function InlineRenameInput({
	value,
	onCommit,
	onCancel,
	selectRange,
}: InlineRenameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const committedRef = useRef(false);

	useEffect(() => {
		const input = inputRef.current;
		if (input && selectRange) {
			input.setSelectionRange(selectRange.start, selectRange.end);
		}
		// biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
	}, []);

	const handleCommit = (newValue: string) => {
		if (committedRef.current) return;
		committedRef.current = true;

		const trimmed = newValue.trim();
		if (trimmed && trimmed !== value) {
			onCommit(trimmed);
		} else {
			onCancel();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleCommit(inputRef.current?.value ?? "");
		} else if (e.key === "Escape") {
			e.preventDefault();
			committedRef.current = true;
			onCancel();
		}
	};

	const handleBlur = () => {
		handleCommit(inputRef.current?.value ?? "");
	};

	return (
		<input
			ref={inputRef}
			defaultValue={value}
			className="flex-1 text-sm bg-background border border-primary outline-none px-1 min-w-0 rounded-sm"
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
			// biome-ignore lint/a11y/noAutofocus: intentional — rename input must capture focus immediately
			autoFocus
		/>
	);
}

/**
 * Compute selection range for inline rename.
 * For files: select name before last dot (extension-aware).
 * For folders: select entire name.
 */
export function getRenameSelectionRange(
	name: string,
	type: "file" | "folder",
): { start: number; end: number } {
	if (type === "folder") {
		return { start: 0, end: name.length };
	}

	const lastDot = name.lastIndexOf(".");
	// Dotfiles like .gitignore — select entire name
	if (lastDot <= 0) {
		return { start: 0, end: name.length };
	}
	// Select name portion before extension
	return { start: 0, end: lastDot };
}
