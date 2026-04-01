// Recursive function detection, instrumentation, and trace recording.

import type {
	RecursiveFuncInfo,
	InstrumentResult,
	TraceContext,
	RecursiveTrace,
} from "./types"

export const MAX_TRACE_STEPS = 10000

/**
 * Detect function declarations that call themselves recursively.
 */
export function detectRecursiveFunctions(code: string): RecursiveFuncInfo[] {
	const recursiveFunctions: RecursiveFuncInfo[] = []
	const funcRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{/g

	let match = funcRegex.exec(code)
	while (match !== null) {
		const funcName = match[1]
		const funcStart = match.index
		const funcDeclLine = code.substring(0, funcStart).split("\n").length

		// Find matching closing brace by tracking brace depth
		let braceCount = 1
		const bodyStart = funcStart + match[0].length
		let bodyEnd = bodyStart
		for (let i = bodyStart; i < code.length; i++) {
			if (code[i] === "{") braceCount++
			else if (code[i] === "}") {
				braceCount--
				if (braceCount === 0) {
					bodyEnd = i
					break
				}
			}
		}

		const body = code.substring(bodyStart, bodyEnd)
		// Check if the function calls itself inside its body
		const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, "g")
		const calls = body.match(callRegex)

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
			})
		}
		match = funcRegex.exec(code)
	}

	return recursiveFunctions
}

interface PrecomputedCall {
	line: number
	startCol: number
	endCol: number
	argsStr: string
}

/**
 * Instrument recursive functions by renaming originals and wrapping call sites
 * with trace helpers.
 *
 * When `originalCodeForPositions` is provided (e.g. for TS files), line/column
 * positions are computed against that source so editor highlights stay correct.
 */
export function instrumentRecursiveFunctions(
	code: string,
	originalCodeForPositions?: string | null,
): InstrumentResult {
	const recursiveFuncs = detectRecursiveFunctions(code)
	if (recursiveFuncs.length === 0) return { code, hasRecursion: false }

	// Use original code for position computation when available (TS files),
	// so that highlight positions match what's displayed in the Monaco editor.
	const posCode = originalCodeForPositions || code

	// Pre-compute call-site line/col info (against the editor-visible source)
	const precomputedCalls: Record<string, PrecomputedCall[]> = {}
	for (const func of recursiveFuncs) {
		const callRegex = new RegExp(`\\b${func.name}\\s*\\(`, "g")
		const calls: PrecomputedCall[] = []
		let match: RegExpExecArray | null
		// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
		while ((match = callRegex.exec(posCode)) !== null) {
			const nameStart = match.index
			const parenStart = posCode.indexOf("(", nameStart + func.name.length)
			if (parenStart === -1) continue

			// Skip the function declaration itself (e.g. "function fibonacci(")
			const before = posCode
				.substring(Math.max(0, nameStart - 10), nameStart)
				.trim()
			if (before.endsWith("function")) continue

			// Compute line/col on original code
			const beforeCall = posCode.substring(0, nameStart)
			const line = beforeCall.split("\n").length
			const lastNewline = beforeCall.lastIndexOf("\n")
			const startCol = nameStart - lastNewline

			// Find matching close paren
			let depth = 0
			let endPos = parenStart
			for (let j = parenStart; j < posCode.length; j++) {
				if (posCode[j] === "(") depth++
				else if (posCode[j] === ")") {
					depth--
					if (depth === 0) {
						endPos = j + 1
						break
					}
				}
			}
			const endCol = endPos - lastNewline
			const argsStr = posCode.substring(parenStart + 1, endPos - 1)

			calls.push({ line, startCol, endCol, argsStr })
		}
		precomputedCalls[func.name] = calls
	}

	let result = code

	// Phase 1: Rename functions (fibonacci -> __orig_fibonacci) and insert alias
	// bindings, processed from back to front to avoid position shifts.
	for (let i = recursiveFuncs.length - 1; i >= 0; i--) {
		const func = recursiveFuncs[i]
		const originalName = func.name
		const backupName = `__orig_${originalName}`

		// Rename original function: function fibonacci -> function __orig_fibonacci
		result =
			result.substring(0, func.funcNameStart) +
			backupName +
			result.substring(func.funcNameEnd)

		// Insert alias binding before the function declaration
		const aliasCode = `var ${originalName} = function() { return ${backupName}.apply(this, arguments); };\n`
		result =
			result.substring(0, func.funcDeclStart) +
			aliasCode +
			result.substring(func.funcDeclStart)
	}

	// Phase 2: Replace all call sites with __traceCall wrappers (from back to
	// front within each function to avoid position shifts).
	for (let i = 0; i < recursiveFuncs.length; i++) {
		const func = recursiveFuncs[i]
		const originalName = func.name
		const backupName = `__orig_${originalName}`
		const precomputed = precomputedCalls[originalName]

		// Find all originalName( call sites in the current result
		const callRegex = new RegExp(`\\b${originalName}\\s*\\(`, "g")
		const callSites: {
			nameStart: number
			parenStart: number
			endPos: number
			line: number
			startCol: number
			endCol: number
			argsStr: string
		}[] = []
		let callMatch: RegExpExecArray | null
		let callIndex = 0
		// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
		while ((callMatch = callRegex.exec(result)) !== null) {
			const pos = callMatch.index
			const nameStart = pos
			const parenStart = result.indexOf("(", pos + originalName.length)

			if (parenStart === -1) continue

			// Find matching close paren (handle nested parens)
			let depth = 0
			let endPos = parenStart
			for (let j = parenStart; j < result.length; j++) {
				if (result[j] === "(") depth++
				else if (result[j] === ")") {
					depth--
					if (depth === 0) {
						endPos = j + 1
						break
					}
				}
			}

			// Extract arguments portion
			const argsStr = result.substring(parenStart + 1, endPos - 1)

			// Use pre-computed line/col from original code
			const lineInfo = precomputed[callIndex] || {
				line: 0,
				startCol: 0,
				endCol: 0,
			}

			callSites.push({
				nameStart,
				parenStart,
				endPos,
				line: lineInfo.line,
				startCol: lineInfo.startCol,
				endCol: lineInfo.endCol,
				argsStr,
			})
			callIndex++
		}

		// Replace call sites from back to front
		for (let j = callSites.length - 1; j >= 0; j--) {
			const site = callSites[j]
			const replacement = `(function(__tc_a){return __traceCall(${site.line},${site.startCol},${site.endCol},"${originalName}",__tc_a,function(){return ${backupName}.apply(null,__tc_a)})})([${site.argsStr}])`
			result =
				result.substring(0, site.nameStart) +
				replacement +
				result.substring(site.endPos)
		}
	}

	return { code: result, hasRecursion: true }
}

