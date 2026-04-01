// Test framework factory: expect, vi, describe/test/it for sandboxed execution.
// Mirrors the behavior in public/execution.worker.js lines 721–1082.

import type { TestSuite, TestResultsInternal } from "./types"
import type { safeStringify } from "./serialization"
import chai from "chai"

type ChaiInstance = typeof chai

// ---- Types ----

interface ExpectMatchers {
	toBe(expected: unknown): boolean
	toEqual(expected: unknown): boolean
	toBeTruthy(): boolean
	toBeFalsy(): boolean
	toBeNull(): boolean
	toBeUndefined(): boolean
	toBeDefined(): boolean
	toBeNaN(): boolean
	toContain(item: unknown): boolean
	toBeGreaterThan(number: number): boolean
	toBeGreaterThanOrEqual(number: number): boolean
	toBeLessThan(number: number): boolean
	toBeLessThanOrEqual(number: number): boolean
	toBeInstanceOf(ctor: (...args: never[]) => unknown): boolean
	toThrow(message?: string | RegExp): boolean
	not: this
}

type ExpectFn = (received: unknown) => ExpectMatchers

interface MockFn {
	(...args: unknown[]): unknown
	calls: unknown[][]
	mockReturnValue(val: unknown): MockFn
}

interface Vi {
	fn(impl?: (...args: unknown[]) => unknown): MockFn
	spyOn(obj: Record<string, unknown>, method: string): MockFn
}

interface TestFrameworkDeps {
	safeStringify: typeof safeStringify
	consoleLog: (...args: unknown[]) => void
	consoleError: (...args: unknown[]) => void
	chai: ChaiInstance | null | undefined
}

interface TestFramework {
	expect: ExpectFn
	vi: Vi
	describe: (name: string, fn: () => void) => void
	test: (name: string, fn: () => void) => void
	it: (name: string, fn: () => void) => void
	testResults: TestResultsInternal
}

// ---- Helpers ----

function isDeepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null)
		return false

	const keysA = Object.keys(a as Record<string, unknown>)
	const keysB = Object.keys(b as Record<string, unknown>)

	if (keysA.length !== keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key) || !isDeepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
			return false
	}

	return true
}

// ---- Factory ----

