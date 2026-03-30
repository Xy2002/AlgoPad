import {
	Activity,
	Code2,
	FileDiff,
	Github,
	Play,
	RefreshCw,
	RotateCcw,
	Settings,
	Square,
	StickyNote,
	Trash2,
	TreesIcon,
} from "lucide-react";

import type * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Group,
	Panel,
	Separator as ResizableSeparator,
} from "react-resizable-panels";
import { BinaryTreeVisualizer } from "@/components/BinaryTreeVisualizer";
import CodeEditor from "@/components/CodeEditor";
import ComplexityVisualization from "@/components/ComplexityVisualization";
import { DiffEditorPanel } from "@/components/DiffEditorPanel";
import FileExplorer from "@/components/FileExplorer";
import { FloatingPanel } from "@/components/FloatingPanel";
import LanguageSwitch from "@/components/LanguageSwitch";
import OutputDisplay from "@/components/OutputDisplay";
import PredefinedFunctions from "@/components/PredefinedFunctions";
import ProblemsPanel from "@/components/ProblemsPanel";
import RecursiveTraceVisualization from "@/components/RecursiveTraceVisualization";
import { ScratchpadPanel } from "@/components/ScratchpadPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SwcLoadingToast } from "@/components/SwcLoadingToast";
import TabManager from "@/components/TabManager";
import TestVisualization from "@/components/TestVisualization";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/ui/motion";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { executeCode, stopExecution } from "@/services/codeExecutionService";
import {
	codeExecutionService,
	type SWCLoadProgress,
} from "@/services/codeExecutionService";
import { analyzeComplexity } from "@/services/complexityAnalysisService";
import { usePlaygroundStore } from "@/store/usePlaygroundStore";

