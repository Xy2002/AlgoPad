// Mock console factory for the execution worker.
// Replaces the native console inside user-code sandboxing to capture output,
// enforce caps, report progress, and halt runaway loops.

import type { PostMessageFn } from "./types"
import { safeStringify } from "./serialization"

const LOG_CAP = 1000
const ERROR_CAP = 100
const PROGRESS_INTERVAL = 100

interface MockConsoleDeps {
	logs: string[]
	errors: string[]
	executionId: string
	startTime: number
	postMessage: PostMessageFn
	markCompleted: () => void
}

export interface MockConsole {
	log: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
}

function formatArgs(args: unknown[]): string {
	return args
		.map((arg) => (typeof arg === "object" ? safeStringify(arg) : String(arg)))
		.join(" ")
}

export function createMockConsole(deps: MockConsoleDeps): MockConsole {
	const { logs, errors, executionId, startTime, postMessage, markCompleted } =
		deps

	return {
		log(...args: unknown[]) {
			if (logs.length < LOG_CAP) {
				const message = formatArgs(args)
				logs.push(message)

				if (logs.length % PROGRESS_INTERVAL === 0) {
					postMessage({
						type: "progress",
						logsCount: logs.length,
						errorsCount: errors.length,
						executionId,
					})
				}
			} else if (logs.length === LOG_CAP) {
				logs.push("... (输出过多，已截断剩余日志以防止卡顿)")
				postMessage({
					success: false,
					logs: [...logs],
					errors: [...errors, "⏱️ 输出过多，已自动终止执行"],
					executionTime: performance.now() - startTime,
					executionId,
				})
				markCompleted()
				throw new Error("输出过多，已自动终止执行")
			}
		},

		error(...args: unknown[]) {
			if (errors.length < ERROR_CAP) {
				errors.push(formatArgs(args))
			} else if (errors.length === ERROR_CAP) {
				errors.push("... (错误过多，已截断剩余错误信息)")
			}
		},

		warn(...args: unknown[]) {
			if (logs.length < LOG_CAP) {
				logs.push("⚠️ " + formatArgs(args))
			}
		},

		info(...args: unknown[]) {
			if (logs.length < LOG_CAP) {
				logs.push("ℹ️ " + formatArgs(args))
			}
		},
	}
}
