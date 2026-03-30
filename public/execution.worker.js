let swcInitialized = false;
let swcInitializing = false;
const _swcModule = null;
let swcInitStartTime = null;

// Initialize SWC WebAssembly module from CDN
async function initSWC() {
	if (swcInitialized) {
		console.log("SWC已初始化，跳过重复初始化");
		return;
	}

	if (swcInitializing) {
		console.log("SWC正在初始化中，等待完成...");
		// 等待当前初始化完成
		while (swcInitializing && !swcInitialized) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return;
	}

	swcInitializing = true;
	swcInitStartTime = performance.now();

	try {
		console.log("🚀 开始从CDN初始化SWC WebAssembly模块...");

		const swcUrl = "https://unpkg.com/@swc/wasm-web@1.3.95/wasm-web.js";
		const wasmUrl =
			"https://cdn.jsdelivr.net/npm/@swc/wasm-web@1.3.95/wasm-web_bg.wasm";

		// Step 1: Import SWC JS module (small file)
		console.log("📦 正在加载SWC JS模块:", swcUrl);

		self.postMessage({
			type: "swc_init_step",
			step: 1,
			totalSteps: 2,
			stepLabel: "Loading SWC",
		});

		const { default: init, transformSync } = await import(swcUrl);
		console.log("✅ SWC JS模块加载成功");

		// Load Chai for assertions
		try {
			importScripts(
				"https://cdnjs.cloudflare.com/ajax/libs/chai/4.3.7/chai.min.js",
			);
			console.log("✅ Chai断言库加载成功");
		} catch (e) {
			console.error("❌ Chai加载失败，将使用内置回退实现:", e);
		}

		// Step 2: Download WASM binary with progress tracking
		self.postMessage({
			type: "swc_init_step",
			step: 2,
			totalSteps: 2,
			stepLabel: "Downloading WASM",
		});

		console.log("📦 正在下载WASM二进制文件:", wasmUrl);

		const wasmResponse = await fetch(wasmUrl);
		if (!wasmResponse.ok) {
			throw new Error(`Failed to fetch WASM: HTTP ${wasmResponse.status}`);
		}

		let loadedBytes = 0;
		const chunks = [];

		if (wasmResponse.body) {
			const reader = wasmResponse.body.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				loadedBytes += value.length;

				self.postMessage({
					type: "swc_init_progress",
					step: 2,
					totalSteps: 2,
					loaded: loadedBytes,
					total: null,
					percent: null,
				});
			}
		} else {
			// Fallback: no streaming support
			const buffer = await wasmResponse.arrayBuffer();
			loadedBytes = buffer.byteLength;
			chunks.push(new Uint8Array(buffer));
			self.postMessage({
				type: "swc_init_progress",
				step: 2,
				totalSteps: 2,
				loaded: loadedBytes,
				total: null,
				percent: null,
			});
		}

		console.log(
			"✅ WASM下载完成，大小:",
			(loadedBytes / 1024).toFixed(1),
			"KB",
		);

		// Combine chunks into a single ArrayBuffer and pass to init()
		const wasmBytes = new Uint8Array(loadedBytes);
		let offset = 0;
		for (const chunk of chunks) {
			wasmBytes.set(chunk, offset);
			offset += chunk.length;
		}

		console.log("🔧 开始初始化WebAssembly...");
		await init(wasmBytes.buffer);

		self.swcTransform = transformSync;
		swcInitialized = true;
		swcInitializing = false;

		const initTime = performance.now() - swcInitStartTime;
		console.log("🎉 SWC初始化完成！耗时:", initTime.toFixed(2), "ms");

		// 发送初始化完成事件到主线程
		self.postMessage({
			type: "swc_init_complete",
			success: true,
			initTime: Math.round(initTime * 100) / 100,
		});
	} catch (error) {
		swcInitializing = false;
		const initTime = swcInitStartTime
			? performance.now() - swcInitStartTime
			: 0;
		console.error(
			"❌ SWC初始化失败，回退到简单转译. 耗时:",
			initTime.toFixed(2),
			"ms",
			error,
		);
		swcInitialized = false;
		self.swcTransform = null;

		// 发送初始化失败事件到主线程
		self.postMessage({
			type: "swc_init_complete",
			success: false,
			error: error.message,
			initTime: Math.round(initTime * 100) / 100,
		});
	}
}

// Fast TypeScript transpilation using SWC
async function transpileTypeScript(tsCode) {
	console.log("开始TypeScript转译，代码长度:", tsCode.length);
	const startTime = performance.now();

	try {
		// Ensure SWC is initialized
		if (!swcInitialized) {
			console.log("SWC未初始化，尝试初始化...");
			await initSWC();
		}

		if (!swcInitialized || !self.swcTransform) {
			console.warn("SWC未初始化，回退到简单转译");
			return fallbackTranspile(tsCode);
		}

		// Use SWC to transpile TypeScript
		try {
			const result = self.swcTransform(tsCode, {
				jsc: {
					parser: {
						syntax: "typescript",
						tsx: false,
						decorators: false,
						dynamicImport: true,
					},
					target: "es2020",
					loose: false,
					externalHelpers: false,
					keepClassNames: false,
					preserveAllComments: false,
				},
				module: {
					type: "es6",
				},
				minify: false,
				isModule: true,
			});

			const transpileTime = performance.now() - startTime;
			console.log("SWC转译完成，耗时:", transpileTime.toFixed(2), "ms");

			return result.code;
		} catch (swcError) {
			console.error("SWC转译出错，详细信息:", swcError);
			console.error("SWC错误消息:", swcError?.message);
			console.error("SWC错误堆栈:", swcError?.stack);
			console.warn("回退到简单转译");
			return fallbackTranspile(tsCode);
		}
	} catch (error) {
		const errorTime = performance.now() - startTime;
		console.error("TypeScript转译异常，耗时:", errorTime.toFixed(2), "ms");
		console.error("异常详情:", error);
		console.error("异常消息:", error?.message);
		return fallbackTranspile(tsCode);
	}
}

