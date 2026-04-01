// Multi-file module system: path resolution, import/export transforms,
// module wrapping, and a CommonJS-like require() loader.

import type { ExecutionContext, PostMessageFn } from "./types"
import { transpileTypeScript } from "./swc"
import { instrumentRecursiveFunctions } from "./recursive-trace"
import type { safeStringify } from "./serialization"
import type { ListNode } from "./data-structures"
import type { TreeNode } from "./data-structures"
import type { MockConsole } from "./console"

// ---- Path helpers ----

export function normalizePath(path: string): string {
	return path.startsWith("/") ? path.substring(1) : path
}

export function resolvePath(
	from: string,
	to: string,
	allFiles: Record<string, unknown>,
): string {
	from = normalizePath(from)
	to = normalizePath(to)

	if (to.startsWith("./") || to.startsWith("../")) {
		const fromParts = from.split("/").slice(0, -1)
		const toParts = to.split("/")

		for (const part of toParts) {
			if (part === ".") continue
			if (part === "..") fromParts.pop()
			else fromParts.push(part)
		}

		const resolved = fromParts.join("/")
		return tryExtensions(resolved, allFiles)
	}

	return tryExtensions(to, allFiles)
}

function tryExtensions(
	resolved: string,
	allFiles: Record<string, unknown>,
): string {
	if (resolved.match(/\.(ts|js|tsx|jsx)$/)) return resolved

	const extensions = [".ts", ".js", ".tsx", ".jsx"]
	for (const ext of extensions) {
		const pathWithExt = resolved + ext
		if (allFiles[pathWithExt]) return pathWithExt
	}
	// Try /index
	for (const ext of extensions) {
		const indexPath = `${resolved}/index${ext}`
		if (allFiles[indexPath]) return indexPath
	}
	return resolved
}

// ---- Import/Export transforms ----

export function wrapInModuleFunction(code: string): string {
	let transformedCode = code

	// ===== IMPORT TRANSFORMATIONS =====

	// import { x, y } from './module' -> const { x, y } = __require('./module')
	transformedCode = transformedCode.replace(
		/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
		"const {$1} = __require('$2')",
	)

	// import x from './module' -> const x = __require('./module').default || __require('./module')
	transformedCode = transformedCode.replace(
		/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
		"const $1 = __require('$2').default || __require('$2')",
	)

	// import * as x from './module' -> const x = __require('./module')
	transformedCode = transformedCode.replace(
		/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
		"const $1 = __require('$2')",
	)

	// ===== EXPORT TRANSFORMATIONS =====

	// export default xxx -> exports.default = xxx
	transformedCode = transformedCode.replace(
		/export\s+default\s+/g,
		"exports.default = ",
	)

	// export function foo() {} -> exports.foo = foo; function foo() {}
	transformedCode = transformedCode.replace(
		/export\s+(async\s+)?function\s+(\w+)/g,
		"exports.$2 = $2; $1function $2",
	)

	// export class Foo {} -> const Foo = exports.Foo = class Foo {}
	transformedCode = transformedCode.replace(
		/export\s+class\s+(\w+)/g,
		"const $1 = exports.$1 = class $1",
	)

	// export const foo = value; -> const foo = value; exports.foo = foo;
	transformedCode = transformedCode.replace(
		/export\s+(const|let|var)\s+(\w+)\s*=\s*([^;]+);/g,
		"$1 $2 = $3; exports.$2 = $2;",
	)

	// export const foo; -> const foo; exports.foo = foo;
	transformedCode = transformedCode.replace(
		/export\s+(const|let|var)\s+(\w+);/g,
		"$1 $2; exports.$2 = $2;",
	)

	// export { x, y } or export { x as X }
	transformedCode = transformedCode.replace(
		/export\s*\{([^}]+)\}/g,
		(_, exports_str: string) => {
			const items = exports_str.split(",").map((item: string) => {
				const trimmed = item.trim()
				const parts = trimmed.split(/\s+as\s+/)
				if (parts.length === 2) {
					return `${parts[1].trim()}: ${parts[0].trim()}`
				}
				return trimmed
			})
			return `Object.assign(exports, { ${items.join(", ")} })`
		},
	)

	// Wrap in module function
	return `(function(exports, __require, __currentFilePath, __traceContext, __safeStringify, __traceArgs, __traceCall) {
${transformedCode}
return exports;
})`
}

// ---- Module system factory ----

/** Dependencies injected from the execution worker entry point. */
export interface ModuleSystemDeps {
	ctx: ExecutionContext
	allFiles: Record<string, { content: string; language: string; path: string }>
	mockConsole: MockConsole
	safeStringify: typeof safeStringify
	safeGlobals: Record<string, unknown>
	ListNode: typeof ListNode
	TreeNode: typeof TreeNode
	arrayToListNode: (arr: number[]) => ListNode | null
	listNodeToArray: (head: ListNode | null) => number[]
	postMessage: PostMessageFn
}

