// Shared types between worker and main thread.
// These are the canonical definitions — codeExecutionService.ts re-exports them.

export interface VisualizationData {
	type: "heap" | "tree" | "graph" | "array";
	data: unknown;
	timestamp: number;
	label?: string;
	changes?: {
		heap?: number[];
		tree?: string[];
	};
}

export interface TestResult {
	status: "passed" | "failed" | "skipped";
	name: string;
	error?: string;
	duration?: number;
}

export interface TestSuite {
	name: string;
	tests: TestResult[];
	status: "passed" | "failed" | "skipped";
	duration: number;
}

export interface TestExecutionResults {
	hasTests: boolean;
	suites: TestSuite[];
	totalTests: number;
	passed: number;
	failed: number;
	duration: number;
}

export interface TraceStep {
	stepIndex: number;
	functionName: string;
	action: "enter" | "exit";
	args: string[];
	returnValue?: string;
	depth: number;
	line: number;
	startCol: number;
	endCol: number;
	timestamp: number;
}

export interface RecursiveTrace {
	steps: TraceStep[];
	maxDepth: number;
	totalCalls: number;
	truncated: boolean;
}

export interface ExecutionResult {
	success: boolean;
	logs: string[];
	errors: string[];
	executionTime: number;
	visualizations: VisualizationData[];
	testResults?: TestExecutionResults;
	trace?: RecursiveTrace;
	executionId?: string;
}

export interface SWCLoadProgress {
	state: "loading" | "ready" | "error";
	step: number;
	totalSteps: number;
	stepLabel: string;
	loaded: number;
	total: number | null;
	percent: number | null;
	error: string | null;
	initTime: number | null;
}

// ---- Worker-internal types below ----

export interface ExecutionRequest {
	code: string;
	language: "javascript" | "typescript";
	executionId: string;
	allFiles?: Record<string, { content: string; language: string; path: string }>;
	entryFilePath?: string;
}

export interface InstrumentResult {
	code: string;
	hasRecursion: boolean;
}

export interface RecursiveFuncInfo {
	name: string;
	startLine: number;
	funcDeclStart: number;
	funcNameStart: number;
	funcNameEnd: number;
	bodyStart: number;
	bodyEnd: number;
}

export interface CallSiteInfo {
	nameStart: number;
	parenStart: number;
	endPos: number;
	line: number;
	startCol: number;
	endCol: number;
	argsStr: string;
}

export interface TraceContext {
	steps: TraceStep[];
	state: { depth: number; startTime: number };
	maxSteps: number;
}

export interface TestResultsInternal {
	suites: TestSuite[];
	currentSuite: TestSuite | null;
	suiteStartTime: number | null;
	testStartTime: number | null;
}

export interface ExecutionContext {
	logs: string[];
	errors: string[];
	visualizations: VisualizationData[];
	testResults: TestResultsInternal;
	traceContext: TraceContext;
	hasRecursion: boolean;
	executionCompleted: boolean;
	executionId: string;
	startTime: number;
}

export type PostMessageFn = (message: unknown) => void;
export type ImportScriptsFn = (...urls: string[]) => void;