interface TraceContextDeps {
	safeStringify: (obj: unknown, maxDepth?: number, visited?: WeakSet<object>) => string
}

/**
 * Factory that creates a fresh trace context together with the helper functions
 * that operate on it. Accepts a `safeStringify` dependency so it can be used
 * both in the worker (with the real implementation) and in tests (with a stub).
 */
export function createTraceContext(deps: TraceContextDeps) {
	const { safeStringify } = deps

	const traceContext: TraceContext = {
		steps: [],
		state: { depth: 0, startTime: 0 },
		maxSteps: MAX_TRACE_STEPS,
	}

	function traceArgs(args: IArguments | unknown[]): string[] {
		const result: string[] = []
		for (let i = 0; i < args.length; i++) {
			try {
				result.push(safeStringify(args[i]))
			} catch (_e) {
				result.push("[Error serializing]")
			}
		}
		return result
	}

	function traceCall<T>(
		line: number,
		startCol: number,
		endCol: number,
		funcName: string,
		args: IArguments | unknown[],
		callFn: () => T,
	): T {
		if (traceContext.steps.length < traceContext.maxSteps) {
			traceContext.steps.push({
				stepIndex: traceContext.steps.length,
				functionName: funcName,
				action: "enter",
				args: traceArgs(args),
				depth: traceContext.state.depth,
				line,
				startCol,
				endCol,
				timestamp: performance.now() - traceContext.state.startTime,
			})
		}
		traceContext.state.depth++
		let traceResult: T
		try {
			traceResult = callFn()
		} finally {
			traceContext.state.depth--
			if (traceContext.steps.length < traceContext.maxSteps) {
				traceContext.steps.push({
					stepIndex: traceContext.steps.length,
					functionName: funcName,
					action: "exit",
					args: traceArgs(args),
					returnValue: safeStringify(traceResult),
					depth: traceContext.state.depth,
					line,
					startCol,
					endCol,
					timestamp: performance.now() - traceContext.state.startTime,
				})
			}
		}
		return traceResult
	}

	function buildTraceResult(hasRecursion: boolean): RecursiveTrace | undefined {
		if (!hasRecursion || traceContext.steps.length === 0) return undefined

		let maxDepth = 0
		const enterSteps = new Set<string>()
		for (const step of traceContext.steps) {
			if (step.action === "enter") {
				if (step.depth > maxDepth) maxDepth = step.depth
				enterSteps.add(`${step.functionName}:${step.args.join(",")}`)
			}
		}

		return {
			steps: traceContext.steps,
			maxDepth,
			totalCalls: enterSteps.size,
			truncated: traceContext.steps.length >= traceContext.maxSteps,
		}
	}

	return { traceContext, traceArgs, traceCall, buildTraceResult }
}