// Fallback simple transpilation
function fallbackTranspile(tsCode) {
	console.log("使用回退转译方案");
	const startTime = performance.now();

	try {
		// 简单的类型移除，只处理最常见的情况
		const jsCode = tsCode
			// 移除 type 定义: type Foo = ...
			.replace(/type\s+\w+\s*=\s*[^;]+;/g, "")
			// 移除 interface 定义: interface Foo { ... }
			.replace(/interface\s+\w+[\s\S]*?\{[\s\S]*?\}/g, "")
			// 移除 enum 定义: enum Foo { ... }
			.replace(/enum\s+\w+[\s\S]*?\{[\s\S]*?\}/g, "")
			// 移除访问修饰符: public, private, protected, readonly
			.replace(/\b(public|private|protected|readonly)\s+/g, "")
			// 移除变量类型注解: let x: number = 1 -> let x = 1
			.replace(/:\s*[\w<>,[\]|&\s]+(?=\s*[=;)])/g, "")
			// 移除函数返回类型: function foo(): Type -> function foo()
			.replace(/\):\s*[\w<>,[\]|&\s]+\s*\{/g, ") {")
			// 移除as断言: x as Type -> x  (支持复杂类型)
			.replace(/\s+as\s+[\w<>,[\]|&\s]+/g, "")
			// 移除 ! 非空断言: x! -> x
			.replace(/(\w+)!/g, "$1")
			// 清理空行
			.replace(/\n\s*\n/g, "\n")
			.trim();

		const transpileTime = performance.now() - startTime;
		console.log("回退转译完成，耗时:", transpileTime.toFixed(2), "ms");
		console.log("转译后代码前100字符:", jsCode.substring(0, 100));

		return jsCode;
	} catch (error) {
		console.error("回退转译也失败:", error?.message);
		return tsCode; // 返回原始代码
	}
}

