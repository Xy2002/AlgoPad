/// <reference lib="webworker" />

// SWC WASM initialization from local npm package, TypeScript transpilation, and fallback.

import init, { transformSync } from "@swc/wasm-web"
import * as chai from "chai"

type SwcTransformFn = (code: string, options: unknown) => { code: string }

let swcInitialized = false
let swcInitializing = false
let swcTransform: SwcTransformFn | null = null
let swcInitStartTime: number | null = null

// Initialize SWC WebAssembly module from local npm package.
// Posts progress events to the main thread via self.postMessage.
export async function initSWC(): Promise<void> {
	if (swcInitialized) return

	if (swcInitializing) {
		// Wait for the in-flight initialization to finish
		while (swcInitializing && !swcInitialized) {
			await new Promise((resolve) => setTimeout(resolve, 50))
		}
		return
	}

	swcInitializing = true
	swcInitStartTime = performance.now()

	try {
		// Step 1: Load WASM binary from local public directory
		self.postMessage({
			type: "swc_init_step",
			step: 1,
			totalSteps: 1,
			stepLabel: "Loading SWC WASM",
		})

		const wasmUrl = new URL("/swc/wasm-web_bg.wasm", self.location.origin)
		const wasmResponse = await fetch(wasmUrl.href)
		if (!wasmResponse.ok) {
			throw new Error(`Failed to fetch WASM: HTTP ${wasmResponse.status}`)
		}

		let loadedBytes = 0
		const chunks: Uint8Array[] = []

		if (wasmResponse.body) {
			const reader = wasmResponse.body.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				chunks.push(value)
				loadedBytes += value.length

				self.postMessage({
					type: "swc_init_progress",
					step: 1,
					totalSteps: 1,
					loaded: loadedBytes,
					total: null,
					percent: null,
				})
			}
		} else {
			const buffer = await wasmResponse.arrayBuffer()
			loadedBytes = buffer.byteLength
			chunks.push(new Uint8Array(buffer))
			self.postMessage({
				type: "swc_init_progress",
				step: 1,
				totalSteps: 1,
				loaded: loadedBytes,
				total: null,
				percent: null,
			})
		}

		// Combine chunks and initialize WASM
		const wasmBytes = new Uint8Array(loadedBytes)
		let offset = 0
		for (const chunk of chunks) {
			wasmBytes.set(chunk, offset)
			offset += chunk.length
		}

		await init(wasmBytes.buffer)

		swcTransform = transformSync as SwcTransformFn
		swcInitialized = true
		swcInitializing = false

		const initTime = performance.now() - swcInitStartTime

		self.postMessage({
			type: "swc_init_complete",
			success: true,
			initTime: Math.round(initTime * 100) / 100,
		})
	} catch (error) {
		swcInitializing = false
		const initTime = swcInitStartTime
			? performance.now() - swcInitStartTime
			: 0
		swcInitialized = false
		swcTransform = null

		self.postMessage({
			type: "swc_init_complete",
			success: false,
			error: (error as Error).message,
			initTime: Math.round(initTime * 100) / 100,
		})
	}
}

export function isSwcReady(): boolean {
	return swcInitialized
}

/** Get the Chai module (loaded from npm package). */
export function getChai() {
	return chai
}

/** Reset SWC state (used for retry from main thread). */
export function resetSwcState(): void {
	swcInitialized = false
	swcInitializing = false
	swcInitStartTime = null
}

// Fast TypeScript transpilation using SWC, with regex fallback.
export async function transpileTypeScript(tsCode: string): Promise<string> {
	try {
		if (!swcInitialized) {
			await initSWC()
		}

		if (!swcInitialized || !swcTransform) {
			return fallbackTranspile(tsCode)
		}

		try {
			const result = swcTransform(tsCode, {
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
			})

			return result.code
		} catch (_swcError) {
			return fallbackTranspile(tsCode)
		}
	} catch (_error) {
		return fallbackTranspile(tsCode)
	}
}

// Simple regex-based TS → JS fallback when SWC is unavailable.
export function fallbackTranspile(tsCode: string): string {
	try {
		const jsCode = tsCode
			// Remove type aliases: type Foo = ...;
			.replace(/type\s+\w+\s*=\s*[^;]+;/g, "")
			// Remove interface definitions
			.replace(/interface\s+\w+[\s\S]*?\{[\s\S]*?\}/g, "")
			// Remove enum definitions
			.replace(/enum\s+\w+[\s\S]*?\{[\s\S]*?\}/g, "")
			// Remove access modifiers
			.replace(/\b(public|private|protected|readonly)\s+/g, "")
			// Remove variable type annotations: let x: number = 1 -> let x = 1
			.replace(/:\s*[\w<>,[\]|&\s]+(?=\s*[=;)])/g, "")
			// Remove function return types
			.replace(/\):\s*[\w<>,[\]|&\s]+\s*\{/g, ") {")
			// Remove as-assertions
			.replace(/\s+as\s+[\w<>,[\]|&\s]+/g, "")
			// Remove non-null assertions
			.replace(/(\w+)!/g, "$1")
			// Collapse blank lines
			.replace(/\n\s*\n/g, "\n")
			.trim()

		return jsCode
	} catch (_error) {
		return tsCode
	}
}
