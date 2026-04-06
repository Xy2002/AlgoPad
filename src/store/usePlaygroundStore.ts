import { create } from "zustand";
import type { ExecutionResult } from "@/services/codeExecutionService";
import { dataExportService } from "@/services/dataExportService";
import { fileManager } from "@/services/fileManager";
import {
	type CreateFileRequest,
	type CreateFolderRequest,
	type FileInfo,
	type FolderInfo,
	MULTI_FILE_STORAGE_KEYS,
	type MultiFileState,
	type OpenTab,
} from "@/types/multiFile";

export interface UserSettings {
	theme: "vs-dark" | "vs";
	appTheme: "light" | "dark" | "system";
	fontSize: number;
	language: "javascript" | "typescript";
	autoSave: boolean;
	indentSize: 2 | 4;
}

export type LlmProvider = "openai" | "anthropic" | "mistral";

export interface LlmSettings {
	provider: LlmProvider;
	apiUrl: string;
	apiKey: string;
	model: string;
	enabled: boolean;
}

export interface CodeContent {
	id: string;
	content: string;
	language: "javascript" | "typescript";
	lastModified: Date;
}

interface PlaygroundState extends MultiFileState {
	// 代码内容 (保持向后兼容)
	code: string;
	codeHistory: {
		javascript: string;
		typescript: string;
	};
	language: "javascript" | "typescript";

	// 用户设置
	settings: UserSettings;
	llmSettings: LlmSettings;

	// 执行状态
	isExecuting: boolean;
	executionResult: ExecutionResult | null;

	// 复杂度分析状态
	isAnalyzingComplexity: boolean;
	complexityResult:
		| import("@/services/complexityAnalysisService").ComplexityResult
		| null;
	showComplexityVisualization: boolean;

	// 递归追踪状态
	traceStepIndex: number;
	traceIsPlaying: boolean;
	tracePlaySpeed: number;

	// Actions (保持向后兼容)
	setCode: (code: string) => void;
	setLanguage: (language: "javascript" | "typescript") => void;
	updateSettings: (settings: Partial<UserSettings>) => void;
	updateLlmSettings: (settings: Partial<LlmSettings>) => void;
	toggleLlmEnabled: () => void;
	setExecuting: (isExecuting: boolean) => void;
	setExecutionResult: (result: ExecutionResult | null) => void;
	clearOutput: () => void;
	resetToDefault: () => void;
	clearAllState: () => void;

	// 复杂度分析 Actions
	setAnalyzingComplexity: (isAnalyzing: boolean) => void;
	setComplexityResult: (
		result:
			| import("@/services/complexityAnalysisService").ComplexityResult
			| null,
	) => void;
	toggleComplexityVisualization: () => void;

	// 递归追踪 Actions
	setTraceStepIndex: (index: number) => void;
	setTraceIsPlaying: (playing: boolean) => void;
	setTracePlaySpeed: (speed: number) => void;

	// 持久化
	loadFromStorage: () => void;
	saveToStorage: () => void;

	// 多文件操作
	initializeMultiFileSystem: () => void;
	createFile: (request: CreateFileRequest) => Promise<FileInfo>;
	deleteFile: (fileId: string) => Promise<void>;
	renameFile: (fileId: string, newName: string) => Promise<void>;
	duplicateFile: (fileId: string, newName?: string) => Promise<FileInfo>;
	updateFileContent: (fileId: string, content: string) => void;
	setFileTreeMode: (fileId: string, mode: "general" | "binary") => void;
	saveFile: (fileId: string) => Promise<void>;
	saveAllFiles: () => Promise<void>;
	openFile: (fileId: string) => void;
	closeFile: (fileId: string) => void;
	switchToFile: (fileId: string) => void;
	createFolder: (request: CreateFolderRequest) => Promise<FolderInfo>;
	deleteFolder: (folderId: string) => Promise<void>;
	renameFolder: (folderId: string, newName: string) => Promise<void>;
	toggleFileExplorer: () => void;
	setFileExplorerWidth: (width: number) => void;
	toggleFolderExpansion: (folderId: string) => void;
	setSearchQuery: (query: string) => void;
	clearSearch: () => void;

	// 标签页管理
	closeTab: (fileId: string) => void;
	closeAllTabs: () => void;
	closeOtherTabs: (fileId: string) => void;

	// 数据导出/导入
	exportData: (includeLlmSettings?: boolean) => void;
	importData: (
		data: import("@/services/dataExportService").ExportData,
		options?: import("@/services/dataExportService").ImportOptions,
	) => Promise<void>;
}

const STORAGE_KEYS = {
	SETTINGS: "playground_settings",
	LLM_SETTINGS: "playground_llm_settings",
	CODE_CONTENT_JS: "playground_code_javascript",
	CODE_CONTENT_TS: "playground_code_typescript",
	LANGUAGE: "playground_language",
	// 多文件存储键名
	...MULTI_FILE_STORAGE_KEYS,
};