// Web Worker for safe code execution
self.onmessage = async (e) => {
	const {
		code,
		language,
		executionId,
		allFiles: rawAllFiles,
		entryFilePath,
	} = e.data;

	try {
		console.log("Worker接收到代码:", {
			language: language,
			codeLength: code?.length,
			codeStart: code?.substring(0, 100),
			hasInvalidChars: /[\u0080-\uFFFF]/.test(code || ""),
		});

		// Normalize allFiles keys to ensure path consistency
		let allFiles = rawAllFiles;
		if (rawAllFiles) {
			allFiles = {};
			for (const [filePath, fileInfo] of Object.entries(rawAllFiles)) {
				// Remove leading slash to normalize paths
				const normalizedPath = filePath.startsWith("/")
					? filePath.substring(1)
					: filePath;
				allFiles[normalizedPath] = fileInfo;
			}
		}

		// 根据语言类型处理代码
		let executableCode = code;
		const codeProcessStart = performance.now();

		// 创建一个安全的执行环境
		const logs = [];
		const errors = [];
		const visualizations = [];

		// Track previous data for change detection
		let lastHeapData = null;
		const _lastTreeData = null;

		// Detect heap changes
		function detectHeapChanges(prev, current) {
			const changed = [];
			const maxLength = Math.max(prev ? prev.length : 0, current.length);

			for (let i = 0; i < maxLength; i++) {
				if (prev?.[i] !== current[i]) {
					changed.push(i);
				}
			}

			return changed.length > 0 ? changed : null;
		}

		// renderHeap函数 - 用于可视化堆结构
		function renderHeap(heap, label) {
			try {
				// Support both array format and object format {heap: [...]}
				let heapData;
				if (Array.isArray(heap)) {
					heapData = heap;
				} else if (
					heap &&
					typeof heap === "object" &&
					"heap" in heap &&
					Array.isArray(heap.heap)
				) {
					heapData = heap.heap;
				} else {
					console.error(
						"renderHeap: Argument must be an array or {heap: array} object",
					);
					return;
				}

				// Detect changes
				let changes = null;
				if (lastHeapData) {
					changes = detectHeapChanges(lastHeapData, heapData);
				}

				// Serialize data to capture snapshot at this point in time
				const serializedHeap = JSON.parse(JSON.stringify(heapData));

				// Add to visualizations array
				visualizations.push({
					type: "heap",
					data: serializedHeap,
					timestamp: Date.now(),
					label: label || `Heap #${visualizations.length + 1}`,
					changes: changes ? { heap: changes } : undefined,
				});

				// Update last heap data
				lastHeapData = serializedHeap.slice();

				console.log(
					"📊 Heap visualization captured: " +
						(label || `Heap #${visualizations.length}`),
				);
			} catch (error) {
				console.error("Failed to capture heap visualization:", error.message);
			}
		}

		// 增强的对象序列化函数，支持环形链表
		function safeStringify(obj, maxDepth = 10, visited = new WeakSet()) {
			if (obj === null || obj === undefined) {
				return String(obj);
			}

			if (typeof obj !== "object") {
				return String(obj);
			}

			// 检测循环引用
			if (visited.has(obj)) {
				return "[Circular Reference]";
			}

			// 特殊处理链表节点
			if (obj.constructor && obj.constructor.name === "ListNode") {
				return formatLinkedList(obj);
			}

			// 处理数组
			if (Array.isArray(obj)) {
				if (maxDepth <= 0) return "[Array]";
				visited.add(obj);
				const result =
					"[" +
					obj
						.map((item) => safeStringify(item, maxDepth - 1, visited))
						.join(", ") +
					"]";
				visited.delete(obj);
				return result;
			}

			// 处理普通对象
			if (maxDepth <= 0) return "[Object]";
			visited.add(obj);

			try {
				const entries = Object.entries(obj).map(([key, value]) => {
					return `"${key}": ${safeStringify(value, maxDepth - 1, visited)}`;
				});
				const result = `{${entries.join(", ")}}`;
				visited.delete(obj);
				return result;
			} catch (_error) {
				visited.delete(obj);
				return "[Object]";
			}
		}

		// 格式化链表的函数
		function formatLinkedList(head, maxNodes = 20) {
			if (!head) return "null";

			const visited = new Set();
			const nodes = [];
			let current = head;
			let cycleStart = -1;

			// 遍历链表，检测环
			while (current && nodes.length < maxNodes) {
				if (visited.has(current)) {
					// 找到环的起始位置
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

			// 构建显示字符串
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

		// 重写console方法来捕获输出，限制输出数量防止阻塞
		const mockConsole = {
			log: (...args) => {
				// 限制日志数量，防止死循环中过多输出导致卡顿
				if (logs.length < 1000) {
					const message = args
						.map((arg) =>
							typeof arg === "object" ? safeStringify(arg) : String(arg),
						)
						.join(" ");
					logs.push(message);

					// 每100条输出打印一次调试信息，并发送进度到主线程
					if (logs.length % 100 === 0) {
						console.log(
							"Worker: 已收集",
							logs.length,
							"条日志, 最新:",
							message,
						);
						// 发送进度消息到主线程
						self.postMessage({
							type: "progress",
							logsCount: logs.length,
							errorsCount: errors.length,
							executionId,
						});
					}
				} else if (logs.length === 1000) {
					logs.push("... (输出过多，已截断剩余日志以防止卡顿)");
					console.log("Worker: 日志已达到1000条上限，主动发送结果");
					// 达到1000条时主动发送结果，中断执行
					self.postMessage({
						success: false,
						logs: [...logs],
						errors: [...errors, "⏱️ 输出过多，已自动终止执行"],
						executionTime: performance.now() - startTime,
						executionId,
					});
					// 标记执行已完成，防止超时处理器重复发送
					executionCompleted = true;
					clearTimeout(executionTimeout);
					// 抛出异常强制停止死循环执行
					throw new Error("输出过多，已自动终止执行");
				}
			},
			error: (...args) => {
				if (errors.length < 100) {
					const message = args
						.map((arg) =>
							typeof arg === "object" ? safeStringify(arg) : String(arg),
						)
						.join(" ");
					errors.push(message);
				} else if (errors.length === 100) {
					errors.push("... (错误过多，已截断剩余错误信息)");
				}
			},
			warn: (...args) => {
				if (logs.length < 1000) {
					const message =
						"⚠️ " +
						args
							.map((arg) =>
								typeof arg === "object" ? safeStringify(arg) : String(arg),
							)
							.join(" ");
					logs.push(message);
				}
			},
			info: (...args) => {
				if (logs.length < 1000) {
					const message =
						"ℹ️ " +
						args
							.map((arg) =>
								typeof arg === "object" ? safeStringify(arg) : String(arg),
							)
							.join(" ");
					logs.push(message);
				}
			},
		};

		// ListNode 定义和工具函数
		class ListNode {
			constructor(val, next) {
				this.val = val === undefined ? 0 : val;
				this.next = next === undefined ? null : next;
			}
		}

		function arrayToListNode(arr) {
			if (arr.length === 0) return null;

			const head = new ListNode(arr[0]);
			let current = head;

			for (let i = 1; i < arr.length; i++) {
				current.next = new ListNode(arr[i]);
				current = current.next;
			}

			return head;
		}

		function listNodeToArray(head) {
			const result = [];
			let current = head;

			while (current !== null) {
				result.push(current.val);
				current = current.next;
			}

			return result;
		}

		// TreeNode class for general tree data structure
		class TreeNode {
			constructor(value, children = []) {
				this.value = value;
				this.children = children;
			}

			addChild(child) {
				if (child instanceof TreeNode) {
					this.children.push(child);
				} else {
					this.children.push(new TreeNode(child));
				}
			}

			removeChild(child) {
				const index = this.children.indexOf(child);
				if (index > -1) {
					this.children.splice(index, 1);
				}
			}

			find(predicate) {
				if (predicate(this.value)) {
					return this;
				}
				for (const child of this.children) {
					const found = child.find(predicate);
					if (found) return found;
				}
				return null;
			}

			traverse(callback) {
				callback(this);
				for (const child of this.children) {
					child.traverse(callback);
				}
			}

			toString() {
				const result = [String(this.value)];
				if (this.children.length > 0) {
					result.push(`(${this.children.map((c) => c.toString()).join(", ")})`);
				}
				return result.join("");
			}

			// Helper method to convert to plain object for serialization
			toJSON() {
				return {
					value: this.value,
					children: this.children.map((c) => c.toJSON()),
				};
			}
		}

		// normalizeTree helper to convert various tree structures to a standard format
		function normalizeTree(
			node,
			visited = new Set(),
			highlightedSet = new Set(),
		) {
			if (!node || typeof node !== "object") return null;
			if (visited.has(node)) return null; // Avoid cycles

			visited.add(node);

			const isHighlighted = highlightedSet.has(node);
			let value = "?";
			const children = [];

			// Try to detect value
			if ("val" in node) value = node.val;
			else if ("value" in node) value = node.value;

			// Re-logic for binary tree specific:
			if ("left" in node || "right" in node) {
				// If strictly binary tree structure is detected, we prioritize it over generic children
				const left = normalizeTree(node.left, visited, highlightedSet);
				const right = normalizeTree(node.right, visited, highlightedSet);

				// Only push children if at least one exists (non-leaf)
				// Preserving nulls ensures proper layout (left vs right)
				if (left !== null || right !== null) {
					children.push(left);
					children.push(right);
				}
			} else if (node.children && Array.isArray(node.children)) {
				// Handle generic children array (e.g. standard TreeNode)
				for (const child of node.children) {
					const norm = normalizeTree(child, visited, highlightedSet);
					if (norm) children.push(norm);
				}
			}

			return {
				value,
				children,
				isHighlighted,
			};
		}

		// renderTree function to add tree to visualizations
		function renderTree(root, description = "", highlightedNodes = []) {
			if (!root || typeof root !== "object") {
				console.error("renderTree: Argument must be an object");
				return;
			}

			// Ensure highlightedNodes is an array to avoid "object is not iterable" error
			const nodesToHighlight = Array.isArray(highlightedNodes)
				? highlightedNodes
				: highlightedNodes
					? [highlightedNodes]
					: [];

			const highlightedSet = new Set(nodesToHighlight);
			const normalizedData = normalizeTree(root, new Set(), highlightedSet);

			if (!normalizedData) {
				console.error("renderTree: Failed to parse tree structure");
				return;
			}

			visualizations.push({
				type: "tree",
				data: normalizedData,
				timestamp: Date.now(),
				label: description || `Tree Visualization ${visualizations.length + 1}`,
			});

			console.log(`🌳 Tree rendered: ${description || "Tree"}`);
		}

		// Chai Integration and Vitest Runtime Mocks
		const chai = self.chai;
		let expectImplementation;

		if (chai) {
			// Wrap Chai with Jest/Vitest compatible API using assert interface for reliability
			expectImplementation = (received) => {
				const assert = chai.assert;

				const matchers = (isNot = false) => {
					return {
						toBe: (expected) => {
							if (isNot) {
								assert.notStrictEqual(received, expected);
							} else {
								assert.strictEqual(received, expected);
							}
						},
						toEqual: (expected) => {
							if (isNot) assert.notDeepEqual(received, expected);
							else assert.deepEqual(received, expected);
						},
						toBeTruthy: () => {
							// isNotOk checks for falsy, isOk checks for truthy
							if (isNot) assert.isNotOk(received);
							else assert.isOk(received);
						},
						toBeFalsy: () => {
							if (isNot) assert.isOk(received);
							else assert.isNotOk(received);
						},
						toBeNull: () => {
							if (isNot) assert.notInstanceOf(received, Error);
							else assert.isNull(received);
						},
						toBeUndefined: () => {
							if (isNot) assert.isDefined(received);
							else assert.isUndefined(received);
						},
						toBeDefined: () => {
							if (isNot) assert.isUndefined(received);
							else assert.isDefined(received);
						},
						toBeNaN: () => {
							if (isNot) assert.notIsNaN(received);
							else assert.isNaN(received);
						},
						toContain: (item) => {
							if (isNot) assert.notInclude(received, item);
							else assert.include(received, item);
						},
						toBeGreaterThan: (number) => {
							if (isNot) assert.isAtMost(received, number);
							else assert.isAbove(received, number);
						},
						toBeGreaterThanOrEqual: (number) => {
							if (isNot) assert.isBelow(received, number);
							else assert.isAtLeast(received, number);
						},
						toBeLessThan: (number) => {
							if (isNot) assert.isAtLeast(received, number);
							else assert.isBelow(received, number);
						},
						toBeLessThanOrEqual: (number) => {
							if (isNot) assert.isAbove(received, number);
							else assert.isAtMost(received, number);
						},
						toBeInstanceOf: (ctor) => {
							if (isNot) assert.notInstanceOf(received, ctor);
							else assert.instanceOf(received, ctor);
						},
						toThrow: (message) => {
							if (isNot) {
								assert.doesNotThrow(received, message);
							} else {
								assert.throws(received, message);
							}
						},
					};
				};

				const baseMatchers = matchers(false);
				return {
					...baseMatchers,
					not: matchers(true),
				};
			};
		} else {
			// Fallback manual implementation if Chai fails to load
			expectImplementation = (received) => {
				const matchers = (isNot = false) => ({
					toBe: (expected) => {
						const pass = Object.is(received, expected);
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be ${safeStringify(expected)}, but it was`
									: `Expected ${safeStringify(expected)}, but received ${safeStringify(received)}`,
							);
						}
						return true;
					},
					toEqual: (expected) => {
						const isDeepEqual = (a, b) => {
							if (a === b) return true;
							if (
								typeof a !== "object" ||
								a === null ||
								typeof b !== "object" ||
								b === null
							)
								return false;

							const keysA = Object.keys(a);
							const keysB = Object.keys(b);

							if (keysA.length !== keysB.length) return false;

							for (const key of keysA) {
								if (!keysB.includes(key) || !isDeepEqual(a[key], b[key]))
									return false;
							}

							return true;
						};

						const pass = isDeepEqual(received, expected);
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT equal ${safeStringify(expected)}`
									: `Expected deep equality to ${safeStringify(expected)}, but received ${safeStringify(received)}`,
							);
						}
						return true;
					},
					toBeTruthy: () => {
						const pass = !!received;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be truthy, but it was ${safeStringify(received)}`
									: `Expected value to be truthy, but received ${safeStringify(received)}`,
							);
						}
						return true;
					},
					toBeFalsy: () => {
						const pass = !received;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be falsy, but it was ${safeStringify(received)}`
									: `Expected value to be falsy, but received ${safeStringify(received)}`,
							);
						}
						return true;
					},
					toBeNull: () => {
						const pass = received === null;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be null`
									: `Expected value to be null, but received ${safeStringify(received)}`,
							);
						}
						return true;
					},
					toBeUndefined: () => {
						const pass = received === undefined;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be undefined`
									: `Expected value to be undefined, but received ${safeStringify(received)}`,
							);
						}
						return true;
					},
					toBeDefined: () => {
						const pass = received !== undefined;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be defined`
									: `Expected value to be defined, but received undefined`,
							);
						}
						return true;
					},
					toContain: (item) => {
						let pass = false;
						if (Array.isArray(received)) {
							pass = received.includes(item);
						} else if (typeof received === "string") {
							pass = received.includes(item);
						} else {
							throw new Error(
								`Received value must be an array or string to use toContain()`,
							);
						}

						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected collection to NOT contain ${safeStringify(item)}`
									: `Expected collection to contain ${safeStringify(item)}, but it was not found`,
							);
						}
						return true;
					},
					toBeGreaterThan: (expected) => {
						const pass = received > expected;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected ${received} to NOT be greater than ${expected}`
									: `Expected ${received} to be greater than ${expected}`,
							);
						}
						return true;
					},
					toBeLessThan: (expected) => {
						const pass = received < expected;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected ${received} to NOT be less than ${expected}`
									: `Expected ${received} to be less than ${expected}`,
							);
						}
						return true;
					},
					toBeInstanceOf: (ctor) => {
						const pass = received instanceof ctor;
						const result = isNot ? !pass : pass;
						if (!result) {
							throw new Error(
								isNot
									? `Expected value to NOT be instance of ${safeStringify(ctor)}`
									: `Expected value to be instance of ${safeStringify(ctor)}`,
							);
						}
						return true;
					},
				});

				const baseMatchers = matchers(false);
				return {
					...baseMatchers,
					not: matchers(true),
				};
			};
		}

		const expect = expectImplementation;

		// Basic mock implementation for vi (Vitest utils)
		const vi = {
			fn: (impl) => {
				const mock = (...args) => {
					mock.calls.push(args);
					return impl ? impl(...args) : undefined;
				};
				mock.calls = [];
				mock.mockReturnValue = (val) => {
					impl = () => val;
					return mock;
				};
				return mock;
			},
			spyOn: (obj, method) => {
				const original = obj[method];
				const mock = vi.fn(original);
				obj[method] = mock;
				return mock;
			},
			// Add more vi utils as needed
		};

		// Test runner - collect test results
		const testResults = {
			suites: [],
			currentSuite: null,
			suiteStartTime: null,
			testStartTime: null,
		};

		const describe = (name, fn) => {
			const suiteStartTime = performance.now();
			const suite = {
				name,
				tests: [],
				status: "passed",
				duration: 0,
			};
			testResults.currentSuite = suite;
			testResults.suiteStartTime = suiteStartTime;

			console.log(`\n📝 Suite: ${name}`);

			try {
				fn();
			} catch (e) {
				suite.status = "failed";
				console.error(`❌ Suite failed: ${e.message}`);
			}

			suite.duration = Math.round(performance.now() - suiteStartTime);
			testResults.suites.push(suite);
			testResults.currentSuite = null;
		};

		const test = (name, fn) => {
			const testStartTime = performance.now();
			let testStatus = "passed";
			let testError = null;

			try {
				fn();
			} catch (e) {
				testStatus = "failed";
				testError = e.message;
				console.error(`  ❌ ${name}: ${e.message}`);
			}

			const testDuration = Math.round(performance.now() - testStartTime);

			// Add to current suite if exists
			if (testResults.currentSuite) {
				testResults.currentSuite.tests.push({
					name,
					status: testStatus,
					error: testError,
					duration: testDuration,
				});

				// Update suite status if any test failed
				if (testStatus === "failed") {
					testResults.currentSuite.status = "failed";
				}
			}

			// Also log to console for backward compatibility
			if (testStatus === "passed") {
				console.log(`  ✅ ${name}`);
			}
		};

		const it = test; // Alias

		// ===== 递归函数追踪系统 =====
		const MAX_TRACE_STEPS = 10000;
		const __traceContext = {
			steps: [],
			state: { depth: 0, startTime: 0 },
			maxSteps: MAX_TRACE_STEPS,
		};

		function __traceArgs(args) {
			const result = [];
			for (let i = 0; i < args.length; i++) {
				try {
					result.push(safeStringify(args[i]));
				} catch (_e) {
					result.push("[Error serializing]");
				}
			}
			return result;
		}

		// Call-site tracing helper: wraps a function call with enter/exit recording
		function __traceCall(line, startCol, endCol, funcName, args, callFn) {
			if (__traceContext.steps.length < __traceContext.maxSteps) {
				__traceContext.steps.push({
					stepIndex: __traceContext.steps.length,
					functionName: funcName,
					action: "enter",
					args: __traceArgs(args),
					depth: __traceContext.state.depth,
					line: line,
					startCol: startCol,
					endCol: endCol,
					timestamp: performance.now() - __traceContext.state.startTime,
				});
			}
			__traceContext.state.depth++;
			var __traceResult;
			try {
				__traceResult = callFn();
			} finally {
				__traceContext.state.depth--;
				if (__traceContext.steps.length < __traceContext.maxSteps) {
					__traceContext.steps.push({
						stepIndex: __traceContext.steps.length,
						functionName: funcName,
						action: "exit",
						args: __traceArgs(args),
						returnValue: safeStringify(__traceResult),
						depth: __traceContext.state.depth,
						line: line,
						startCol: startCol,
						endCol: endCol,
						timestamp: performance.now() - __traceContext.state.startTime,
					});
				}
			}
			return __traceResult;
		}

		// 检测递归函数声明（function name(...) { ... }）
		function detectRecursiveFunctions(code) {
			const recursiveFunctions = [];
			const funcRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g;

			let match = funcRegex.exec(code);
			while (match !== null) {
				const funcName = match[1];
				const funcStart = match.index;
				const funcDeclLine = code.substring(0, funcStart).split("\n").length;

				// 找到函数体（bodyStart 已跳过开头的 {，所以从 1 开始计数）
				let braceCount = 1;
				const bodyStart = funcStart + match[0].length;
				let bodyEnd = bodyStart;
				for (let i = bodyStart; i < code.length; i++) {
					if (code[i] === "{") braceCount++;
					else if (code[i] === "}") {
						braceCount--;
						if (braceCount === 0) {
							bodyEnd = i;
							break;
						}
					}
				}

				const body = code.substring(bodyStart, bodyEnd);
				// 检查函数体内是否调用了自身
				const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, "g");
				const calls = body.match(callRegex);

				if (calls && calls.length > 0) {
					recursiveFunctions.push({
						name: funcName,
						startLine: funcDeclLine,
						funcDeclStart: funcStart,
						funcNameStart: funcStart + match[0].indexOf(funcName),
						funcNameEnd:
							funcStart + match[0].indexOf(funcName) + funcName.length,
						bodyStart,
						bodyEnd,
					});
				}
				match = funcRegex.exec(code);
			}

			return recursiveFunctions;
		}

		// 对检测到的递归函数进行调用点插桩（call-site instrumentation）
		function instrumentRecursiveFunctions(code) {
			const recursiveFuncs = detectRecursiveFunctions(code);
			if (recursiveFuncs.length === 0) return { code, hasRecursion: false };

			// Pre-compute call site line/col info on the ORIGINAL code (before any modifications)
			const precomputedCalls = {};
			for (const func of recursiveFuncs) {
				const callRegex = new RegExp(`\\b${func.name}\\s*\\(`, "g");
				const calls = [];
				let match;
				// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
				while ((match = callRegex.exec(code)) !== null) {
					const nameStart = match.index;
					const parenStart = code.indexOf("(", nameStart + func.name.length);
					if (parenStart === -1) continue;

					// Skip the function declaration itself (e.g. "function fibonacci(")
					const before = code
						.substring(Math.max(0, nameStart - 10), nameStart)
						.trim();
					if (before.endsWith("function")) continue;

					// Compute line/col on original code
					const beforeCall = code.substring(0, nameStart);
					const line = beforeCall.split("\n").length;
					const lastNewline = beforeCall.lastIndexOf("\n");
					const startCol = nameStart - lastNewline;

					// Find matching close paren
					let depth = 0;
					let endPos = parenStart;
					for (let j = parenStart; j < code.length; j++) {
						if (code[j] === "(") depth++;
						else if (code[j] === ")") {
							depth--;
							if (depth === 0) {
								endPos = j + 1;
								break;
							}
						}
					}
					const endCol = endPos - lastNewline;
					const argsStr = code.substring(parenStart + 1, endPos - 1);

					calls.push({ line, startCol, endCol, argsStr });
				}
				precomputedCalls[func.name] = calls;
			}

			let result = code;

			// Phase 1: 从后向前重命名原函数 + 插入别名绑定
			for (let i = recursiveFuncs.length - 1; i >= 0; i--) {
				const func = recursiveFuncs[i];
				const originalName = func.name;
				const backupName = `__orig_${originalName}`;

				// 重命名原函数: function fibonacci -> function __orig_fibonacci
				result =
					result.substring(0, func.funcNameStart) +
					backupName +
					result.substring(func.funcNameEnd);

				// 在函数声明前插入别名绑定
				const aliasCode = `var ${originalName} = function() { return ${backupName}.apply(this, arguments); };\n`;
				result =
					result.substring(0, func.funcDeclStart) +
					aliasCode +
					result.substring(func.funcDeclStart);
			}

			// Phase 2: 找到并替换所有调用点（从后向前避免位置偏移）
			for (let i = 0; i < recursiveFuncs.length; i++) {
				const func = recursiveFuncs[i];
				const originalName = func.name;
				const backupName = `__orig_${originalName}`;
				const precomputed = precomputedCalls[originalName];

				// 在当前 result 中找到所有 originalName( 调用点
				const callRegex = new RegExp(`\\b${originalName}\\s*\\(`, "g");
				const callSites = [];
				let callMatch;
				let callIndex = 0;
				// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
				while ((callMatch = callRegex.exec(result)) !== null) {
					const pos = callMatch.index;
					const nameStart = pos;
					const parenStart = result.indexOf("(", pos + originalName.length);

					if (parenStart === -1) continue;

					// 找到匹配的闭括号（处理嵌套括号）
					let depth = 0;
					let endPos = parenStart;
					for (let j = parenStart; j < result.length; j++) {
						if (result[j] === "(") depth++;
						else if (result[j] === ")") {
							depth--;
							if (depth === 0) {
								endPos = j + 1;
								break;
							}
						}
					}

					// 提取参数部分
					const argsStr = result.substring(parenStart + 1, endPos - 1);

					// Use pre-computed line/col from original code
					const lineInfo = precomputed[callIndex] || {
						line: 0,
						startCol: 0,
						endCol: 0,
					};

					callSites.push({
						nameStart,
						parenStart,
						endPos,
						line: lineInfo.line,
						startCol: lineInfo.startCol,
						endCol: lineInfo.endCol,
						argsStr,
					});
					callIndex++;
				}

				// 从后向前替换调用点
				for (let j = callSites.length - 1; j >= 0; j--) {
					const site = callSites[j];
					const replacement = `(function(__tc_a){return __traceCall(${site.line},${site.startCol},${site.endCol},"${originalName}",__tc_a,function(){return ${backupName}.apply(null,__tc_a)})})([${site.argsStr}])`;
					result =
						result.substring(0, site.nameStart) +
						replacement +
						result.substring(site.endPos);
				}
			}

			return { code: result, hasRecursion: true };
		}

		// 创建受限的全局环境
		const safeGlobals = {
			console: mockConsole,
			renderHeap,
			renderTree,
			__traceContext,
			__safeStringify: safeStringify,
			__traceArgs,
			__traceCall,
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
			ListNode,
			TreeNode,
			arrayToListNode,
			listNodeToArray,
			setTimeout: (fn, delay) => {
				if (delay > 5000) {
					throw new Error("Timeout cannot exceed 5 seconds");
				}
				return setTimeout(fn, delay);
			},
			setInterval: (fn, delay) => {
				if (delay < 100) {
					throw new Error("Interval cannot be less than 100ms");
				}
				return setInterval(fn, delay);
			},
			clearTimeout,
			clearInterval,
			expect,
			vi,
			describe,
			test,
			it,
		};

		// Module system implementation (now after all variables are defined)
		const moduleCache = {};
		const transpiledModules = {};

		// Normalize path: remove leading slash to ensure consistency
		function normalizePath(path) {
			return path.startsWith("/") ? path.substring(1) : path;
		}

		// Resolve relative path
		function resolvePath(from, to) {
			// Normalize both paths first
			from = normalizePath(from);
			to = normalizePath(to);

			// Handle relative imports
			if (to.startsWith("./") || to.startsWith("../")) {
				// Get directory of the 'from' file
				const fromParts = from.split("/").slice(0, -1);
				const toParts = to.split("/");

				for (const part of toParts) {
					if (part === ".") {
						continue;
					}
					if (part === "..") {
						fromParts.pop();
					} else {
						fromParts.push(part);
					}
				}

				const resolved = fromParts.join("/");

				// Try with different extensions if no extension provided
				if (!resolved.match(/\.(ts|js|tsx|jsx)$/)) {
					// Try .ts, .js, .tsx, .jsx
					const extensions = [".ts", ".js", ".tsx", ".jsx"];
					for (const ext of extensions) {
						const pathWithExt = resolved + ext;
						if (allFiles && allFiles[pathWithExt]) {
							return pathWithExt;
						}
					}
					// If still not found, try with /index
					for (const ext of extensions) {
						const indexPath = `${resolved}/index${ext}`;
						if (allFiles && allFiles[indexPath]) {
							return indexPath;
						}
					}
				}

				return resolved;
			}

			// Handle absolute imports (already normalized, no leading /)
			// These are paths like "workspace/example.ts" or bare module names
			const resolved = to;

			// Try with different extensions if no extension provided
			if (!resolved.match(/\.(ts|js|tsx|jsx)$/)) {
				const extensions = [".ts", ".js", ".tsx", ".jsx"];
				for (const ext of extensions) {
					const pathWithExt = resolved + ext;
					if (allFiles && allFiles[pathWithExt]) {
						return pathWithExt;
					}
				}
			}

			return resolved;
		}

		let hasRecursion = false;

		// Transpile all files if multi-file mode
		if (allFiles) {
			console.log(
				"Multi-file mode detected, transpiling",
				Object.keys(allFiles).length,
				"files",
			);

			for (const [filePath, fileInfo] of Object.entries(allFiles)) {
				const fileContent = fileInfo.content;
				const fileLanguage = fileInfo.language;

				// Normalize file path to ensure consistency
				const normalizedPath = normalizePath(filePath);

				console.log(
					"Transpiling file:",
					normalizedPath,
					"language:",
					fileLanguage,
				);

				let transpiledContent = fileContent;

				// Transpile TypeScript files
				if (fileLanguage === "typescript") {
					transpiledContent = await transpileTypeScript(fileContent);
				}

				// Instrument recursive functions BEFORE wrapping (so line numbers are correct)
				try {
					const { code: instrumented, hasRecursion: found } =
						instrumentRecursiveFunctions(transpiledContent);
					if (found) hasRecursion = true;
					transpiledContent = instrumented;
				} catch (instrError) {
					console.error("递归插桩失败，使用原始代码:", instrError.message);
				}

				// Wrap the code in a module function
				// Replace import/export with custom module system
				transpiledContent = wrapInModuleFunction(
					transpiledContent,
					normalizedPath,
				);

				transpiledModules[normalizedPath] = transpiledContent;

				console.log("Transpiled file:", normalizedPath);
			}

			console.log("All files transpiled");
		}

		// Wrap code in a module function
		function wrapInModuleFunction(code, _filePath) {
			// Transform ES6 imports/exports to require/exports calls
			let transformedCode = code;

			// ===== IMPORT TRANSFORMATIONS =====

			// Transform: import { x, y } from './module'
			// To: const { x, y } = __require('./module')
			transformedCode = transformedCode.replace(
				/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
				"const {$1} = __require('$2')",
			);

			// Transform: import x from './module'
			// To: const x = __require('./module').default || __require('./module')
			transformedCode = transformedCode.replace(
				/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
				"const $1 = __require('$2').default || __require('$2')",
			);

			// Transform: import * as x from './module'
			// To: const x = __require('./module')
			transformedCode = transformedCode.replace(
				/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
				"const $1 = __require('$2')",
			);

			// ===== EXPORT TRANSFORMATIONS =====

			// Transform: export default xxx
			// To: exports.default = xxx
			transformedCode = transformedCode.replace(
				/export\s+default\s+/g,
				"exports.default = ",
			);

			// Transform: export function foo() {} or export async function foo() {}
			// To: exports.foo = foo; function foo() {} (utilizing hoisting)
			transformedCode = transformedCode.replace(
				/export\s+(async\s+)?function\s+(\w+)/g,
				"exports.$2 = $2; $1function $2",
			);

			// Transform: export class Foo {}
			// To: const Foo = exports.Foo = class Foo {} (classes aren't hoisted, needs const)
			transformedCode = transformedCode.replace(
				/export\s+class\s+(\w+)/g,
				"const $1 = exports.$1 = class $1",
			);

			// Transform: export const foo = value; or export let foo = value;
			// To: const foo = value; exports.foo = foo;
			transformedCode = transformedCode.replace(
				/export\s+(const|let|var)\s+(\w+)\s*=\s*([^;]+);/g,
				"$1 $2 = $3; exports.$2 = $2;",
			);

			// Transform: export const foo; (declaration without initialization)
			// To: const foo; exports.foo = foo;
			transformedCode = transformedCode.replace(
				/export\s+(const|let|var)\s+(\w+);/g,
				"$1 $2; exports.$2 = $2;",
			);

			// Transform: export { x, y, z } or export { x as X }
			// To: Object.assign(exports, { x, y, z })
			transformedCode = transformedCode.replace(
				/export\s*\{([^}]+)\}/g,
				(_, exports_str) => {
					// Parse the export list and handle 'as' aliases
					const items = exports_str.split(",").map((item) => {
						const trimmed = item.trim();
						const parts = trimmed.split(/\s+as\s+/);
						if (parts.length === 2) {
							// Has alias: x as Y -> Y: x
							return `${parts[1].trim()}: ${parts[0].trim()}`;
						}
						// No alias: x -> x
						return trimmed;
					});
					return `Object.assign(exports, { ${items.join(", ")} })`;
				},
			);

			// Wrap in module function that provides exports, __require, and trace context
			return `(function(exports, __require, __currentFilePath, __traceContext, __safeStringify, __traceArgs, __traceCall) {
${transformedCode}
return exports;
})`;
		}

		// Module loader (require implementation)
		function createRequire(currentFilePath) {
			return function __require(modulePath) {
				const resolvedPath = resolvePath(currentFilePath, modulePath);

				console.log("Requiring module:", modulePath, "from:", currentFilePath);
				console.log("Resolved path:", resolvedPath);

				// Check cache
				if (moduleCache[resolvedPath]) {
					console.log("Returning cached module:", resolvedPath);
					return moduleCache[resolvedPath];
				}

				// Check if module exists
				if (!transpiledModules[resolvedPath]) {
					const errorMsg = `Cannot find module '${modulePath}' (resolved as '${resolvedPath}') from '${currentFilePath}'`;
					console.error(errorMsg);
					console.error(
						"Available modules:",
						Object.keys(transpiledModules).join(", "),
					);
					throw new Error(errorMsg);
				}

				// Load module
				const moduleFunction = transpiledModules[resolvedPath];
				const exports = {};

				console.log("Executing module:", resolvedPath);

				try {
					// Execute module function with proper context
					const moduleRequire = createRequire(resolvedPath);
					const executedModule = executeModuleCode(
						moduleFunction,
						exports,
						moduleRequire,
						resolvedPath,
					);

					// Cache the exports
					moduleCache[resolvedPath] = executedModule || exports;

					console.log("Module loaded successfully:", resolvedPath);

					return moduleCache[resolvedPath];
				} catch (error) {
					console.error("Error loading module:", resolvedPath, error);
					throw error;
				}
			};
		}

		// Execute module code
		function executeModuleCode(
			moduleFunction,
			exports,
			requireFn,
			currentPath,
		) {
			try {
				// Create a function from the module code string
				const func = new Function(
					"exports",
					"__require",
					"__currentFilePath",
					"console",
					"renderHeap",
					"renderTree",
					"Math",
					"Date",
					"JSON",
					"Array",
					"Object",
					"String",
					"Number",
					"Boolean",
					"RegExp",
					"Error",
					"TypeError",
					"ReferenceError",
					"SyntaxError",
					"ListNode",
					"TreeNode",
					"arrayToListNode",
					"listNodeToArray",
					"expect",
					"vi",
					"describe",
					"test",
					"it",
					"setTimeout",
					"setInterval",
					"clearTimeout",
					"clearInterval",
					"__traceContext",
					"__safeStringify",
					"__traceArgs",
					"__traceCall",
					`return ${moduleFunction}`,
				);

				// Execute the function to get the actual module function
				const actualModuleFunction = func(
					exports,
					requireFn,
					currentPath,
					mockConsole,
					renderHeap,
					renderTree,
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
					ListNode,
					TreeNode,
					arrayToListNode,
					listNodeToArray,
					expect,
					vi,
					describe,
					test,
					it,
					safeGlobals.setTimeout,
					safeGlobals.setInterval,
					clearTimeout,
					clearInterval,
					__traceContext,
					safeStringify,
					__traceArgs,
					__traceCall,
				);

				// Execute the module function
				return actualModuleFunction(
					exports,
					requireFn,
					currentPath,
					__traceContext,
					safeStringify,
					__traceArgs,
					__traceCall,
				);
			} catch (error) {
				console.error("Error executing module code:", currentPath, error);
				throw error;
			}
		}

		console.log(
			"代码处理完成，总耗时:",
			(performance.now() - codeProcessStart).toFixed(2),
			"ms",
		);

		// 禁用危险的全局对象
		const restrictedGlobals = {
			fetch: undefined,
			XMLHttpRequest: undefined,
			WebSocket: undefined,
			Worker: undefined,
			SharedWorker: undefined,
			ServiceWorker: undefined,
			localStorage: undefined,
			sessionStorage: undefined,
			indexedDB: undefined,
			location: undefined,
			history: undefined,
			navigator: undefined,
			document: undefined,
			window: undefined,
			global: undefined,
			globalThis: undefined,
			self: undefined,
			importScripts: undefined,
			eval: undefined,
			Function: undefined,
			chai: undefined, // Hide chai global
		};

		// 合并安全的全局对象
		const executionContext = { ...safeGlobals, ...restrictedGlobals };

		// 死循环检测机制
		let _lastCheckTime = performance.now();
		const _iterationCount = 0;
		const _maxIterationsPerSecond = 1000000; // 每秒最大迭代次数

		// 重写循环相关的全局函数来检测死循环
		const instrumentedGlobals = {
			...executionContext,
			__traceContext,
			__safeStringify: safeStringify,
			__traceArgs,
			__traceCall,
			// 重写console以在每次调用时更新检测时间
			console: {
				...mockConsole,
				log: (...args) => {
					_lastCheckTime = performance.now();
					mockConsole.log(...args);
				},
				error: (...args) => {
					_lastCheckTime = performance.now();
					mockConsole.error(...args);
				},
				warn: (...args) => {
					_lastCheckTime = performance.now();
					mockConsole.warn(...args);
				},
				info: (...args) => {
					_lastCheckTime = performance.now();
					mockConsole.info(...args);
				},
			},
		};

		// Note: instrumentation now runs BEFORE wrapInModuleFunction in the transpile loop above
		// so line numbers are correct without offset

		// 简化执行代码，依赖超时机制来处理死循环
		let instrumentedCode;
		let executeCodeFunc;

		// Check if we're in multi-file mode
		if (allFiles && entryFilePath) {
			console.log("Multi-file execution mode");
			console.log("Entry file:", entryFilePath);

			// Normalize entry file path to match transpiled modules keys
			const normalizedEntryPath = normalizePath(entryFilePath);
			console.log("Normalized entry path:", normalizedEntryPath);

			// In multi-file mode, we need to load the entry module using our module system
			// We'll create a wrapper function that loads the entry file
			executeCodeFunc = () => {
				// Create the require function for the entry file
				const entryRequire = createRequire(normalizedEntryPath);

				// Load the entry file (this will trigger the module loading chain)
				entryRequire(normalizedEntryPath);
			};
		} else {
			// Single file mode - execute code directly
			console.log("Single file mode - executing code directly");

			// Process TypeScript if needed
			if (language === "typescript") {
				console.log("检测到TypeScript代码，开始处理...");
				executableCode = await transpileTypeScript(code);
				console.log("转译后代码前100字符:", executableCode?.substring(0, 100));
			} else {
				executableCode = code;
			}

			// 对单文件代码进行递归插桩
			try {
				const { code: singleInstrumented, hasRecursion: singleFound } =
					instrumentRecursiveFunctions(executableCode);
				if (singleFound) hasRecursion = true;
				executableCode = singleInstrumented;
			} catch (instrError) {
				console.error("递归插桩失败，使用原始代码:", instrError.message);
			}

			instrumentedCode = `try { ${executableCode} } catch (error) { throw error; }`;

			// 创建函数来执行代码
			executeCodeFunc = new Function(
				...Object.keys(instrumentedGlobals),
				instrumentedCode,
			);
		}

		const startTime = performance.now();
		__traceContext.state.startTime = startTime;
		console.log("开始执行代码");

		// 构建递归追踪结果
		function buildTraceResult() {
			if (!hasRecursion || __traceContext.steps.length === 0) return undefined;
			return {
				steps: __traceContext.steps,
				maxDepth: Math.max(0, ...__traceContext.steps.map((s) => s.depth)),
				totalCalls: __traceContext.steps.filter((s) => s.action === "enter")
					.length,
				truncated: __traceContext.steps.length >= MAX_TRACE_STEPS,
			};
		}

		// 添加执行超时保护，但保留已收集的输出
		let executionCompleted = false;
		const executionTimeout = setTimeout(() => {
			if (!executionCompleted) {
				console.error("Worker: 代码执行超时，强制终止");
				console.error("Worker: 已收集日志数量:", logs.length);
				console.error("Worker: 已收集错误数量:", errors.length);
				console.error("Worker: 前5条日志:", logs.slice(0, 5));

				const totalTests = testResults.suites.reduce(
					(sum, suite) => sum + suite.tests.length,
					0,
				);
				const passedTests = testResults.suites.reduce(
					(sum, suite) =>
						sum + suite.tests.filter((t) => t.status === "passed").length,
					0,
				);
				const failedTests = totalTests - passedTests;

				const timeoutResult = {
					success: false,
					logs: [...logs], // 保留超时前收集到的所有console输出
					errors: [...errors, "⏱️ 代码执行超时 (3秒限制) - 已显示超时前的输出"],
					executionTime: 3000,
					executionId,
					visualizations,
					trace: buildTraceResult(),
					testResults:
						testResults.suites.length > 0
							? {
									hasTests: true,
									suites: testResults.suites,
									totalTests,
									passed: passedTests,
									failed: failedTests,
									duration: 3000,
								}
							: {
									hasTests: false,
									suites: [],
									totalTests: 0,
									passed: 0,
									failed: 0,
									duration: 0,
								},
				};

				console.error("Worker: 发送超时结果:", {
					logsCount: timeoutResult.logs.length,
					errorsCount: timeoutResult.errors.length,
					executionId: timeoutResult.executionId,
				});

				self.postMessage(timeoutResult);
				executionCompleted = true; // 防止重复发送
			}
		}, 3000); // 3秒超时，比主线程的4秒更短

		try {
			// 执行代码
			if (allFiles && entryFilePath) {
				// Multi-file mode: call the wrapper function directly
				executeCodeFunc();
			} else {
				// Single-file mode: call with instrumentedGlobals
				executeCodeFunc(...Object.values(instrumentedGlobals));
			}
			executionCompleted = true;
			clearTimeout(executionTimeout);

			const endTime = performance.now();
			const executionTime = endTime - startTime;
			console.log("代码执行完成，耗时:", executionTime.toFixed(2), "ms");

			// 发送结果回主线程
			const totalTests = testResults.suites.reduce(
				(sum, suite) => sum + suite.tests.length,
				0,
			);
			const passedTests = testResults.suites.reduce(
				(sum, suite) =>
					sum + suite.tests.filter((t) => t.status === "passed").length,
				0,
			);
			const failedTests = totalTests - passedTests;

			self.postMessage({
				success: true,
				logs,
				errors,
				executionTime: Math.round(executionTime * 100) / 100,
				executionId,
				visualizations,
				trace: buildTraceResult(),
				testResults:
					testResults.suites.length > 0
						? {
								hasTests: true,
								suites: testResults.suites,
								totalTests,
								passed: passedTests,
								failed: failedTests,
								duration: Math.round(executionTime * 100) / 100,
							}
						: {
								hasTests: false,
								suites: [],
								totalTests: 0,
								passed: 0,
								failed: 0,
								duration: 0,
							},
			});
		} catch (execError) {
			executionCompleted = true;
			clearTimeout(executionTimeout);

			const endTime = performance.now();
			const executionTime = endTime - startTime;
			console.error(
				"代码执行出错:",
				execError.message,
				"耗时:",
				executionTime.toFixed(2),
				"ms",
			);

			const totalTests = testResults.suites.reduce(
				(sum, suite) => sum + suite.tests.length,
				0,
			);
			const passedTests = testResults.suites.reduce(
				(sum, suite) =>
					sum + suite.tests.filter((t) => t.status === "passed").length,
				0,
			);
			const failedTests = totalTests - passedTests;

			self.postMessage({
				success: false,
				logs,
				errors: [...errors, execError.message],
				executionTime: Math.round(executionTime * 100) / 100,
				executionId,
				visualizations,
				trace: buildTraceResult(),
				testResults:
					testResults.suites.length > 0
						? {
								hasTests: true,
								suites: testResults.suites,
								totalTests,
								passed: passedTests,
								failed: failedTests,
								duration: Math.round(executionTime * 100) / 100,
							}
						: {
								hasTests: false,
								suites: [],
								totalTests: 0,
								passed: 0,
								failed: 0,
								duration: 0,
							},
			});
		}
	} catch (error) {
		// 发送错误信息回主线程
		self.postMessage({
			success: false,
			logs: [],
			errors: [error instanceof Error ? error.message : String(error)],
			executionTime: 0,
			executionId,
			visualizations: [],
		});
	}
};

// 处理未捕获的错误
self.onerror = (message, _source, lineno, _colno, _error) => {
	self.postMessage({
		success: false,
		logs: [],
		errors: [`Runtime Error: ${message} at line ${lineno}`],
		executionTime: 0,
		visualizations: [],
	});
};

// 立即开始SWC初始化（预加载）
console.log("Web Worker已创建，开始预加载SWC模块...");
initSWC()
	.then(() => {
		console.log("SWC预加载完成，准备就绪");
	})
	.catch((error) => {
		console.warn("SWC预加载失败，将在需要时重试:", error.message);
	});

// Handle retry messages from main thread
self.addEventListener("message", (e) => {
	if (e.data && e.data.type === "swc_init_retry") {
		console.log("收到SWC重新初始化请求");
		swcInitialized = false;
		swcInitializing = false;
		swcInitStartTime = null;
		initSWC().catch((error) => {
			console.warn("SWC重新初始化失败:", error.message);
		});
	}
});
