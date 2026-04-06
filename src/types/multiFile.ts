// 多文件功能相关的类型定义

// 文件信息接口
export interface FileInfo {
	id: string;
	name: string;
	path: string; // 文件完整路径
	type: "file";
	parentId: string | null; // null表示根目录
	content: string;
	language: "javascript" | "typescript";
	size: number;
	createdAt: number;
	updatedAt: number;
	isModified: boolean;
	folderId?: string | null;
	treeMode?: "general" | "binary";
}

// 文件夹信息接口
export interface FolderInfo {
	id: string;
	name: string;
	parentId: string | null;
	createdAt: number;
	isExpanded: boolean;
	type: "folder";
	children: string[]; // 子文件和文件夹的ID列表
}

// 打开的标签页接口
export interface OpenTab {
	fileId: string;
	fileName: string;
	filePath: string;
	isDirty: boolean;
	isActive: boolean;
	isPinned?: boolean;
}

// 创建文件请求接口
export interface CreateFileRequest {
	name: string;
	language: "javascript" | "typescript";
	content?: string;
	folderId?: string;
	parentId?: string | null;
}

// 创建文件夹请求接口
export interface CreateFolderRequest {
	name: string;
	parentId?: string;
}

// 多文件状态接口
export interface MultiFileState {
	// 文件系统
	files: Record<string, FileInfo>;
	folders: Record<string, FolderInfo>;
	fileContents: Record<string, string>;

	// 会话状态
	activeFileId: string | null;
	openTabs: OpenTab[];

	// UI状态
	isFileExplorerOpen: boolean;
	fileExplorerWidth: number;
	expandedFolders: Set<string>;

	// 搜索和过滤
	searchQuery: string;
	filteredFiles: string[];
}

// 多文件操作接口
export interface MultiFileActions {
	// 文件操作
	createFile: (request: CreateFileRequest) => Promise<FileInfo>;
	deleteFile: (fileId: string) => Promise<void>;
	renameFile: (fileId: string, newName: string) => Promise<void>;
	duplicateFile: (fileId: string, newName?: string) => Promise<FileInfo>;

	// 文件内容操作
	updateFileContent: (fileId: string, content: string) => void;
	saveFile: (fileId: string) => Promise<void>;
	saveAllFiles: () => Promise<void>;

	// 文件导航
	openFile: (fileId: string) => void;
	closeFile: (fileId: string) => void;
	switchToFile: (fileId: string) => void;

	// 标签页管理
	closeTab: (fileId: string) => void;
	closeAllTabs: () => void;
	closeOtherTabs: (keepFileId: string) => void;

	// 文件夹操作
	createFolder: (request: CreateFolderRequest) => Promise<FolderInfo>;
	deleteFolder: (folderId: string) => Promise<void>;
	renameFolder: (folderId: string, newName: string) => Promise<void>;

	// 导入导出
	exportFile: (fileId: string) => Promise<Blob>;
	exportAllFiles: () => Promise<Blob>;
	importFiles: (files: File[]) => Promise<FileInfo[]>;

	// UI状态管理
	toggleFileExplorer: () => void;
	setFileExplorerWidth: (width: number) => void;
	toggleFolderExpansion: (folderId: string) => void;
	setSearchQuery: (query: string) => void;
}

// 存储键名常量
export const MULTI_FILE_STORAGE_KEYS = {
	FILES: "playground_files",
	FOLDERS: "playground_folders",
	FILE_CONTENTS: "playground_file_contents",
	SESSION_STATE: "playground_session",
	UI_STATE: "playground_ui_state",
} as const;

// 默认代码内容
export const DEFAULT_CODE_TEMPLATES = {
	javascript: `// Welcome to AlgoPad!
// Write your JavaScript code here and click "Run" to execute

console.log('Hello, JavaScript!');

// Example: Basic algorithm practice
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log('Fibonacci(10):', fibonacci(10));
`,
	typescript: `// Welcome to AlgoPad!
// Write your TypeScript code here and click "Run" to execute

console.log('Hello, TypeScript!');

// Example: Basic algorithm practice with types
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log('Fibonacci(10):', fibonacci(10));
`,
} as const;
