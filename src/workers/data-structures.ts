// Data structure classes and visualization helpers.

export class ListNode {
	val: number;
	next: ListNode | null;

	constructor(val?: number, next?: ListNode | null) {
		this.val = val ?? 0;
		this.next = next ?? null;
	}
}

export class TreeNode {
	value: unknown;
	children: TreeNode[];

	constructor(value: unknown, children: TreeNode[] = []) {
		this.value = value;
		this.children = children;
	}

	addChild(child: TreeNode | unknown) {
		this.children.push(
			child instanceof TreeNode ? child : new TreeNode(child),
		);
	}

	removeChild(child: TreeNode) {
		const index = this.children.indexOf(child);
		if (index > -1) {
			this.children.splice(index, 1);
		}
	}

	find(predicate: (value: unknown) => boolean): TreeNode | null {
		if (predicate(this.value)) return this;
		for (const child of this.children) {
			const found = child.find(predicate);
			if (found) return found;
		}
		return null;
	}

	traverse(callback: (node: TreeNode) => void) {
		callback(this);
		for (const child of this.children) {
			child.traverse(callback);
		}
	}

	toString(): string {
		const result = [String(this.value)];
		if (this.children.length > 0) {
			result.push(`(${this.children.map((c) => c.toString()).join(", ")})`);
		}
		return result.join("");
	}

	toJSON(): { value: unknown; children: ReturnType<TreeNode["toJSON"]>[] } {
		return {
			value: this.value,
			children: this.children.map((c) => c.toJSON()),
		};
	}
}

export function arrayToListNode(arr: number[]): ListNode | null {
	if (arr.length === 0) return null;

	const head = new ListNode(arr[0]);
	let current = head;

	for (let i = 1; i < arr.length; i++) {
		current.next = new ListNode(arr[i]);
		current = current.next;
	}

	return head;
}

export function listNodeToArray(head: ListNode | null): number[] {
	const result: number[] = [];
	let current = head;

	while (current !== null) {
		result.push(current.val);
		current = current.next;
	}

	return result;
}

// ---- Visualization helpers ----

interface NormalizedTreeNode {
	value: unknown;
	children: (NormalizedTreeNode | null)[];
	isHighlighted: boolean;
}

function normalizeTree(
	node: unknown,
	visited = new Set<unknown>(),
	highlightedSet = new Set<unknown>(),
): NormalizedTreeNode | null {
	if (!node || typeof node !== "object") return null;
	if (visited.has(node)) return null;

	visited.add(node);

	const isHighlighted = highlightedSet.has(node);
	let value = "?";
	const children: (NormalizedTreeNode | null)[] = [];

	const obj = node as Record<string, unknown>;

	if ("val" in obj) value = String(obj.val);
	else if ("value" in obj) value = String(obj.value);

	if ("left" in obj || "right" in obj) {
		const left = normalizeTree(obj.left, visited, highlightedSet);
		const right = normalizeTree(obj.right, visited, highlightedSet);

		if (left !== null || right !== null) {
			children.push(left);
			children.push(right);
		}
	} else if (obj.children && Array.isArray(obj.children)) {
		for (const child of obj.children) {
			const norm = normalizeTree(child, visited, highlightedSet);
			if (norm) children.push(norm);
		}
	}

	return { value, children, isHighlighted };
}

function detectHeapChanges(
	prev: number[] | null,
	current: number[],
): number[] | null {
	if (!prev) return null;
	const changed: number[] = [];
	const maxLength = Math.max(prev.length, current.length);

	for (let i = 0; i < maxLength; i++) {
		if (prev[i] !== current[i]) {
			changed.push(i);
		}
	}

	return changed.length > 0 ? changed : null;
}

export interface VisualizationEntry {
	type: "heap" | "tree";
	data: unknown;
	timestamp: number;
	label: string;
	changes?: { heap?: number[] };
}

export function createVisualizationHelpers(deps: {
	visualizations: VisualizationEntry[];
	consoleLog: (...args: unknown[]) => void;
	consoleError: (...args: unknown[]) => void;
}) {
	let lastHeapData: number[] | null = null;

	function renderHeap(
		heap: number[] | { heap: number[] },
		label?: string,
	) {
		try {
			let heapData: number[];
			if (Array.isArray(heap)) {
				heapData = heap;
			} else if (
				heap &&
				typeof heap === "object" &&
				"heap" in heap &&
				Array.isArray((heap as { heap: number[] }).heap)
			) {
				heapData = (heap as { heap: number[] }).heap;
			} else {
				deps.consoleError(
					"renderHeap: Argument must be an array or {heap: array} object",
				);
				return;
			}

			let changes: number[] | null = null;
			if (lastHeapData) {
				changes = detectHeapChanges(lastHeapData, heapData);
			}

			const serializedHeap = JSON.parse(JSON.stringify(heapData)) as number[];

			deps.visualizations.push({
				type: "heap",
				data: serializedHeap,
				timestamp: Date.now(),
				label: label || `Heap #${deps.visualizations.length + 1}`,
				changes: changes ? { heap: changes } : undefined,
			});

			lastHeapData = serializedHeap.slice();

			deps.consoleLog(
				`📊 Heap visualization captured: ${label || `Heap #${deps.visualizations.length}`}`,
			);
		} catch (error) {
			deps.consoleError(
				`Failed to capture heap visualization: ${(error as Error).message}`,
			);
		}
	}

	function renderTree(
		root: unknown,
		description = "",
		highlightedNodes: unknown[] = [],
	) {
		if (!root || typeof root !== "object") {
			deps.consoleError("renderTree: Argument must be an object");
			return;
		}

		const nodesToHighlight = Array.isArray(highlightedNodes)
			? highlightedNodes
			: highlightedNodes
				? [highlightedNodes]
				: [];

		const highlightedSet = new Set(nodesToHighlight);
		const normalizedData = normalizeTree(root, new Set(), highlightedSet);

		if (!normalizedData) {
			deps.consoleError("renderTree: Failed to parse tree structure");
			return;
		}

		deps.visualizations.push({
			type: "tree",
			data: normalizedData,
			timestamp: Date.now(),
			label:
				description || `Tree Visualization ${deps.visualizations.length + 1}`,
		});

		deps.consoleLog(`🌳 Tree rendered: ${description || "Tree"}`);
	}

	return { renderHeap, renderTree };
}