export default function Home() {
	const {
		code,
		language,
		settings,
		llmSettings,
		isExecuting,
		executionResult,
		isAnalyzingComplexity,
		complexityResult,
		showComplexityVisualization,
		setCode,
		setExecuting,
		setExecutionResult,
		clearOutput,
		resetToDefault,
		clearAllState,
		activeFileId,
		files,
		openTabs,
		updateFileContent,
		setAnalyzingComplexity,
		setComplexityResult,
		toggleComplexityVisualization,
		traceStepIndex,
		traceIsPlaying,
		tracePlaySpeed,
		setTraceStepIndex,
		setTraceIsPlaying,
		setTracePlaySpeed,
	} = usePlaygroundStore();
	const { t, i18n } = useTranslation();

	// 长按重置功能的状态
	const [isLongPressing, setIsLongPressing] = useState(false);
	const [longPressProgress, setLongPressProgress] = useState(0);
	const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
	const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

	// 长按清除所有状态功能的状态
	const [isLongPressingClear, setIsLongPressingClear] = useState(false);
	const [longPressClearProgress, setLongPressClearProgress] = useState(0);
	const longPressClearTimerRef = useRef<NodeJS.Timeout | null>(null);
	const progressClearTimerRef = useRef<NodeJS.Timeout | null>(null);

	// 文件浏览器状态
	const [isFileExplorerOpen, setIsFileExplorerOpen] = useState(true);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [isBinaryTreePanelOpen, setIsBinaryTreePanelOpen] = useState(false);
	const [isDiffEditorPanelOpen, setIsDiffEditorPanelOpen] = useState(false);
	const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);

	// Problems 状态
	const [markers, setMarkers] = useState<monaco.editor.IMarker[]>([]);
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

	// Trace 高亮状态
	const [highlightRange, setHighlightRange] = useState<{
		line: number;
		startCol: number;
		endCol: number;
	} | null>(null);

	// SWC 加载状态
	const [swcProgress, setSwcProgress] = useState<SWCLoadProgress | null>(null);
	const swcToastIdRef = useRef<string | number | null>(null);

	useEffect(() => {
		const unsubscribe = codeExecutionService.onProgress(setSwcProgress);
		return unsubscribe;
	}, []);

	// 管理 SWC 加载 toast 生命周期
	useEffect(() => {
		if (!swcProgress) return;

		const renderToast = () => (
			<SwcLoadingToast
				progress={swcProgress}
				onRetry={() => {
					codeExecutionService.retrySWCInit();
				}}
			/>
		);

		if (swcProgress.state === "loading") {
			if (!swcToastIdRef.current) {
				swcToastIdRef.current = toast.custom(renderToast, {
					duration: Number.POSITIVE_INFINITY,
					position: "bottom-right",
				});
			} else {
				toast.custom(renderToast, {
					id: swcToastIdRef.current,
					duration: Number.POSITIVE_INFINITY,
					position: "bottom-right",
				});
			}
		} else if (swcProgress.state === "ready") {
			if (swcToastIdRef.current) {
				toast.custom(renderToast, {
					id: swcToastIdRef.current,
					duration: 2000,
					position: "bottom-right",
				});
				swcToastIdRef.current = null;
			}
		} else if (swcProgress.state === "error") {
			if (!swcToastIdRef.current) {
				swcToastIdRef.current = toast.custom(renderToast, {
					duration: Number.POSITIVE_INFINITY,
					position: "bottom-right",
				});
			} else {
				toast.custom(renderToast, {
					id: swcToastIdRef.current,
					duration: Number.POSITIVE_INFINITY,
					position: "bottom-right",
				});
			}
		}
	}, [swcProgress, t]);

	const isSwcLoading = swcProgress?.state === "loading";
	const isSwcError = swcProgress?.state === "error";

	// 同步 trace 步骤到编辑器高亮
	useEffect(() => {
		const trace = executionResult?.trace;
		if (!trace || trace.steps.length === 0) {
			setHighlightRange(null);
			return;
		}
		const step = trace.steps[traceStepIndex];
		if (step) {
			setHighlightRange({
				line: step.line,
				startCol: step.startCol,
				endCol: step.endCol,
			});
		}
	}, [traceStepIndex, executionResult?.trace]);

	// 获取当前活跃文件的代码
	const getCurrentCode = useCallback(() => {
		if (activeFileId && files[activeFileId]) {
			const { fileContents } = usePlaygroundStore.getState();
			return fileContents[activeFileId] || files[activeFileId].content || "";
		}
		return code;
	}, [activeFileId, files, code]);

	// 获取当前活跃文件的语言
	const getCurrentLanguage = useCallback(() => {
		if (activeFileId && files[activeFileId]) {
			const fileName = files[activeFileId].name;
			const extension = fileName.split(".").pop()?.toLowerCase();
			if (extension === "ts" || extension === "tsx") {
				return "typescript";
			} else if (extension === "js" || extension === "jsx") {
				return "javascript";
			}
		}
		return language;
	}, [activeFileId, files, language]);

	const handleRunCode = useCallback(async () => {
		if (isExecuting || isSwcLoading || isSwcError) return;
		setExecuting(true);
		clearOutput();
		setTraceStepIndex(0);
		setTraceIsPlaying(false);
		setHighlightRange(null);
		try {
			const codeToRun = getCurrentCode();
			const languageToUse = getCurrentLanguage();

			// Prepare all files for multi-file execution
			const { fileContents } = usePlaygroundStore.getState();
			const allFilesInfo: Record<
				string,
				{ content: string; language: string; path: string }
			> = {};

			// Build file info map
			for (const [fileId, file] of Object.entries(files)) {
				const content = fileContents[fileId] || file.content || "";
				const extension = file.name.split(".").pop()?.toLowerCase();
				const fileLanguage =
					extension === "ts" || extension === "tsx"
						? "typescript"
						: "javascript";

				allFilesInfo[file.path] = {
					content,
					language: fileLanguage,
					path: file.path,
				};
			}

			// Determine entry file path
			const entryFilePath = activeFileId
				? files[activeFileId]?.path
				: undefined;

			console.log("Executing code with multi-file support:");
			console.log("Entry file:", entryFilePath);
			console.log("Total files:", Object.keys(allFilesInfo).length);

			const result = await executeCode(
				codeToRun,
				languageToUse,
				allFilesInfo,
				entryFilePath,
			);
			console.log("Home组件: 收到执行结果");
			console.log("Home组件: 成功状态:", result.success);
			console.log("Home组件: 日志数量:", result.logs.length);
			console.log("Home组件: 错误数量:", result.errors.length);
			console.log("Home组件: 前3条日志:", result.logs.slice(0, 3));
			setExecutionResult(result);
		} catch (error) {
			setExecutionResult({
				success: false,
				logs: [],
				errors: [
					error instanceof Error ? error.message : "Unknown error occurred",
				],
				executionTime: 0,
				visualizations: [],
			});
		} finally {
			setExecuting(false);
		}
	}, [
		isExecuting,
		isSwcLoading,
		isSwcError,
		clearOutput,
		getCurrentCode,
		getCurrentLanguage,
		setExecutionResult,
		setExecuting,
		setTraceStepIndex,
		setTraceIsPlaying,
	]);

	// 使用指定的代码和语言运行代码
	const handleRunCodeWithParams = useCallback(
		async (code: string, language: "javascript" | "typescript") => {
			if (isExecuting) return;
			setExecuting(true);
			clearOutput();
			try {
				// Debug logging to understand what's being executed
				console.log(
					"执行代码 - 长度:",
					code.length,
					"语言:",
					language,
					"前100字符:",
					code.substring(0, 100),
				);

				// For URL-based code execution, we don't have multi-file support
				// Execute as single file
				const result = await executeCode(code, language);
				console.log("Home组件(Params): 收到执行结果");
				console.log("Home组件(Params): 成功状态:", result.success);
				console.log("Home组件(Params): 日志数量:", result.logs.length);
				console.log("Home组件(Params): 错误数量:", result.errors.length);
				console.log("Home组件(Params): 前3条日志:", result.logs.slice(0, 3));
				setExecutionResult(result);
			} catch (error) {
				console.error("代码执行出错:", error);
				setExecutionResult({
					success: false,
					logs: [],
					errors: [
						error instanceof Error ? error.message : "Unknown error occurred",
					],
					executionTime: 0,
					visualizations: [],
				});
			} finally {
				setExecuting(false);
			}
		},
		[isExecuting, clearOutput, setExecutionResult, setExecuting],
	);

	// 单独处理Monaco编辑器的运行代码事件监听
	useEffect(() => {
		const handleRunCodeEvent = (event: CustomEvent) => {
			// 直接检查当前的执行状态，不依赖useEffect的依赖项
			if (!isExecuting) {
				// 使用从Monaco编辑器传递的代码和语言信息
				const { code, language } = event.detail || {};
				console.log("Monaco事件接收:", {
					hasCode: !!code,
					codeLength: code?.length,
					language: language,
					eventDetail: event.detail,
				});
				if (code && language) {
					handleRunCodeWithParams(code, language);
				} else {
					console.log("使用默认处理器");
					handleRunCode();
				}
			}
		};

		window.addEventListener(
			"monaco-run-code",
			handleRunCodeEvent as EventListener,
		);

		return () => {
			window.removeEventListener(
				"monaco-run-code",
				handleRunCodeEvent as EventListener,
			);
		};
	}, [isExecuting, handleRunCodeWithParams, handleRunCode]);

	const handleStopExecution = () => {
		console.log("用户点击停止按钮");
		stopExecution();
		setExecuting(false);
	};

	const handleClearOutput = () => {
		clearOutput();
	};

	const handleAnalyzeComplexity = async () => {
		if (isAnalyzingComplexity) return;

		const currentCode = getCurrentCode();
		if (!currentCode.trim()) {
			setComplexityResult({
				timeComplexity: "O(0)",
				spaceComplexity: "O(0)",
				explanation: "No code to analyze",
				codeAnalysis: "",
				detectedPatterns: [],
			});
			toggleComplexityVisualization();
			return;
		}

		setAnalyzingComplexity(true);
		try {
			const result = await analyzeComplexity(
				currentCode,
				getCurrentLanguage(),
				llmSettings,
				i18n.language,
			);
			setComplexityResult(result);
			if (!showComplexityVisualization) {
				toggleComplexityVisualization();
			}
		} catch (error) {
			console.error("Complexity analysis error:", error);
			setComplexityResult({
				timeComplexity: "O(?)",
				spaceComplexity: "O(?)",
				explanation:
					error instanceof Error
						? error.message
						: "Failed to analyze complexity",
				codeAnalysis: "",
				detectedPatterns: [],
			});
			if (!showComplexityVisualization) {
				toggleComplexityVisualization();
			}
		} finally {
			setAnalyzingComplexity(false);
		}
	};

	// 处理 markers 变化
	const handleMarkersChange = useCallback(
		(newMarkers: monaco.editor.IMarker[]) => {
			setMarkers(newMarkers);
		},
		[],
	);

	// 处理跳转到错误位置
	const handleJumpToMarker = useCallback(
		(marker: {
			startLineNumber: number;
			startColumn: number;
			endLineNumber: number;
			endColumn: number;
		}) => {
			if (editorRef.current) {
				editorRef.current.revealLineInCenter(marker.startLineNumber);
				editorRef.current.setSelection({
					startLineNumber: marker.startLineNumber,
					startColumn: marker.startColumn,
					endLineNumber: marker.endLineNumber,
					endColumn: marker.endColumn,
				});
				editorRef.current.focus();
			}
		},
		[],
	);

	// 文件浏览器控制
	const handleFileExplorerToggle = () => {
		setIsFileExplorerOpen(!isFileExplorerOpen);
	};

	// 处理代码更改
	const handleCodeChange = (newCode: string | undefined) => {
		if (newCode === undefined) return;

		if (activeFileId && files[activeFileId]) {
			// 如果有活跃文件，更新文件内容
			updateFileContent(activeFileId, newCode);
		} else {
			// 否则更新全局代码
			setCode(newCode);
		}
	};

	// 长按重置功能
	const handleLongPressStart = () => {
		setIsLongPressing(true);
		setLongPressProgress(0);

		// 进度条动画
		let progress = 0;
		progressTimerRef.current = setInterval(() => {
			progress += 2; // 每50ms增加2%，3秒完成
			setLongPressProgress(progress);
			if (progress >= 100 && progressTimerRef.current) {
				clearInterval(progressTimerRef.current);
			}
		}, 60); // 3000ms / 50 = 60ms间隔

		// 3秒后执行重置
		longPressTimerRef.current = setTimeout(() => {
			resetToDefault();
			handleLongPressEnd();
		}, 3000);
	};

	const handleLongPressEnd = () => {
		setIsLongPressing(false);
		setLongPressProgress(0);

		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}

		if (progressTimerRef.current) {
			clearInterval(progressTimerRef.current);
			progressTimerRef.current = null;
		}
	};

	// 长按清除所有状态功能
	const handleLongPressClearStart = () => {
		setIsLongPressingClear(true);
		setLongPressClearProgress(0);

		// 进度条动画
		let progress = 0;
		progressClearTimerRef.current = setInterval(() => {
			progress += 2; // 每50ms增加2%，3秒完成
			setLongPressClearProgress(progress);
			if (progress >= 100 && progressClearTimerRef.current) {
				clearInterval(progressClearTimerRef.current);
			}
		}, 60); // 3000ms / 50 = 60ms间隔

		// 3秒后执行清除所有状态
		longPressClearTimerRef.current = setTimeout(() => {
			clearAllState();
			handleLongPressClearEnd();
		}, 3000);
	};

	const handleLongPressClearEnd = () => {
		setIsLongPressingClear(false);
		setLongPressClearProgress(0);

		if (longPressClearTimerRef.current) {
			clearTimeout(longPressClearTimerRef.current);
			longPressClearTimerRef.current = null;
		}

		if (progressClearTimerRef.current) {
			clearInterval(progressClearTimerRef.current);
			progressClearTimerRef.current = null;
		}
	};

	// 组件卸载时清理定时器
	useEffect(() => {
		return () => {
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
			}
			if (progressTimerRef.current) {
				clearInterval(progressTimerRef.current);
			}
			if (longPressClearTimerRef.current) {
				clearTimeout(longPressClearTimerRef.current);
			}
			if (progressClearTimerRef.current) {
				clearInterval(progressClearTimerRef.current);
			}
		};
	}, []);

	return (
		<PageTransition>
			<div className="h-screen flex flex-col bg-background">
				{/* Vercel-style Header - minimal, no glass */}
				<header className="border-b border-border bg-background px-4 py-2 flex items-center justify-between sticky top-0 z-50">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<Code2 className="w-5 h-5 text-foreground" />
							<h1 className="text-sm font-semibold tracking-tight hidden sm:block">
								{t("header.appName")}
							</h1>
							<h1 className="text-sm font-semibold tracking-tight sm:hidden">
								{t("header.appNameShort")}
							</h1>
						</div>

						<Badge
							variant="secondary"
							className="text-[10px] font-mono font-medium px-1.5 py-0"
						>
							{getCurrentLanguage() === "typescript"
								? t("language.ts")
								: t("language.js")}
						</Badge>
					</div>

					{/* Action Buttons */}
					<div className="flex items-center gap-0.5">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleClearOutput}
							className="text-muted-foreground"
						>
							<RotateCcw className="w-3.5 h-3.5" />
						</Button>

						{/* Clear All State Button */}
						<div className="relative">
							<Button
								variant="ghost"
								size="sm"
								onMouseDown={handleLongPressClearStart}
								onMouseUp={handleLongPressClearEnd}
								onMouseLeave={handleLongPressClearEnd}
								onTouchStart={handleLongPressClearStart}
								onTouchEnd={handleLongPressClearEnd}
								className="relative overflow-hidden text-muted-foreground hover:text-destructive"
								title={t("header.clearAllTooltip")}
							>
								{isLongPressingClear && (
									<div className="absolute inset-0 flex items-center px-2">
										<Progress
											value={longPressClearProgress}
											className="h-0.5"
										/>
									</div>
								)}
								<div className="relative z-10 flex items-center">
									<Trash2
										className={`w-3.5 h-3.5 ${isLongPressingClear ? "animate-pulse" : ""}`}
									/>
								</div>
							</Button>
						</div>

						{/* Reset Button */}
						<div className="relative">
							<Button
								variant="ghost"
								size="sm"
								onMouseDown={handleLongPressStart}
								onMouseUp={handleLongPressEnd}
								onMouseLeave={handleLongPressEnd}
								onTouchStart={handleLongPressStart}
								onTouchEnd={handleLongPressEnd}
								className="relative overflow-hidden text-muted-foreground hover:text-warning"
							>
								{isLongPressing && (
									<div className="absolute inset-0 flex items-center px-2">
										<Progress value={longPressProgress} className="h-0.5" />
									</div>
								)}
								<div className="relative z-10 flex items-center">
									<RefreshCw
										className={`w-3.5 h-3.5 ${isLongPressing ? "animate-spin" : ""}`}
									/>
								</div>
							</Button>
						</div>

						{/* Run/Stop Button */}
						{isExecuting ? (
							<Button
								variant="destructive"
								size="sm"
								onClick={handleStopExecution}
							>
								<Square className="w-3.5 h-3.5" />
							</Button>
						) : isSwcLoading || isSwcError ? (
							<Button size="sm" disabled title={t("swcLoading.buttonTooltip")}>
								<Play className="w-3.5 h-3.5 animate-pulse" />
								<span className="hidden sm:inline ml-1 text-xs">
									{t("swcLoading.loading")}
								</span>
							</Button>
						) : (
							<Button size="sm" onClick={handleRunCode}>
								<Play className="w-3.5 h-3.5" />
								<span className="hidden sm:inline ml-1 text-xs">
									{t("common.run")}
								</span>
							</Button>
						)}

						<div className="w-px h-4 bg-border/50 mx-1" />

						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsSettingsOpen(true)}
							className="text-muted-foreground"
						>
							<Settings className="w-3.5 h-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsBinaryTreePanelOpen(true)}
							className="text-muted-foreground"
							title={t("binaryTree.toolTip")}
						>
							<TreesIcon className="w-3.5 h-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsDiffEditorPanelOpen(true)}
							className="text-muted-foreground"
							title={t("diffEditor.toolTip")}
						>
							<FileDiff className="w-3.5 h-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsScratchpadOpen(true)}
							className="text-muted-foreground"
							title={t("scratchpad.toolTip")}
						>
							<StickyNote className="w-3.5 h-3.5" />
						</Button>
						<ThemeSwitcher />
						<LanguageSwitch />
						<a
							href="https://github.com/Xy2002/algopad"
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground rounded-sm p-1.5 transition-colors"
							title="GitHub"
						>
							<Github className="w-3.5 h-3.5" />
						</a>
					</div>
				</header>

				{/* Main Content */}
				<div className="flex-1 overflow-hidden">
					<Group orientation="horizontal" className="h-full">
						{/* File Explorer */}
						<Panel
							defaultSize="20%"
							minSize="15%"
							maxSize="80%"
							collapsible={true}
							collapsedSize={0}
						>
							<FileExplorer
								isOpen={isFileExplorerOpen}
								onToggle={handleFileExplorerToggle}
							/>
						</Panel>

						<ResizableSeparator className="bg-border hover:bg-foreground/20 transition-colors" />

						{/* Editor and Output Area */}
						<Panel defaultSize="80%" minSize="30%">
							<Group orientation="vertical" className="h-full">
								{/* Tab Manager and Editor */}
								<Panel defaultSize="60%" minSize="20%">
									<div className="h-full flex flex-col">
										{/* Tab Manager */}
										<TabManager />

										{/* Code Editor */}
										<div className="flex-1 flex flex-col min-h-0">
											<div className="flex-1 min-h-0">
												{openTabs.length > 0 ? (
													<CodeEditor
														value={getCurrentCode()}
														onChange={handleCodeChange}
														language={getCurrentLanguage()}
														theme={settings.theme}
														fontSize={settings.fontSize}
														filePath={
															activeFileId && files[activeFileId]
																? `file:///${files[activeFileId].path.startsWith("/") ? files[activeFileId].path.substring(1) : files[activeFileId].path}`
																: `file:///main.${getCurrentLanguage() === "typescript" ? "ts" : "js"}`
														}
														onMarkersChange={handleMarkersChange}
														onEditorMounted={(editor) => {
															editorRef.current = editor;
														}}
														highlightRange={highlightRange}
													/>
												) : (
													<div className="h-full flex items-center justify-center bg-muted/30">
														<div className="text-center text-muted-foreground">
															<Code2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
															<p className="text-xs">
																{t("codeEditor.noOpenFiles")}
															</p>
														</div>
													</div>
												)}
											</div>
										</div>
									</div>
								</Panel>

								<ResizableSeparator className="bg-border hover:bg-foreground/20 transition-colors" />

								{/* Output Panel */}
								<Panel defaultSize="40%" minSize="20%" maxSize="90%">
									<div className="h-full flex flex-col">
										<div className="flex-1 min-h-0">
											<Tabs
												defaultValue="output"
												className="h-full flex flex-col"
											>
												<div className="px-4 py-1.5 border-b border-border">
													<TabsList className="w-full justify-start bg-transparent h-auto p-0 gap-0">
														<TabsTrigger value="output" className="gap-2">
															{t("output.title")}
														</TabsTrigger>
														{executionResult?.testResults?.hasTests && (
															<TabsTrigger value="tests" className="gap-2">
																Tests
																<Badge
																	variant="secondary"
																	className="text-xs font-mono bg-muted/50"
																>
																	{executionResult.testResults.passed}/
																	{executionResult.testResults.totalTests}
																</Badge>
															</TabsTrigger>
														)}
														<TabsTrigger value="problems" className="gap-2">
															Problems
															{markers.length > 0 && (
																<Badge
																	variant="destructive"
																	className="text-xs font-mono"
																>
																	{markers.length}
																</Badge>
															)}
														</TabsTrigger>
														<TabsTrigger value="predefined" className="gap-2">
															{t("predefined.tab")}
														</TabsTrigger>
														{executionResult?.trace &&
															executionResult.trace.steps.length > 0 && (
																<TabsTrigger value="trace" className="gap-2">
																	<Activity className="h-3.5 w-3.5" />
																	Trace
																	<Badge
																		variant="secondary"
																		className="text-xs font-mono bg-muted/50"
																	>
																		{executionResult.trace.totalCalls}
																	</Badge>
																</TabsTrigger>
															)}
													</TabsList>
												</div>
												<div className="flex-1 min-h-0">
													<TabsContent
														value="output"
														className="h-full m-0 p-0"
													>
														{showComplexityVisualization && complexityResult ? (
															<ComplexityVisualization
																result={complexityResult}
																onClose={toggleComplexityVisualization}
															/>
														) : (
															<OutputDisplay
																result={executionResult}
																isExecuting={isExecuting}
																onClear={handleClearOutput}
																onStop={handleStopExecution}
																onAnalyzeComplexity={handleAnalyzeComplexity}
																isAnalyzingComplexity={isAnalyzingComplexity}
															/>
														)}
													</TabsContent>
													{executionResult?.testResults?.hasTests && (
														<TabsContent
															value="tests"
															className="h-full m-0 p-0"
														>
															<TestVisualization
																results={executionResult.testResults}
															/>
														</TabsContent>
													)}
													<TabsContent
														value="problems"
														className="h-full m-0 p-0"
													>
														<ProblemsPanel
															markers={markers}
															isVisible={true}
															onToggle={() => {}}
															onJumpToMarker={handleJumpToMarker}
															alwaysExpanded={true}
														/>
													</TabsContent>
													<TabsContent
														value="predefined"
														className="h-full m-0 p-0"
													>
														<PredefinedFunctions />
													</TabsContent>
													{executionResult?.trace &&
														executionResult.trace.steps.length > 0 && (
															<TabsContent
																value="trace"
																className="h-full m-0 p-0"
															>
																<RecursiveTraceVisualization
																	trace={executionResult.trace}
																	currentStepIndex={traceStepIndex}
																	onStepChange={setTraceStepIndex}
																	isPlaying={traceIsPlaying}
																	onPlayToggle={() =>
																		setTraceIsPlaying(!traceIsPlaying)
																	}
																	playSpeed={tracePlaySpeed}
																	onSpeedChange={setTracePlaySpeed}
																/>
															</TabsContent>
														)}
												</div>
											</Tabs>
										</div>
									</div>
								</Panel>
							</Group>
						</Panel>
					</Group>
				</div>

				<FloatingPanel
					title={t("binaryTree.title")}
					isOpen={isBinaryTreePanelOpen}
					onClose={() => setIsBinaryTreePanelOpen(false)}
					defaultPosition={{ x: window.innerWidth - 450, y: 80 }}
					width={420}
					height={450}
				>
					<BinaryTreeVisualizer />
				</FloatingPanel>

				<FloatingPanel
					title={t("diffEditor.title")}
					isOpen={isDiffEditorPanelOpen}
					onClose={() => setIsDiffEditorPanelOpen(false)}
					defaultPosition={{ x: 100, y: 80 }}
					width={800}
					height={500}
				>
					<DiffEditorPanel />
				</FloatingPanel>

				<FloatingPanel
					title={t("scratchpad.title")}
					isOpen={isScratchpadOpen}
					onClose={() => setIsScratchpadOpen(false)}
					defaultPosition={{ x: window.innerWidth - 450, y: 550 }}
					width={420}
					height={300}
				>
					<ScratchpadPanel />
				</FloatingPanel>

				<SettingsDialog
					isOpen={isSettingsOpen}
					onClose={() => setIsSettingsOpen(false)}
				/>
			</div>
		</PageTransition>
	);
}