export function createTestFramework(deps: TestFrameworkDeps): TestFramework {
	const { safeStringify: stringify, consoleLog, consoleError, chai } = deps

	// ---------- expect ----------

	let expectImplementation: ExpectFn

	if (chai) {
		// Wrap Chai with Jest/Vitest compatible API using assert interface for reliability
		expectImplementation = (received) => {
			const assert = chai.assert

			const matchers = (isNot = false): ExpectMatchers => {
				return {
					toBe: (expected) => {
						if (isNot) {
							assert.notStrictEqual(received, expected)
						} else {
							assert.strictEqual(received, expected)
						}
						return true
					},
					toEqual: (expected) => {
						if (isNot) assert.notDeepEqual(received, expected)
						else assert.deepEqual(received, expected)
						return true
					},
					toBeTruthy: () => {
						// isNotOk checks for falsy, isOk checks for truthy
						if (isNot) assert.isNotOk(received)
						else assert.isOk(received)
						return true
					},
					toBeFalsy: () => {
						if (isNot) assert.isOk(received)
						else assert.isNotOk(received)
						return true
					},
					toBeNull: () => {
						if (isNot) assert.notInstanceOf(received, Error)
						else assert.isNull(received)
						return true
					},
					toBeUndefined: () => {
						if (isNot) assert.isDefined(received)
						else assert.isUndefined(received)
						return true
					},
					toBeDefined: () => {
						if (isNot) assert.isUndefined(received)
						else assert.isDefined(received)
						return true
					},
					toBeNaN: () => {
						if (isNot) assert.isNotNaN(received)
						else assert.isNaN(received)
						return true
					},
					toContain: (item) => {
						if (isNot) assert.notInclude(received, item)
						else assert.include(received, item)
						return true
					},
					toBeGreaterThan: (number) => {
						if (isNot) assert.isAtMost(received as number, number)
						else assert.isAbove(received as number, number)
						return true
					},
					toBeGreaterThanOrEqual: (number) => {
						if (isNot) assert.isBelow(received as number, number)
						else assert.isAtLeast(received as number, number)
						return true
					},
					toBeLessThan: (number) => {
						if (isNot) assert.isAtLeast(received as number, number)
						else assert.isBelow(received as number, number)
						return true
					},
					toBeLessThanOrEqual: (number) => {
						if (isNot) assert.isAbove(received as number, number)
						else assert.isAtMost(received as number, number)
						return true
					},
					toBeInstanceOf: (ctor) => {
						if (isNot) assert.notInstanceOf(received as (...args: never[]) => unknown, ctor)
						else assert.instanceOf(received as (...args: never[]) => unknown, ctor)
						return true
					},
					toThrow: (message) => {
						if (isNot) {
							assert.doesNotThrow(received as () => void, message as string)
						} else {
							assert.throws(received as () => void, message as RegExp | ErrorConstructor)
						}
						return true
					},
					// `not` is set below after construction
					not: null as unknown as ExpectMatchers,
				}
			}

			const baseMatchers = matchers(false)
			baseMatchers.not = matchers(true)
			return baseMatchers
		}
	} else {
		// Fallback manual implementation if Chai fails to load
		expectImplementation = (received) => {
			const matchers = (isNot = false): ExpectMatchers => ({
				toBe: (expected) => {
					const pass = Object.is(received, expected)
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be ${stringify(expected)}, but it was`
								: `Expected ${stringify(expected)}, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toEqual: (expected) => {
					const pass = isDeepEqual(received, expected)
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT equal ${stringify(expected)}`
								: `Expected deep equality to ${stringify(expected)}, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toBeTruthy: () => {
					const pass = !!received
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be truthy, but it was ${stringify(received)}`
								: `Expected value to be truthy, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toBeFalsy: () => {
					const pass = !received
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be falsy, but it was ${stringify(received)}`
								: `Expected value to be falsy, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toBeNull: () => {
					const pass = received === null
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be null`
								: `Expected value to be null, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toBeUndefined: () => {
					const pass = received === undefined
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be undefined`
								: `Expected value to be undefined, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toBeDefined: () => {
					const pass = received !== undefined
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be defined`
								: `Expected value to be defined, but received undefined`,
						)
					}
					return true
				},
				toBeNaN: () => {
					const pass = Number.isNaN(received)
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be NaN, but it was ${stringify(received)}`
								: `Expected value to be NaN, but received ${stringify(received)}`,
						)
					}
					return true
				},
				toContain: (item) => {
					let pass = false
					if (Array.isArray(received)) {
						pass = received.includes(item)
					} else if (typeof received === "string") {
						pass = received.includes(item as string)
					} else {
						throw new Error(
							`Received value must be an array or string to use toContain()`,
						)
					}

					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected collection to NOT contain ${stringify(item)}`
								: `Expected collection to contain ${stringify(item)}, but it was not found`,
						)
					}
					return true
				},
				toBeGreaterThan: (expected) => {
					const pass = (received as number) > expected
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected ${received} to NOT be greater than ${expected}`
								: `Expected ${received} to be greater than ${expected}`,
						)
					}
					return true
				},
				toBeGreaterThanOrEqual: (expected) => {
					const pass = (received as number) >= expected
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected ${received} to NOT be greater than or equal to ${expected}`
								: `Expected ${received} to be greater than or equal to ${expected}`,
						)
					}
					return true
				},
				toBeLessThan: (expected) => {
					const pass = (received as number) < expected
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected ${received} to NOT be less than ${expected}`
								: `Expected ${received} to be less than ${expected}`,
						)
					}
					return true
				},
				toBeLessThanOrEqual: (expected) => {
					const pass = (received as number) <= expected
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected ${received} to NOT be less than or equal to ${expected}`
								: `Expected ${received} to be less than or equal to ${expected}`,
						)
					}
					return true
				},
				toBeInstanceOf: (ctor) => {
					const pass = received instanceof (ctor as (...args: never[]) => unknown)
					const result = isNot ? !pass : pass
					if (!result) {
						throw new Error(
							isNot
								? `Expected value to NOT be instance of ${stringify(ctor)}`
								: `Expected value to be instance of ${stringify(ctor)}`,
						)
					}
					return true
				},
				toThrow: (message) => {
					if (typeof received !== "function") {
						throw new Error("toThrow requires a function as the received value")
					}
					let threw = false
					let error: unknown
					try {
						received()
					} catch (e) {
						threw = true
						error = e
					}

					if (isNot) {
						if (threw) {
							throw new Error(
								`Expected function to NOT throw, but it threw: ${(error as Error).message}`,
							)
						}
						return true
					}

					if (!threw) {
						throw new Error("Expected function to throw, but it did not")
					}

					if (message) {
						const errMsg = (error as Error).message
						const matches =
							typeof message === "string"
								? errMsg.includes(message)
								: message.test(errMsg)
						if (!matches) {
							throw new Error(
								`Expected function to throw with message matching "${message}", but got "${errMsg}"`,
							)
						}
					}

					return true
				},
				// `not` is set below after construction
				not: null as unknown as ExpectMatchers,
			})

			const baseMatchers = matchers(false)
			baseMatchers.not = matchers(true)
			return baseMatchers
		}
	}

	const expect = expectImplementation

	// ---------- vi (Vitest mock utility) ----------

	const vi: Vi = {
		fn: (impl) => {
			let currentImpl = impl
			const mock = (...args: unknown[]) => {
				mock.calls.push(args)
				return currentImpl ? currentImpl(...args) : undefined
			}
			mock.calls = [] as unknown[][]
			mock.mockReturnValue = (val: unknown) => {
				currentImpl = () => val
				return mock
			}
			return mock
		},
		spyOn: (obj, method) => {
			const original = obj[method] as (...args: unknown[]) => unknown
			const mock = vi.fn(typeof original === "function" ? original : undefined)
			obj[method] = mock
			return mock
		},
	}

	// ---------- Test runner ----------

	const testResults: TestResultsInternal = {
		suites: [],
		currentSuite: null,
		suiteStartTime: null,
		testStartTime: null,
	}

	const describe = (name: string, fn: () => void) => {
		const suiteStartTime = performance.now()
		const suite: TestSuite = {
			name,
			tests: [],
			status: "passed",
			duration: 0,
		}
		testResults.currentSuite = suite
		testResults.suiteStartTime = suiteStartTime

		consoleLog(`\n📝 Suite: ${name}`)

		try {
			fn()
		} catch (e) {
			suite.status = "failed"
			consoleError(`❌ Suite failed: ${(e as Error).message}`)
		}

		suite.duration = Math.round(performance.now() - suiteStartTime)
		testResults.suites.push(suite)
		testResults.currentSuite = null
	}

	const test = (name: string, fn: () => void) => {
		const testStartTime = performance.now()
		let testStatus: "passed" | "failed" = "passed"
		let testError: string | undefined

		try {
			fn()
		} catch (e) {
			testStatus = "failed"
			testError = (e as Error).message
			consoleError(`  ❌ ${name}: ${(e as Error).message}`)
		}

		const testDuration = Math.round(performance.now() - testStartTime)

		// Add to current suite if exists
		if (testResults.currentSuite) {
			testResults.currentSuite.tests.push({
				name,
				status: testStatus,
				error: testError,
				duration: testDuration,
			})

			// Update suite status if any test failed
			if (testStatus === "failed") {
				testResults.currentSuite.status = "failed"
			}
		}

		// Also log to console for backward compatibility
		if (testStatus === "passed") {
			consoleLog(`  ✅ ${name}`)
		}
	}

	const it = test // Alias

	return { expect, vi, describe, test, it, testResults }
}