export function createModuleSystem(deps: ModuleSystemDeps) {
	const {
		ctx: _ctx,
		allFiles,
		mockConsole,
		safeStringify: stringify,
		safeGlobals,
		ListNode: ListNodeClass,
		TreeNode: TreeNodeClass,
		arrayToListNode: arrToList,
		listNodeToArray: listToArr,
		postMessage: _postMessage,
	} = deps

	const moduleCache: Record<string, unknown> = {}
	const transpiledModules: Record<string, string> = {}
	let hasRecursion = false

	// ---- Transpile all files ----

	async function transpileAllFiles(): Promise<boolean> {
		console.log(
			"Multi-file mode detected, transpiling",
			Object.keys(allFiles).length,
			"files",
		)

		for (const [filePath, fileInfo] of Object.entries(allFiles)) {
			const normalizedPath = normalizePath(filePath)
			let transpiledContent = fileInfo.content
			let originalFileContent: string | null = null

			if (fileInfo.language === "typescript") {
				transpiledContent = await transpileTypeScript(fileInfo.content)
				originalFileContent = fileInfo.content
			}

			// Instrument recursive functions
			try {
				const { code: instrumented, hasRecursion: found } =
					instrumentRecursiveFunctions(transpiledContent, originalFileContent)
				if (found) hasRecursion = true
				transpiledContent = instrumented
			} catch (_instrError) {
				// Use original code if instrumentation fails
			}

			transpiledContent = wrapInModuleFunction(transpiledContent)
			transpiledModules[normalizedPath] = transpiledContent
		}

		return hasRecursion
	}

	// ---- Module execution via new Function() ----

	// biome-ignore lint/suspicious/noExplicitAny: dynamic values passed through new Function()
	function executeModuleCode(
		moduleFunction: string,
		exports: Record<string, unknown>,
		requireFn: ReturnType<typeof createRequire>,
		currentPath: string,
		traceCtx: any,
		traceArgsFn: any,
		traceCallFn: any,
		expectFn: any,
		viObj: any,
		describeFn: any,
		testFn: any,
		itFn: any,
		renderHeapFn: any,
		renderTreeFn: any,
	) {
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
		)

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const actualModuleFunction = func(
			exports,
			requireFn,
			currentPath,
			mockConsole,
			renderHeapFn,
			renderTreeFn,
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
			ListNodeClass,
			TreeNodeClass,
			arrToList,
			listToArr,
			expectFn,
			viObj,
			describeFn,
			testFn,
			itFn,
			safeGlobals.setTimeout,
			safeGlobals.setInterval,
			clearTimeout,
			clearInterval,
			traceCtx,
			stringify,
			traceArgsFn,
			traceCallFn,
		)

		return actualModuleFunction(
			exports,
			requireFn,
			currentPath,
			traceCtx,
			stringify,
			traceArgsFn,
			traceCallFn,
		)
	}

	// ---- require() implementation ----

	// biome-ignore lint/suspicious/noExplicitAny: dynamic values forwarded to executeModuleCode
	function createRequire(
		currentFilePath: string,
		traceCtx: any,
		traceArgsFn: any,
		traceCallFn: any,
		expectFn: any,
		viObj: any,
		describeFn: any,
		testFn: any,
		itFn: any,
		renderHeapFn: any,
		renderTreeFn: any,
	) {
		return function __require(modulePath: string) {
			const resolvedPath = resolvePath(currentFilePath, modulePath, allFiles)

			if (moduleCache[resolvedPath]) return moduleCache[resolvedPath]

			if (!transpiledModules[resolvedPath]) {
				throw new Error(
					`Cannot find module '${modulePath}' (resolved as '${resolvedPath}') from '${currentFilePath}'`,
				)
			}

			const moduleFunction = transpiledModules[resolvedPath]
			const exports: Record<string, unknown> = {}
			const moduleRequire = createRequire(
				resolvedPath,
				traceCtx,
				traceArgsFn,
				traceCallFn,
				expectFn,
				viObj,
				describeFn,
				testFn,
				itFn,
				renderHeapFn,
				renderTreeFn,
			)

			const executedModule = executeModuleCode(
				moduleFunction,
				exports,
				moduleRequire,
				resolvedPath,
				traceCtx,
				traceArgsFn,
				traceCallFn,
				expectFn,
				viObj,
				describeFn,
				testFn,
				itFn,
				renderHeapFn,
				renderTreeFn,
			)

			moduleCache[resolvedPath] = executedModule || exports
			return moduleCache[resolvedPath]
		}
	}

	return {
		transpiledModules,
		moduleCache,
		transpileAllFiles,
		createRequire,
		executeModuleCode,
		getHasRecursion: () => hasRecursion,
	}
}
