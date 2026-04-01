// Object serialization with circular-reference and linked-list handling.

export function safeStringify(
	obj: unknown,
	maxDepth = 10,
	visited = new WeakSet<object>(),
): string {
	if (obj === null || obj === undefined) {
		return String(obj);
	}

	if (typeof obj !== "object") {
		return String(obj);
	}

	if (visited.has(obj as object)) {
		return "[Circular Reference]";
	}

	if (
		(obj as Record<string, unknown>).constructor &&
		(obj as Record<string, unknown>).constructor.name === "ListNode"
	) {
		return formatLinkedList(obj as ListNodeLike);
	}

	if (Array.isArray(obj)) {
		if (maxDepth <= 0) return "[Array]";
		visited.add(obj);
		const result =
			"[" +
			obj.map((item) => safeStringify(item, maxDepth - 1, visited)).join(", ") +
			"]";
		visited.delete(obj);
		return result;
	}

	if (maxDepth <= 0) return "[Object]";
	visited.add(obj as object);

	try {
		const entries = Object.entries(obj as Record<string, unknown>).map(
			([key, value]) => `"${key}": ${safeStringify(value, maxDepth - 1, visited)}`,
		);
		const result = `{${entries.join(", ")}}`;
		visited.delete(obj as object);
		return result;
	} catch (_error) {
		visited.delete(obj as object);
		return "[Object]";
	}
}

interface ListNodeLike {
	val: unknown;
	next: ListNodeLike | null;
}

export function formatLinkedList(head: ListNodeLike | null, maxNodes = 20): string {
	if (!head) return "null";

	const visited = new Set<ListNodeLike>();
	const nodes: { node: ListNodeLike; val: unknown }[] = [];
	let current: ListNodeLike | null = head;
	let cycleStart = -1;

	while (current && nodes.length < maxNodes) {
		if (visited.has(current)) {
			for (let i = 0; i < nodes.length; i++) {
				if (nodes[i].node === current) {
					cycleStart = i;
					break;
				}
			}
			break;
		}

		visited.add(current);
		nodes.push({ node: current, val: current.val });
		current = current.next;
	}

	let result = "ListNode: ";
	const values = nodes.map((item, index) => {
		let nodeStr = String(item.val);
		if (index === cycleStart && cycleStart !== -1) {
			nodeStr += " ←[cycle start]";
		}
		return nodeStr;
	});

	result += values.join(" -> ");

	if (cycleStart !== -1) {
		result += ` -> [cycles back to index ${cycleStart}]`;
	} else if (current !== null) {
		result += " -> ...";
	} else {
		result += " -> null";
	}

	return result;
}
