import { createAnthropic } from "@ai-sdk/anthropic";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { Editor, type EditorProps } from "@monaco-editor/react";
import { generateText, type LanguageModel } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import type * as monaco from "monaco-editor";
import {
	CompletionCopilot,
	type CompletionRegistration,
	registerCompletion,
} from "monacopilot";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlaygroundStore } from "@/store/usePlaygroundStore";
import { monacoModelService } from "@/services/monacoModelService";

interface HighlightRange {
	line: number;
	startCol: number;
	endCol: number;
}

interface CodeEditorProps {
	value: string;
	onChange: (value: string | undefined) => void;
	language: "javascript" | "typescript";
	theme: "vs-dark" | "vs";
	fontSize: number;
	readOnly?: boolean;
	filePath: string;
	onMarkersChange?: (markers: monaco.editor.IMarker[]) => void;
	onEditorMounted?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
	highlightRange?: HighlightRange | null;
}

export default function CodeEditor({
	value,
	onChange,
	language,
	theme,
	fontSize,
	readOnly = false,
	filePath,
	onMarkersChange,
	onEditorMounted,
	highlightRange,
}: CodeEditorProps) {
	const { t } = useTranslation();
	const { llmSettings, toggleLlmEnabled, files, fileContents } =
		usePlaygroundStore();
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
	const monacoRef = useRef<typeof monaco | null>(null);
	const completionRegistrationRef = useRef<CompletionRegistration | null>(null);
	const decorationCollectionRef =
		useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
	const [isEditorReady, setIsEditorReady] = useState(false);

	// Reset refs when component remounts after unmount
	useEffect(() => {
		return () => {
			editorRef.current = null;
			monacoRef.current = null;
			setIsEditorReady(false);
		};
	}, []);

	// 计算Inactive的原因
	const inactiveReason = useMemo(() => {
		if (!llmSettings.enabled) {
			return "LLM is disabled. Click to enable.";
		}
		if (!isEditorReady) {
			return "Editor is not ready yet.";
		}
		if (!editorRef.current) {
			return "Editor instance not available.";
		}
		if (!monacoRef.current) {
			return "Monaco instance not available.";
		}
		if (!llmSettings.apiKey) {
			return "API Key is missing. Please configure it in settings.";
		}
		if (!llmSettings.model) {
			return "Model is not selected. Please select a model in settings.";
		}
		return null;
	}, [
		llmSettings.enabled,
		llmSettings.apiKey,
		llmSettings.model,
		isEditorReady,
	]);

	// Cleaning up the completion provider when component unmounts
	useEffect(() => {
		return () => {
			if (completionRegistrationRef.current) {
				completionRegistrationRef.current.deregister();
				completionRegistrationRef.current = null;
			}
			if (decorationCollectionRef.current) {
				decorationCollectionRef.current.clear();
			}
		};
	}, []);

	// Track marker polling timers for cleanup
	const markerPollTimersRef = useRef<{
		pollTimer: NodeJS.Timeout | null;
		activePollInterval: NodeJS.Timeout | null;
	}>({ pollTimer: null, activePollInterval: null });

	// Cleanup marker polling on unmount
	useEffect(() => {
		return () => {
			const { pollTimer, activePollInterval } = markerPollTimersRef.current;
			if (activePollInterval) clearInterval(activePollInterval);
			if (pollTimer) clearTimeout(pollTimer);
		};
	}, []);

	// Trace range highlighting (call-site based)
	useEffect(() => {
		const editor = editorRef.current;
		const monacoInstance = monacoRef.current;
		if (!editor || !monacoInstance || !isEditorReady) return;

		if (!highlightRange) {
			if (decorationCollectionRef.current) {
				decorationCollectionRef.current.clear();
			}
			return;
		}

		if (!decorationCollectionRef.current) {
			decorationCollectionRef.current = editor.createDecorationsCollection([]);
		}

		const { line, startCol, endCol } = highlightRange;

		decorationCollectionRef.current.set([
			{
				range: new monacoInstance.Range(line, startCol, line, endCol),
				options: {
					isWholeLine: false,
					className: "trace-highlight-range",
					linesDecorationsClassName: "trace-highlight-range-decoration",
					overviewRuler: {
						color: "rgba(245, 158, 11, 0.6)",
						position: monacoInstance.editor.OverviewRulerLane.Full,
					},
				},
			},
		]);

		editor.revealLineInCenter(line);
	}, [highlightRange, isEditorReady]);

	// Dynamic registration logic based on settings
	useEffect(() => {
		console.log(
			`Auto Completion Active Status: ${
				!!editorRef.current &&
				!!monacoRef.current &&
				!!llmSettings.apiKey &&
				!!llmSettings.model &&
				llmSettings.enabled
			}`,
		);
		if (
			!isEditorReady ||
			!editorRef.current ||
			!monacoRef.current ||
			!llmSettings.apiKey ||
			!llmSettings.model ||
			!llmSettings.enabled
		) {
			return;
		}

		// Create a copilot instance with current settings
		const copilot = new CompletionCopilot(undefined, {
			model: async (prompt) => {
				try {
					let model: LanguageModel;
					const commonOptions = {
						apiKey: llmSettings.apiKey,
						// Only use custom API URL if it's provided and not empty
						baseURL: llmSettings.apiUrl || undefined,
					};
					console.log(llmSettings.provider);
					switch (llmSettings.provider) {
						case "openai":
							model = createOpenAI(commonOptions)(llmSettings.model);
							break;
						case "mistral":
							model = createMistral(commonOptions)(llmSettings.model);
							break;
						default:
							model = createAnthropic(commonOptions)(llmSettings.model);
							break;
					}

					const { text } = await generateText({
						model,
						prompt: `${prompt.instruction}\n\n${prompt.fileContent}`,
						maxOutputTokens: 256,
					});

					return { text };
				} catch (error) {
					console.error("LLM Request Failed:", error);
					return { text: "" };
				}
			},
		});

		// Register with editor
		const registration = registerCompletion(
			monacoRef.current,
			editorRef.current,
			{
				language: language,
				trigger: "onTyping",
				technologies: ["nodejs", "typescript", "javascript", "algorithm"],
				requestHandler: async ({ body }) => {
					const completion = await copilot.complete({
						body,
					});

					console.log("completion", completion.completion);
					return {
						completion: completion.completion,
					};
				},
			},
		);

		completionRegistrationRef.current = registration;

		return () => {
			registration.deregister();
			completionRegistrationRef.current = null;
		};
	}, [llmSettings, language, isEditorReady]);

	const handleEditorDidMount: EditorProps["onMount"] = (
		editor: monaco.editor.IStandaloneCodeEditor,
		monaco,
	) => {
		editorRef.current = editor;
		monacoRef.current = monaco;
		setIsEditorReady(true);

		// Initialize Monaco Model Service
		monacoModelService.initialize(monaco);

		// Configure TypeScript module resolution
		monacoModelService.configureTypeScriptModuleResolution();

		// Sync all files with Monaco models
		// Note: Models are sufficient for TypeScript to resolve types,
		// no need for virtual libs which would cause duplicate declarations
		monacoModelService.syncModels(files, fileContents);

		// 通知父组件编辑器已挂载
		if (onEditorMounted) {
			onEditorMounted(editor);
		}

		// 监听 markers 变化
		const updateMarkers = () => {
			const model = editor.getModel();
			if (model) {
				const currentMarkers = monaco.editor.getModelMarkers({
					resource: model.uri,
				});
				if (onMarkersChange) {
					onMarkersChange(currentMarkers);
				}
			}
		};

		// 初始化 markers
		updateMarkers();

		// 智能轮询策略：
		// 1. 用户输入后短时间内高频轮询（100ms）
		// 2. 一段时间无输入后降低频率（1000ms）
		// 3. 长时间无输入后停止轮询
		let pollTimer: NodeJS.Timeout | null = null;
		let activePollInterval: NodeJS.Timeout | null = null;

		const startActivePolling = () => {
			// 清除之前的轮询
			if (activePollInterval) {
				clearInterval(activePollInterval);
			}
			if (pollTimer) {
				clearTimeout(pollTimer);
			}

			// Store refs for cleanup on unmount
			markerPollTimersRef.current = { pollTimer: null, activePollInterval: null };

			// 高频轮询：用户正在输入，每 100ms 检查一次
			activePollInterval = setInterval(() => {
				updateMarkers();
			}, 100);
			markerPollTimersRef.current.activePollInterval = activePollInterval;

			// 2秒后降低频率
			pollTimer = setTimeout(() => {
				markerPollTimersRef.current.pollTimer = null;
				if (activePollInterval) {
					clearInterval(activePollInterval);
				}

				// 降低频率：每 500ms 检查一次
				activePollInterval = setInterval(() => {
					updateMarkers();
				}, 500);
				markerPollTimersRef.current.activePollInterval = activePollInterval;

				// 再过 3 秒停止轮询
				pollTimer = setTimeout(() => {
					markerPollTimersRef.current.pollTimer = null;
					if (activePollInterval) {
						clearInterval(activePollInterval);
						activePollInterval = null;
					}
				}, 3000);
			}, 2000);
		};

		// 监听内容变化，启动智能轮询
		editor.onDidChangeModelContent(() => {
			startActivePolling();
		});

		// 启动初始轮询
		startActivePolling();
		markerPollTimersRef.current = { pollTimer, activePollInterval };

		// 检测是否为移动设备
		const isMobile = window.innerWidth < 768;

		// 配置编辑器选项
		editor.updateOptions({
			fontSize,
			fontFamily: 'Monaco, "Courier New", monospace',
			lineNumbers: isMobile ? "off" : "on",
			roundedSelection: false,
			scrollBeyondLastLine: false,
			readOnly,
			minimap: { enabled: !isMobile },
			wordWrap: "on",
			automaticLayout: true,
			tabSize: 2,
			insertSpaces: true,
			detectIndentation: false,
			folding: !isMobile,
			lineDecorationsWidth: isMobile ? 5 : 10,
			lineNumbersMinChars: isMobile ? 2 : 3,
			glyphMargin: false,
			contextmenu: !isMobile,
			mouseWheelZoom: !isMobile,
			smoothScrolling: true,
			cursorBlinking: "blink",
			cursorSmoothCaretAnimation: "on",
			renderLineHighlight: "line",
			selectOnLineNumbers: !isMobile,
			matchBrackets: "always",
			autoClosingBrackets: "always",
			autoClosingQuotes: "always",
			autoSurround: "languageDefined",
			formatOnPaste: true,
			formatOnType: true,
			// 启用快捷键支持
			quickSuggestions: true,
			quickSuggestionsDelay: 100,
			parameterHints: {
				enabled: true,
			},
			suggestOnTriggerCharacters: true,
			acceptSuggestionOnCommitCharacter: true,
			acceptSuggestionOnEnter: "on",
			wordBasedSuggestions: "currentDocument",
			// 移动设备优化
			scrollbar: {
				vertical: isMobile ? "hidden" : "auto",
				horizontal: isMobile ? "hidden" : "auto",
				verticalScrollbarSize: isMobile ? 8 : 14,
				horizontalScrollbarSize: isMobile ? 8 : 14,
			},
			// 触摸设备优化
			multiCursorModifier: isMobile ? "ctrlCmd" : "alt",
			accessibilitySupport: "auto",
		});

		// Load custom type definitions from external file
		fetch("/monaco-types.d.ts")
			.then((response) => response.text())
			.then((sourceCode) => {
				monaco.languages.typescript.typescriptDefaults.addExtraLib(
					sourceCode,
					"interface.d.ts",
				);
				monaco.languages.typescript.javascriptDefaults.addExtraLib(
					sourceCode,
					"interface.d.ts",
				);
			})
			.catch((error) => {
				console.warn("Failed to load custom type definitions:", error);
			});

		// 添加常用快捷键
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
			// Ctrl/Cmd + S: 保存 (触发onChange来保存内容)
			const currentValue = editor.getValue();
			onChange(currentValue);
		});

		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, () => {
			// Ctrl/Cmd + A: 全选
			editor.setSelection(
				editor.getModel()?.getFullModelRange() ||
					new monaco.Selection(1, 1, 1, 1),
			);
		});

		// 运行代码快捷键 (Ctrl/Cmd + Enter)
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			// 触发运行代码的事件，让Home组件处理语言检测
			const runEvent = new CustomEvent("monaco-run-code", {
				detail: {
					code: editor.getValue(),
					// 从文件路径推断语言类型，更可靠
					language:
						filePath.endsWith(".ts") || filePath.endsWith(".tsx")
							? "typescript"
							: "javascript",
				},
			});
			window.dispatchEvent(runEvent);
		});

		// F1: 打开命令面板 (Monaco默认支持)
		// Ctrl/Cmd + /: 注释/取消注释 (Monaco默认支持)
		// Ctrl/Cmd + D: 选择下一个相同的词 (Monaco默认支持)
		// Alt + Up/Down: 移动行 (Monaco默认支持)
		// Shift + Alt + Up/Down: 复制行 (Monaco默认支持)
	};

	// 更新编辑器配置当props改变时
	useEffect(() => {
		if (editorRef.current) {
			editorRef.current.updateOptions({ fontSize });
		}
	}, [fontSize]);

	// 监听窗口大小变化，动态调整编辑器配置
	useEffect(() => {
		const handleResize = () => {
			if (editorRef.current) {
				const isMobile = window.innerWidth < 768;
				editorRef.current.updateOptions({
					lineNumbers: isMobile ? "off" : "on",
					minimap: { enabled: !isMobile },
					folding: !isMobile,
					lineDecorationsWidth: isMobile ? 5 : 10,
					lineNumbersMinChars: isMobile ? 2 : 3,
					contextmenu: !isMobile,
					mouseWheelZoom: !isMobile,
					selectOnLineNumbers: !isMobile,
					scrollbar: {
						vertical: isMobile ? "hidden" : "auto",
						horizontal: isMobile ? "hidden" : "auto",
						verticalScrollbarSize: isMobile ? 8 : 14,
						horizontalScrollbarSize: isMobile ? 8 : 14,
					},
					multiCursorModifier: isMobile ? "ctrlCmd" : "alt",
				});
				// 触发布局重新计算
				editorRef.current.layout();
			}
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// 监听文件系统变化，同步 Monaco Models
	useEffect(() => {
		if (monacoRef.current && isEditorReady) {
			// Sync models when files or contents change
			// Models provide sufficient type information for TypeScript resolution
			monacoModelService.syncModels(files, fileContents);
		}
	}, [files, fileContents, isEditorReady]);

	return (
		<div className="h-full w-full rounded-lg overflow-hidden border border-border/50 bg-background">
			<Editor
				height="100%"
				language={language}
				value={value}
				theme={theme}
				onChange={onChange}
				onMount={handleEditorDidMount}
				path={filePath}
				options={{
					selectOnLineNumbers: true,
					automaticLayout: true,
				}}
				loading={
					<div className="flex items-center justify-center h-full">
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="text-muted-foreground"
						>
							{t("codeEditor.loadingEditor")}
						</motion.div>
					</div>
				}
			/>

			{createPortal(
				<TooltipProvider>
					<AnimatePresence>
						<Tooltip>
							<TooltipTrigger asChild>
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: 10 }}
									transition={{ duration: 0.2 }}
								>
									<Badge
										variant="secondary"
										className="text-xs font-medium absolute right-2 bottom-2 cursor-pointer hover:opacity-80 transition-opacity bg-background/80 backdrop-blur-sm border border-border/50"
										onClick={toggleLlmEnabled}
									>
										LLM:
										{!!editorRef.current &&
										!!monacoRef.current &&
										!!llmSettings.apiKey &&
										!!llmSettings.model &&
										llmSettings.enabled ? (
											<span className="text-green-600 dark:text-green-400 ml-1 font-medium">
												Active
											</span>
										) : (
											<span className="text-muted-foreground ml-1">
												{llmSettings.enabled ? "Inactive" : "Disabled"}
											</span>
										)}
									</Badge>
								</motion.div>
							</TooltipTrigger>
							{inactiveReason && (
								<TooltipContent>
									<p>{inactiveReason}</p>
								</TooltipContent>
							)}
						</Tooltip>
					</AnimatePresence>
				</TooltipProvider>,
				document.body,
			)}
		</div>
	);
}