const defaultSettings: UserSettings = {
	theme: "vs-dark",
	appTheme: "system",
	fontSize: 14,
	language: "javascript",
	autoSave: true,
	indentSize: 2,
};

const defaultLlmSettings: LlmSettings = {
	provider: "anthropic",
	apiUrl: "https://api.anthropic.com/v1/messages",
	apiKey: "",
	model: "claude-3-5-sonnet-20240620",
	enabled: true,
};

const defaultCode = {
	javascript: `// Welcome to AlgoPad!
// Write your JavaScript code here and click "Run" to execute

console.log('Hello, JavaScript!');

// Detect cycle in LinkedList (Floyd's Cycle Detection)
function hasCycle(head) {
  console.log('hasCycle called with:', head);
  if (!head || !head.next) {
    console.log('hasCycle returning false for empty/single node');
    return false;
  }
  
  let slow = head;
  let fast = head.next;
  
  while (fast && fast.next) {
    if (slow === fast) {
      console.log('hasCycle detected cycle');
      return true;
    }
    slow = slow.next;
    fast = fast.next.next;
  }
  
  console.log('hasCycle no cycle detected');
  return false;
}

// Create a cycle for testing (connects tail to head)
function createCycle(head) {
  console.log('createCycle called with:', head);
  if (!head) {
    console.log('createCycle returning null head');
    return head;
  }
  
  let current = head;
  while (current.next) {
    current = current.next;
  }
  current.next = head; // Create cycle
  console.log('createCycle completed - cycle created');
  return head;
}

// Example: Test the ListNode functionality
console.log('=== Normal LinkedList ===');
const arr = [1, 2, 3, 4, 5];
console.log('Original array:', arr);

let listNode = null;
try {
  listNode = arrayToListNode(arr);
  console.log('Created ListNode:', listNode);

  const backToArray = listNodeToArray(listNode);
  console.log('Converted back to array:', backToArray);
} catch (error) {
  console.error('Error in normal LinkedList operations:', error.message);
}

// Example: Test cycle detection
console.log('\n=== Cycle Detection ===');
try {
  console.log('Normal list has cycle:', hasCycle(listNode));

  // Create a cyclic list
  const cyclicList = createCycle(arrayToListNode([1, 2, 3]));
  console.log('Cyclic list has cycle:', hasCycle(cyclicList));
  console.log('Cyclic list (safely displayed):', cyclicList);
} catch (error) {
  console.error('Error in cycle detection:', error.message);
}
`,
	typescript: `// Welcome to AlgoPad!
// Write your TypeScript code here and click "Run" to execute

console.log('Hello, TypeScript!');

// Example: Test the pre-defined ListNode functionality
console.log('=== Normal LinkedList ===');
const arr: number[] = [1, 2, 3, 4, 5];
console.log('Original array:', arr);

let listNode: ListNode | null = null;
try {
  listNode = arrayToListNode(arr);
  console.log('Created ListNode:', listNode);

  const backToArray = listNodeToArray(listNode);
  console.log('Converted back to array:', backToArray);
} catch (error) {
  console.error('Error in normal LinkedList operations:', error.message);
}

// Example: Test cycle detection with TypeScript types
function hasCycle(head: ListNode | null): boolean {
  if (!head || !head.next) return false;
  
  let slow: ListNode | null = head;
  let fast: ListNode | null = head.next;
  
  while (fast && fast.next) {
    if (slow === fast) return true;
    slow = slow.next;
    fast = fast.next.next;
  }
  
  return false;
}

// Create a cycle for testing
function createCycle(head: ListNode | null): ListNode | null {
  if (!head) return head;
  
  let current = head;
  while (current.next) {
    current = current.next;
  }
  current.next = head; // Create cycle
  return head;
}

console.log('\\n=== Cycle Detection ===');
try {
  console.log('Normal list has cycle:', hasCycle(listNode));

  // Create a cyclic list - safely displayed by our console implementation
  const cyclicList = createCycle(arrayToListNode([1, 2, 3]));
  console.log('Cyclic list has cycle:', hasCycle(cyclicList));
  console.log('Cyclic list (safely displayed):', cyclicList);
} catch (error) {
  console.error('Error in cycle detection:', error.message);
}

// ListNode, arrayToListNode, and listNodeToArray are available via IntelliSense!`,
};

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
	// 初始状态 (保持向后兼容)
	code: defaultCode.javascript,
	codeHistory: {
		javascript: defaultCode.javascript,
		typescript: defaultCode.typescript,
	},
	language: "javascript",
	settings: defaultSettings,
	llmSettings: defaultLlmSettings,
	isExecuting: false,
	executionResult: null,

	// 复杂度分析初始状态
	isAnalyzingComplexity: false,
	complexityResult: null,
	showComplexityVisualization: false,

	// 递归追踪初始状态
	traceStepIndex: 0,
	traceIsPlaying: false,
	tracePlaySpeed: 500,

	// 多文件系统状态
	files: {},
	folders: {},
	fileContents: {},
	activeFileId: null,
	openTabs: [],
	isFileExplorerOpen: true,
	fileExplorerWidth: 250,
	expandedFolders: new Set(),
	searchQuery: "",
	filteredFiles: [],

	// Actions
	setCode: (code: string) => {
		const { language, codeHistory } = get();
		set({
			code,
			codeHistory: {
				...codeHistory,
				[language]: code,
			},
		});
		const { settings, saveToStorage } = get();
		if (settings.autoSave) {
			saveToStorage();
		}
	},

	setLanguage: (language: "javascript" | "typescript") => {
		const { codeHistory, language: currentLanguage } = get();

		// 保存当前语言的代码到历史记录
		const updatedHistory = {
			...codeHistory,
			[currentLanguage]: get().code,
		};

		// 切换到新语言，并加载对应的代码
		set({
			language,
			code: updatedHistory[language],
			codeHistory: updatedHistory,
		});

		get().saveToStorage();
	},

	updateSettings: (newSettings: Partial<UserSettings>) => {
		set((state) => ({
			settings: { ...state.settings, ...newSettings },
		}));
		get().saveToStorage();
	},

	updateLlmSettings: (newLlmSettings: Partial<LlmSettings>) => {
		set((state) => ({
			llmSettings: { ...state.llmSettings, ...newLlmSettings },
		}));
		get().saveToStorage();
	},

	toggleLlmEnabled: () => {
		set((state) => ({
			llmSettings: {
				...state.llmSettings,
				enabled: !state.llmSettings.enabled,
			},
		}));
		get().saveToStorage();
	},

	setExecuting: (isExecuting: boolean) => {
		set({ isExecuting });
	},

	setExecutionResult: (result: ExecutionResult | null) => {
		set({ executionResult: result });
	},

	clearOutput: () => {
		set({ executionResult: null });
	},

	// 复杂度分析 Actions
	setAnalyzingComplexity: (isAnalyzing: boolean) => {
		set({ isAnalyzingComplexity: isAnalyzing });
	},

	setComplexityResult: (
		result:
			| import("@/services/complexityAnalysisService").ComplexityResult
			| null,
	) => {
		set({ complexityResult: result });
	},

	toggleComplexityVisualization: () => {
		set((state) => ({
			showComplexityVisualization: !state.showComplexityVisualization,
		}));
	},

	// 递归追踪 Actions
	setTraceStepIndex: (index: number) => {
		set({ traceStepIndex: index });
	},

	setTraceIsPlaying: (playing: boolean) => {
		set({ traceIsPlaying: playing });
	},

	setTracePlaySpeed: (speed: number) => {
		set({ tracePlaySpeed: speed });
	},

	resetToDefault: () => {
		const { language, codeHistory } = get();
		const defaultCodeForLanguage = defaultCode[language];

		set({
			code: defaultCodeForLanguage,
			codeHistory: {
				...codeHistory,
				[language]: defaultCodeForLanguage,
			},
		});

		const { settings, saveToStorage } = get();
		if (settings.autoSave) {
			saveToStorage();
		}
	},

	clearAllState: () => {
		// 清除所有localStorage数据
		Object.values(STORAGE_KEYS).forEach((key) => {
			localStorage.removeItem(key);
		});

		// 重置到默认状态
		set({
			// 代码内容 (保持向后兼容)
			code: defaultCode.javascript,
			codeHistory: {
				javascript: defaultCode.javascript,
				typescript: defaultCode.typescript,
			},
			language: "javascript",

			// 用户设置
			settings: defaultSettings,
			llmSettings: defaultLlmSettings,

			// 执行状态
			isExecuting: false,
			executionResult: null,

			// 复杂度分析状态
			isAnalyzingComplexity: false,
			complexityResult: null,
			showComplexityVisualization: false,

			// 递归追踪状态
			traceStepIndex: 0,
			traceIsPlaying: false,
			tracePlaySpeed: 500,

			// 多文件系统状态
			files: {},
			folders: {},
			fileContents: {},
			activeFileId: null,
			openTabs: [],
			isFileExplorerOpen: true,
			fileExplorerWidth: 250,
			expandedFolders: new Set(),
			searchQuery: "",
			filteredFiles: [],
		});

		// 重新初始化多文件系统
		setTimeout(() => {
			get().initializeMultiFileSystem();
		}, 0);
	},

	// 从localStorage加载数据
	loadFromStorage: () => {
		console.log("[loadFromStorage] Called at", new Date().toISOString());
		try {
			// 加载设置
			const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
			console.log("[loadFromStorage] Found settings:", !!savedSettings);
			if (savedSettings) {
				const settings = JSON.parse(savedSettings);
				set((state) => ({
					settings: { ...state.settings, ...settings },
				}));
			}

			// 加载语言设置
			const savedLanguage = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
			const language =
				savedLanguage &&
				(savedLanguage === "javascript" || savedLanguage === "typescript")
					? savedLanguage
					: "javascript";

			// 加载两种语言的代码内容
			const savedJSCode = localStorage.getItem(STORAGE_KEYS.CODE_CONTENT_JS);
			const savedTSCode = localStorage.getItem(STORAGE_KEYS.CODE_CONTENT_TS);

			let jsCode = defaultCode.javascript;
			let tsCode = defaultCode.typescript;

			const savedLLMSetting = localStorage.getItem(STORAGE_KEYS.LLM_SETTINGS);
			if (savedLLMSetting) {
				try {
					const llmSettings = JSON.parse(savedLLMSetting);
					set((state) => ({
						llmSettings: { ...state.llmSettings, ...llmSettings },
					}));
				} catch (error) {
					// 如果解析失败，使用默认设置
					console.warn(
						"Failed to parse saved LLM settings, using default:",
						error,
					);
				}
			}

			if (savedJSCode) {
				try {
					const jsCodeData = JSON.parse(savedJSCode);
					if (jsCodeData.content && typeof jsCodeData.content === "string") {
						jsCode = jsCodeData.content;
					}
				} catch (error) {
					// 如果解析失败，使用默认代码
					console.warn("Failed to parse saved JS code, using default:", error);
				}
			}

			if (savedTSCode) {
				try {
					const tsCodeData = JSON.parse(savedTSCode);
					if (tsCodeData.content && typeof tsCodeData.content === "string") {
						tsCode = tsCodeData.content;
					}
				} catch (error) {
					// 如果解析失败，使用默认代码
					console.warn("Failed to parse saved TS code, using default:", error);
				}
			}

			set({
				language,
				code: language === "javascript" ? jsCode : tsCode,
				codeHistory: {
					javascript: jsCode,
					typescript: tsCode,
				},
			});

			// 初始化多文件系统
			get().initializeMultiFileSystem();
		} catch (error) {
			console.error("Failed to load from storage:", error);
			// 如果加载失败，使用默认值
			set({
				settings: defaultSettings,
				llmSettings: defaultLlmSettings,
				language: "javascript",
				code: defaultCode.javascript,
				codeHistory: {
					javascript: defaultCode.javascript,
					typescript: defaultCode.typescript,
				},
			});

			// 即使加载失败也要初始化多文件系统
			get().initializeMultiFileSystem();
		}
	},

	// 保存到localStorage
	saveToStorage: () => {
		console.log("[saveToStorage] Called at", new Date().toISOString());
		console.trace("[saveToStorage] Call stack");
		try {
			const {
				settings,
				codeHistory,
				language,
				files,
				folders,
				fileContents,
				llmSettings,
			} = get();

			console.log("[saveToStorage] Saving state:", {
				settingsCount: Object.keys(settings).length,
				filesCount: Object.keys(files).length,
				foldersCount: Object.keys(folders).length,
				contentsCount: Object.keys(fileContents).length,
			});

			// 保存设置
			localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));

			// 保存语言
			localStorage.setItem(STORAGE_KEYS.LANGUAGE, language);

			// 保存LLM设置
			localStorage.setItem(
				STORAGE_KEYS.LLM_SETTINGS,
				JSON.stringify(llmSettings),
			);

			// 分别保存两种语言的代码内容 (向后兼容)
			const jsCodeData = {
				content: codeHistory.javascript,
				language: "javascript",
				lastModified: new Date().toISOString(),
			};
			const tsCodeData = {
				content: codeHistory.typescript,
				language: "typescript",
				lastModified: new Date().toISOString(),
			};

			localStorage.setItem(
				STORAGE_KEYS.CODE_CONTENT_JS,
				JSON.stringify(jsCodeData),
			);
			localStorage.setItem(
				STORAGE_KEYS.CODE_CONTENT_TS,
				JSON.stringify(tsCodeData),
			);

			// 保存多文件系统数据
			fileManager.saveFiles(files);
			fileManager.saveFolders(folders);
			fileManager.saveFileContents(fileContents);

			// 保存会话状态
			const { activeFileId, openTabs } = get();
			const sessionState = {
				activeFileId,
				openTabs: openTabs.map((tab) => ({
					fileId: tab.fileId,
					fileName: tab.fileName,
					filePath: tab.filePath,
					isDirty: tab.isDirty,
					isActive: tab.isActive,
				})),
			};
			localStorage.setItem(
				STORAGE_KEYS.SESSION_STATE,
				JSON.stringify(sessionState),
			);

			// 保存UI状态
			const { isFileExplorerOpen, fileExplorerWidth, expandedFolders } = get();
			const uiState = {
				isFileExplorerOpen,
				fileExplorerWidth,
				expandedFolders: Array.from(expandedFolders),
			};
			localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(uiState));
		} catch (error) {
			console.error("Failed to save to storage:", error);
		}
	},

	// 多文件系统初始化
	initializeMultiFileSystem: () => {
		console.log(
			"[initializeMultiFileSystem] Called at",
			new Date().toISOString(),
		);
		try {
			// 加载现有数据
			const files = fileManager.loadFiles();
			const folders = fileManager.loadFolders();
			const fileContents = fileManager.loadFileContents();

			console.log("[initializeMultiFileSystem] Loaded data:", {
				filesCount: Object.keys(files).length,
				foldersCount: Object.keys(folders).length,
				contentsCount: Object.keys(fileContents).length,
			});

			// 加载会话状态
			let sessionState = null;
			try {
				const savedSessionState = localStorage.getItem(
					STORAGE_KEYS.SESSION_STATE,
				);
				if (savedSessionState) {
					sessionState = JSON.parse(savedSessionState);
				}
			} catch (error) {
				console.warn("Failed to load session state:", error);
			}

			// 加载UI状态
			let uiState = null;
			try {
				const savedUiState = localStorage.getItem(STORAGE_KEYS.UI_STATE);
				if (savedUiState) {
					uiState = JSON.parse(savedUiState);
				}
			} catch (error) {
				console.warn("Failed to load UI state:", error);
			}

			// 如果没有数据，创建默认工作空间
			if (
				Object.keys(files).length === 0 &&
				Object.keys(folders).length === 0
			) {
				console.log(
					"[initializeMultiFileSystem] No existing data found, creating default workspace",
				);
				const defaultWorkspace = fileManager.createDefaultWorkspace();
				console.log("[initializeMultiFileSystem] Default workspace created:", {
					filesCount: Object.keys(defaultWorkspace.files).length,
					foldersCount: Object.keys(defaultWorkspace.folders).length,
				});
				set({
					files: defaultWorkspace.files,
					folders: defaultWorkspace.folders,
					fileContents: defaultWorkspace.fileContents,
					activeFileId: Object.keys(defaultWorkspace.files)[0] || null,
					openTabs: [],
					isFileExplorerOpen: uiState?.isFileExplorerOpen ?? true,
					fileExplorerWidth: uiState?.fileExplorerWidth ?? 250,
					expandedFolders: new Set(uiState?.expandedFolders || []),
				});

				// 保存默认工作空间
				fileManager.saveFiles(defaultWorkspace.files);
				fileManager.saveFolders(defaultWorkspace.folders);
				fileManager.saveFileContents(defaultWorkspace.fileContents);
			} else {
				// 验证会话状态中的文件是否仍然存在
				let validOpenTabs: OpenTab[] = [];
				let validActiveFileId: string | null = null;

				if (sessionState?.openTabs) {
					validOpenTabs = sessionState.openTabs.filter(
						(tab: OpenTab) => files[tab.fileId] !== undefined,
					);
				}

				if (sessionState?.activeFileId && files[sessionState.activeFileId]) {
					validActiveFileId = sessionState.activeFileId;
				} else if (validOpenTabs.length > 0) {
					validActiveFileId = validOpenTabs[0].fileId;
				}

				set({
					files,
					folders,
					fileContents,
					activeFileId: validActiveFileId,
					openTabs: validOpenTabs,
					isFileExplorerOpen: uiState?.isFileExplorerOpen ?? true,
					fileExplorerWidth: uiState?.fileExplorerWidth ?? 250,
					expandedFolders: new Set(uiState?.expandedFolders || []),
				});
			}
		} catch (error) {
			console.error("Failed to initialize multi-file system:", error);
			// 创建默认工作空间作为后备
			const defaultWorkspace = fileManager.createDefaultWorkspace();
			set({
				files: defaultWorkspace.files,
				folders: defaultWorkspace.folders,
				fileContents: defaultWorkspace.fileContents,
				activeFileId: Object.keys(defaultWorkspace.files)[0] || null,
				openTabs: [],
				isFileExplorerOpen: true,
				fileExplorerWidth: 250,
				expandedFolders: new Set(),
			});
		}
	},

	// 创建文件
	createFile: async (request: CreateFileRequest) => {
		const { files, folders, fileContents, expandedFolders } = get();

		try {
			const newFile = await fileManager.createFile(request, files);
			const updatedFiles = { ...files, [newFile.id]: newFile };
			const updatedContents = {
				...fileContents,
				[newFile.id]: request.content || "",
			};

			// 更新父文件夹的children数组
			const updatedFolders = { ...folders };
			if (newFile.parentId && updatedFolders[newFile.parentId]) {
				updatedFolders[newFile.parentId] = {
					...updatedFolders[newFile.parentId],
					children: [...updatedFolders[newFile.parentId].children, newFile.id],
				};
			}

			// 自动展开父文件夹，确保新建的文件可见
			const updatedExpanded = new Set(expandedFolders);
			if (newFile.parentId) {
				updatedExpanded.add(newFile.parentId);
			}

			set({
				files: updatedFiles,
				folders: updatedFolders,
				fileContents: updatedContents,
				expandedFolders: updatedExpanded,
			});

			// 保存到存储
			fileManager.saveFiles(updatedFiles);
			fileManager.saveFileContents(updatedContents);

			return newFile;
		} catch (error) {
			console.error("Failed to create file:", error);
			throw error;
		}
	},

	// 删除文件
	deleteFile: async (fileId: string) => {
		const { files, fileContents, openTabs, activeFileId } = get();

		if (!files[fileId]) {
			throw new Error("File not found");
		}

		try {
			// 删除文件数据
			const updatedFiles = { ...files };
			const updatedContents = { ...fileContents };
			delete updatedFiles[fileId];
			delete updatedContents[fileId];

			// 关闭相关标签
			const updatedTabs = openTabs.filter((tab) => tab.fileId !== fileId);

			// 如果删除的是当前活跃文件，切换到其他文件
			let newActiveFileId = activeFileId;
			if (activeFileId === fileId) {
				newActiveFileId = updatedTabs.length > 0 ? updatedTabs[0].fileId : null;
			}

			set({
				files: updatedFiles,
				fileContents: updatedContents,
				openTabs: updatedTabs,
				activeFileId: newActiveFileId,
			});

			// 保存到存储
			fileManager.saveFiles(updatedFiles);
			fileManager.saveFileContents(updatedContents);
		} catch (error) {
			console.error("Failed to delete file:", error);
			throw error;
		}
	},

	// 重命名文件
	renameFile: async (fileId: string, newName: string) => {
		const { files } = get();

		try {
			const updatedFile = await fileManager.renameFile(fileId, newName, files);
			const updatedFiles = { ...files, [fileId]: updatedFile };

			set({ files: updatedFiles });

			// 保存到存储
			fileManager.saveFiles(updatedFiles);
		} catch (error) {
			console.error("Failed to rename file:", error);
			throw error;
		}
	},

	// 复制文件
	duplicateFile: async (fileId: string, newName?: string) => {
		const { files, fileContents } = get();

		try {
			const duplicatedFile = await fileManager.duplicateFile(
				fileId,
				files,
				newName,
			);
			const originalContent =
				fileContents[fileId] || files[fileId]?.content || "";

			const updatedFiles = { ...files, [duplicatedFile.id]: duplicatedFile };
			const updatedContents = {
				...fileContents,
				[duplicatedFile.id]: originalContent,
			};

			set({
				files: updatedFiles,
				fileContents: updatedContents,
			});

			// 保存到存储
			fileManager.saveFiles(updatedFiles);
			fileManager.saveFileContents(updatedContents);

			return duplicatedFile;
		} catch (error) {
			console.error("Failed to duplicate file:", error);
			throw error;
		}
	},

	// 更新文件内容
	updateFileContent: (fileId: string, content: string) => {
		const { files, fileContents, settings } = get();

		if (!files[fileId]) {
			console.warn("File not found:", fileId);
			return;
		}

		const updatedContents = { ...fileContents, [fileId]: content };
		const updatedFiles = {
			...files,
			[fileId]: {
				...files[fileId],
				updatedAt: Date.now(),
				size: content.length,
				isModified: true,
			},
		};

		set({
			fileContents: updatedContents,
			files: updatedFiles,
		});

		// 自动保存
		if (settings.autoSave) {
			get().saveFile(fileId);
		}
	},

	setFileTreeMode: (fileId: string, mode: "general" | "binary") => {
		const { files } = get();
		const file = files[fileId];
		if (!file) return;
		set({
			files: {
				...files,
				[fileId]: { ...file, treeMode: mode, updatedAt: Date.now() },
			},
		});
	},

	// 保存单个文件
	saveFile: async (fileId: string) => {
		const { files, fileContents } = get();

		if (!files[fileId]) {
			throw new Error("File not found");
		}

		try {
			const content = fileContents[fileId] || "";
			const updatedFiles = {
				...files,
				[fileId]: {
					...files[fileId],
					content,
					updatedAt: Date.now(),
					size: content.length,
					isModified: false,
				},
			};

			set({ files: updatedFiles });

			// 保存到存储
			fileManager.saveFiles(updatedFiles);
			fileManager.saveFileContents(fileContents);
		} catch (error) {
			console.error("Failed to save file:", error);
			throw error;
		}
	},

	// 保存所有文件
	saveAllFiles: async () => {
		const { files, fileContents } = get();

		try {
			const updatedFiles = { ...files };

			// 更新所有文件的保存状态
			Object.keys(updatedFiles).forEach((fileId) => {
				const content = fileContents[fileId] || "";
				updatedFiles[fileId] = {
					...updatedFiles[fileId],
					content,
					updatedAt: Date.now(),
					size: content.length,
					isModified: false,
				};
			});

			set({ files: updatedFiles });

			// 保存到存储
			fileManager.saveFiles(updatedFiles);
			fileManager.saveFileContents(fileContents);
		} catch (error) {
			console.error("Failed to save all files:", error);
			throw error;
		}
	},

	// 向后兼容的文件操作方法
	openFile: (fileId: string) => {
		const { files, openTabs } = get();

		if (!files[fileId]) {
			console.warn("File not found:", fileId);
			return;
		}

		// 检查标签是否已经打开
		const existingTab = openTabs.find((tab) => tab.fileId === fileId);
		if (existingTab) {
			set({ activeFileId: fileId });
			return;
		}

		// 创建新标签
		const newTab: OpenTab = {
			fileId,
			fileName: files[fileId].name,
			filePath: files[fileId].path,
			isDirty: files[fileId].isModified || false,
			isActive: true,
		};

		// 更新所有标签为非活跃状态
		const updatedTabs = openTabs.map((tab) => ({ ...tab, isActive: false }));
		updatedTabs.push(newTab);

		set({
			openTabs: updatedTabs,
			activeFileId: fileId,
		});
	},

	closeFile: (fileId: string) => {
		const { openTabs, activeFileId } = get();

		const updatedTabs = openTabs.filter((tab) => tab.fileId !== fileId);

		// 如果关闭的是当前活跃标签，切换到其他标签
		let newActiveFileId = activeFileId;
		if (activeFileId === fileId) {
			if (updatedTabs.length > 0) {
				// 找到被关闭标签的索引，切换到相邻标签
				const closedTabIndex = openTabs.findIndex(
					(tab) => tab.fileId === fileId,
				);
				const nextIndex = Math.min(closedTabIndex, updatedTabs.length - 1);
				newActiveFileId = updatedTabs[nextIndex]?.fileId || null;
			} else {
				newActiveFileId = null;
			}
		}

		set({
			openTabs: updatedTabs,
			activeFileId: newActiveFileId,
		});
	},

	switchToFile: (fileId: string) => {
		const { openTabs } = get();

		// 更新标签活跃状态
		const updatedTabs = openTabs.map((tab) => ({
			...tab,
			isActive: tab.fileId === fileId,
		}));

		set({
			openTabs: updatedTabs,
			activeFileId: fileId,
		});
	},

	// 设置活跃文件 (别名方法，用于向后兼容)
	setActiveFile: (fileId: string) => {
		get().switchToFile(fileId);
	},

	// 文件夹操作
	createFolder: async (request: CreateFolderRequest) => {
		const { folders, expandedFolders } = get();

		try {
			const newFolder = await fileManager.createFolder(request, folders);
			const updatedFolders = { ...folders, [newFolder.id]: newFolder };

			// 更新父文件夹的children数组
			if (newFolder.parentId && updatedFolders[newFolder.parentId]) {
				updatedFolders[newFolder.parentId] = {
					...updatedFolders[newFolder.parentId],
					children: [
						...updatedFolders[newFolder.parentId].children,
						newFolder.id,
					],
				};
			}

			// 自动展开父文件夹，确保新建的文件夹可见
			const updatedExpanded = new Set(expandedFolders);
			if (newFolder.parentId) {
				updatedExpanded.add(newFolder.parentId);
			}

			set({
				folders: updatedFolders,
				expandedFolders: updatedExpanded,
			});

			// 保存到存储
			fileManager.saveFolders(updatedFolders);

			return newFolder;
		} catch (error) {
			console.error("Failed to create folder:", error);
			throw error;
		}
	},

	deleteFolder: async (folderId: string) => {
		const { folders, files, fileContents, openTabs, activeFileId } = get();

		if (!folders[folderId]) {
			throw new Error("Folder not found");
		}

		try {
			// 获取要删除的文件和文件夹列表
			const { filesToDelete, foldersToDelete } = fileManager.getItemsToDelete(
				folderId,
				folders,
				files,
			);

			// 删除文件夹和文件
			const updatedFolders = { ...folders };
			const updatedFiles = { ...files };
			const updatedContents = { ...fileContents };

			foldersToDelete.forEach((id) => {
				delete updatedFolders[id];
			});
			filesToDelete.forEach((id) => {
				delete updatedFiles[id];
				delete updatedContents[id];
			});

			// 关闭相关标签
			const updatedTabs = openTabs.filter(
				(tab) => !filesToDelete.includes(tab.fileId),
			);

			// 如果当前活跃文件被删除，切换到其他文件
			let newActiveFileId = activeFileId;
			if (activeFileId && filesToDelete.includes(activeFileId)) {
				newActiveFileId = updatedTabs.length > 0 ? updatedTabs[0].fileId : null;
			}

			set({
				folders: updatedFolders,
				files: updatedFiles,
				fileContents: updatedContents,
				openTabs: updatedTabs,
				activeFileId: newActiveFileId,
			});

			// 保存到存储
			fileManager.saveFolders(updatedFolders);
			fileManager.saveFiles(updatedFiles);
			fileManager.saveFileContents(updatedContents);
		} catch (error) {
			console.error("Failed to delete folder:", error);
			throw error;
		}
	},

	renameFolder: async (folderId: string, newName: string) => {
		const { folders } = get();

		try {
			const updatedFolder = await fileManager.renameFolder(
				folderId,
				newName,
				folders,
			);
			const updatedFolders = { ...folders, [folderId]: updatedFolder };

			set({ folders: updatedFolders });

			// 保存到存储
			fileManager.saveFolders(updatedFolders);
		} catch (error) {
			console.error("Failed to rename folder:", error);
			throw error;
		}
	},

	// 文件浏览器状态管理
	toggleFileExplorer: () => {
		const { isFileExplorerOpen } = get();
		set({ isFileExplorerOpen: !isFileExplorerOpen });
	},

	setFileExplorerWidth: (width: number) => {
		set({ fileExplorerWidth: Math.max(200, Math.min(600, width)) });
	},

	toggleFolderExpansion: (folderId: string) => {
		const { expandedFolders } = get();
		const updatedExpanded = new Set(expandedFolders);

		if (updatedExpanded.has(folderId)) {
			updatedExpanded.delete(folderId);
		} else {
			updatedExpanded.add(folderId);
		}

		set({ expandedFolders: updatedExpanded });
	},

	// 搜索功能
	setSearchQuery: (query: string) => {
		const { files } = get();

		let filteredFiles: string[] = [];
		if (query.trim()) {
			filteredFiles = Object.keys(files).filter((fileId) => {
				const file = files[fileId];
				return (
					file.name.toLowerCase().includes(query.toLowerCase()) ||
					file.path.toLowerCase().includes(query.toLowerCase())
				);
			});
		}

		set({
			searchQuery: query,
			filteredFiles,
		});
	},

	clearSearch: () => {
		set({
			searchQuery: "",
			filteredFiles: [],
		});
	},

	// 标签页管理
	openTab: (fileId: string) => {
		get().openFile(fileId);
	},

	closeTab: (fileId: string) => {
		get().closeFile(fileId);
	},

	switchTab: (fileId: string) => {
		get().switchToFile(fileId);
	},

	closeAllTabs: () => {
		set({
			openTabs: [],
			activeFileId: null,
		});
	},

	closeOtherTabs: (keepFileId: string) => {
		const { openTabs } = get();

		const tabToKeep = openTabs.find((tab) => tab.fileId === keepFileId);
		if (tabToKeep) {
			set({
				openTabs: [{ ...tabToKeep, isActive: true }],
				activeFileId: keepFileId,
			});
		}
	},

	// 数据导出
	exportData: (includeLlmSettings = false) => {
		const {
			codeHistory,
			language,
			settings,
			llmSettings,
			files,
			folders,
			fileContents,
			activeFileId,
			openTabs,
			isFileExplorerOpen,
			fileExplorerWidth,
			expandedFolders,
		} = get();

		const exportedData = dataExportService.exportData(
			codeHistory,
			language,
			settings,
			llmSettings,
			files,
			folders,
			fileContents,
			activeFileId,
			openTabs,
			{
				isFileExplorerOpen,
				fileExplorerWidth,
				expandedFolders,
			},
			includeLlmSettings,
		);

		dataExportService.downloadAsJson(exportedData);
	},

	// 数据导入
	importData: async (
		data: import("@/services/dataExportService").ExportData,
		options: import("@/services/dataExportService").ImportOptions = {
			includeLlmSettings: false,
			mergeStrategy: "overwrite",
			preserveCurrentSettings: false,
		},
	) => {
		try {
			// 数据已经在 importFromFile 中验证过，这里直接应用
			// 根据选项应用导入的数据
			const updates: Partial<PlaygroundState> = {};

			// 代码历史
			if (data.codeHistory) {
				updates.codeHistory = data.codeHistory;
				updates.code =
					data.language === "javascript"
						? data.codeHistory.javascript
						: data.codeHistory.typescript;
			}

			// 语言
			if (data.language) {
				updates.language = data.language;
			}

			// 用户设置
			if (!options.preserveCurrentSettings && data.settings) {
				updates.settings = data.settings;
			}

			// LLM设置
			if (options.includeLlmSettings && data.llmSettings) {
				updates.llmSettings = data.llmSettings;
				console.log("Importing LLM settings:", data.llmSettings);
			} else {
				console.log(
					"LLM settings not imported:",
					options.includeLlmSettings ? "Option enabled" : "Option disabled",
					data.llmSettings ? "Data available" : "Data not available",
				);
			}

			// 多文件系统
			if (data.files && data.folders && data.fileContents) {
				if (options.mergeStrategy === "overwrite") {
					updates.files = data.files;
					updates.folders = data.folders;
					updates.fileContents = data.fileContents;
				} else if (options.mergeStrategy === "merge") {
					const { files, folders, fileContents } = get();
					updates.files = { ...files, ...data.files };
					updates.folders = { ...folders, ...data.folders };
					updates.fileContents = { ...fileContents, ...data.fileContents };
				}
				// "skip" 策略不更新文件系统
			}

			// 会话状态
			if (data.activeFileId !== undefined) {
				updates.activeFileId = data.activeFileId;
			}
			if (data.openTabs) {
				updates.openTabs = data.openTabs;
			}

			// UI状态
			if (data.uiState) {
				updates.isFileExplorerOpen = data.uiState.isFileExplorerOpen;
				updates.fileExplorerWidth = data.uiState.fileExplorerWidth;
				updates.expandedFolders = new Set(data.uiState.expandedFolders);
			}

			// 应用更新
			set(updates);

			// 保存到localStorage
			get().saveToStorage();

			console.log("Data imported successfully");
		} catch (error) {
			console.error("Failed to import data:", error);
			throw error;
		}
	},
}));
