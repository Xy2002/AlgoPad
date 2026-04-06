import {
	type CreateFileRequest,
	type CreateFolderRequest,
	DEFAULT_CODE_TEMPLATES,
	type FileInfo,
	type FolderInfo,
	MULTI_FILE_STORAGE_KEYS,
} from "@/types/multiFile";

/**
 * 文件管理服务类
 * 提供文件系统的抽象层，处理文件和文件夹的CRUD操作
 */
export class FileManager {
	private static instance: FileManager;

	private constructor() {}

	/**
	 * 获取FileManager单例实例
	 */
	public static getInstance(): FileManager {
		if (!FileManager.instance) {
			FileManager.instance = new FileManager();
		}
		return FileManager.instance;
	}

	/**
	 * 生成唯一ID
	 */
	private generateId(): string {
		return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * 生成文件路径
	 */
	private generateFilePath(fileName: string, parentId: string | null): string {
		if (!parentId) {
			return `/${fileName}`;
		}

		// 这里简化处理，实际应该递归构建完整路径
		return `/workspace/${fileName}`;
	}

	/**
	 * 从文件扩展名推断语言类型
	 */
	private inferLanguageFromExtension(
		fileName: string,
	): "javascript" | "typescript" {
		const extension = fileName.split(".").pop()?.toLowerCase();
		return extension === "ts" ? "typescript" : "javascript";
	}

	/**
	 * 验证文件名
	 */
	private validateFileName(name: string): boolean {
		if (!name || name.trim().length === 0) return false;
		// 检查非法字符
		const invalidChars = /[<>:"/\\|?*]/;
		return !invalidChars.test(name);
	}

	/**
	 * 验证文件夹名
	 */
	private validateFolderName(name: string): boolean {
		return this.validateFileName(name);
	}

	/**
	 * 从localStorage加载文件数据
	 */
	public loadFiles(): Record<string, FileInfo> {
		try {
			const savedFiles = localStorage.getItem(MULTI_FILE_STORAGE_KEYS.FILES);
			console.log(
				"[FileManager.loadFiles] Storage key:",
				MULTI_FILE_STORAGE_KEYS.FILES,
			);
			console.log("[FileManager.loadFiles] Raw data:", savedFiles);
			if (savedFiles) {
				const files = JSON.parse(savedFiles);
				console.log(
					"[FileManager.loadFiles] Parsed files count:",
					Object.keys(files).length,
				);
				// 确保时间字段为number类型
				Object.values(files).forEach((file: FileInfo) => {
					if (typeof file.createdAt === "string") {
						file.createdAt = new Date(file.createdAt).getTime();
					}
					if (typeof file.updatedAt === "string") {
						file.updatedAt = new Date(file.updatedAt).getTime();
					}
				});
				return files;
			} else {
				console.log(
					"[FileManager.loadFiles] No saved files found in localStorage",
				);
			}
		} catch (error) {
			console.error(
				"[FileManager.loadFiles] Failed to load files from storage:",
				error,
			);
		}
		return {};
	}

	/**
	 * 从localStorage加载文件夹数据
	 */
	public loadFolders(): Record<string, FolderInfo> {
		try {
			const savedFolders = localStorage.getItem(
				MULTI_FILE_STORAGE_KEYS.FOLDERS,
			);
			if (savedFolders) {
				const folders = JSON.parse(savedFolders);
				// 确保时间字段为number类型
				Object.values(folders).forEach((folder: FolderInfo) => {
					if (typeof folder.createdAt === "string") {
						folder.createdAt = new Date(folder.createdAt).getTime();
					}
				});
				return folders;
			}
		} catch (error) {
			console.error("Failed to load folders from storage:", error);
		}
		return {};
	}

	/**
	 * 从localStorage加载文件内容
	 */
	public loadFileContents(): Record<string, string> {
		try {
			const savedContents = localStorage.getItem(
				MULTI_FILE_STORAGE_KEYS.FILE_CONTENTS,
			);
			if (savedContents) {
				return JSON.parse(savedContents);
			}
		} catch (error) {
			console.error("Failed to load file contents from storage:", error);
		}
		return {};
	}

	/**
	 * 保存文件数据到localStorage
	 */
	public saveFiles(files: Record<string, FileInfo>): void {
		try {
			console.log(
				"[FileManager.saveFiles] Saving files count:",
				Object.keys(files).length,
			);
			console.log(
				"[FileManager.saveFiles] Storage key:",
				MULTI_FILE_STORAGE_KEYS.FILES,
			);
			localStorage.setItem(
				MULTI_FILE_STORAGE_KEYS.FILES,
				JSON.stringify(files),
			);
			console.log("[FileManager.saveFiles] Save successful");
		} catch (error) {
			console.error(
				"[FileManager.saveFiles] Failed to save files to storage:",
				error,
			);
			throw new Error("Failed to save files");
		}
	}

	/**
	 * 保存文件夹数据到localStorage
	 */
	public saveFolders(folders: Record<string, FolderInfo>): void {
		try {
			localStorage.setItem(
				MULTI_FILE_STORAGE_KEYS.FOLDERS,
				JSON.stringify(folders),
			);
		} catch (error) {
			console.error("Failed to save folders to storage:", error);
			throw new Error("Failed to save folders");
		}
	}

	/**
	 * 保存文件内容到localStorage
	 */
	public saveFileContents(contents: Record<string, string>): void {
		try {
			localStorage.setItem(
				MULTI_FILE_STORAGE_KEYS.FILE_CONTENTS,
				JSON.stringify(contents),
			);
		} catch (error) {
			console.error("Failed to save file contents to storage:", error);
			throw new Error("Failed to save file contents");
		}
	}

	/**
	 * 创建新文件
	 */
	public async createFile(
		request: CreateFileRequest,
		existingFiles: Record<string, FileInfo>,
	): Promise<FileInfo> {
		// 验证文件名
		if (!this.validateFileName(request.name)) {
			throw new Error("Invalid file name");
		}

		// 检查文件名是否已存在（在同一文件夹内）
		const existingFile = Object.values(existingFiles).find(
			(file) =>
				file.name === request.name && file.parentId === request.parentId,
		);
		if (existingFile) {
			throw new Error("File name already exists in this folder");
		}

		// 推断语言类型
		const language =
			request.language || this.inferLanguageFromExtension(request.name);

		// 生成文件路径
		const path = this.generateFilePath(request.name, request.parentId);

		const _now = Date.now();
		const fileId = this.generateId();
		const content = request.content || DEFAULT_CODE_TEMPLATES[language];

		const newFile: FileInfo = {
			id: fileId,
			name: request.name,
			path,
			type: "file",
			parentId: request.parentId,
			language,
			content,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			size: content.length,
			isModified: false,
		};

		return newFile;
	}

	/**
	 * 创建新文件夹
	 */
	public async createFolder(
		request: CreateFolderRequest,
		existingFolders: Record<string, FolderInfo>,
	): Promise<FolderInfo> {
		// 验证文件夹名
		if (!this.validateFolderName(request.name)) {
			throw new Error("Invalid folder name");
		}

		// 检查文件夹名是否已存在（在同一父文件夹内）
		const existingFolder = Object.values(existingFolders).find(
			(folder) =>
				folder.name === request.name && folder.parentId === request.parentId,
		);
		if (existingFolder) {
			throw new Error("Folder name already exists in this location");
		}

		const folderId = this.generateId();
		const newFolder: FolderInfo = {
			id: folderId,
			name: request.name,
			parentId: request.parentId,
			createdAt: Date.now(),
			isExpanded: true,
			type: "folder",
			children: [],
		};

		return newFolder;
	}

	/**
	 * 重命名文件
	 */
	public async renameFile(
		fileId: string,
		newName: string,
		files: Record<string, FileInfo>,
	): Promise<FileInfo> {
		const file = files[fileId];
		if (!file) {
			throw new Error("File not found");
		}

		if (!this.validateFileName(newName)) {
			throw new Error("Invalid file name");
		}

		// 检查新文件名是否已存在（在同一文件夹内）
		const existingFile = Object.values(files).find(
			(f) =>
				f.id !== fileId && f.name === newName && f.folderId === file.folderId,
		);
		if (existingFile) {
			throw new Error("File name already exists in this folder");
		}

		const updatedFile: FileInfo = {
			...file,
			name: newName,
			language: this.inferLanguageFromExtension(newName),
			path: file.path.replace(/[^/]+$/, newName),
			updatedAt: Date.now(),
			isModified: true,
		};

		return updatedFile;
	}

	/**
	 * 重命名文件夹
	 */
	public async renameFolder(
		folderId: string,
		newName: string,
		folders: Record<string, FolderInfo>,
	): Promise<FolderInfo> {
		const folder = folders[folderId];
		if (!folder) {
			throw new Error("Folder not found");
		}

		if (!this.validateFolderName(newName)) {
			throw new Error("Invalid folder name");
		}

		// 检查新文件夹名是否已存在（在同一父文件夹内）
		const existingFolder = Object.values(folders).find(
			(f) =>
				f.id !== folderId &&
				f.name === newName &&
				f.parentId === folder.parentId,
		);
		if (existingFolder) {
			throw new Error("Folder name already exists in this location");
		}

		const updatedFolder: FolderInfo = {
			...folder,
			name: newName,
		};

		return updatedFolder;
	}

	/**
	 * 复制文件
	 */
	public async duplicateFile(
		fileId: string,
		files: Record<string, FileInfo>,
		newName?: string,
	): Promise<FileInfo> {
		const originalFile = files[fileId];
		if (!originalFile) {
			throw new Error("File not found");
		}

		// 生成新文件名
		let duplicateName = newName;
		if (!duplicateName) {
			const baseName = originalFile.name.replace(/\.[^/.]+$/, ""); // 移除扩展名
			const extension = originalFile.name.includes(".")
				? originalFile.name.split(".").pop()
				: "";
			duplicateName = extension
				? `${baseName}_copy.${extension}`
				: `${baseName}_copy`;

			// 确保文件名唯一
			let counter = 1;
			while (
				Object.values(files).some(
					(f) =>
						f.name === duplicateName && f.parentId === originalFile.parentId,
				)
			) {
				duplicateName = extension
					? `${baseName}_copy${counter}.${extension}`
					: `${baseName}_copy${counter}`;
				counter++;
			}
		}

		// 验证新文件名
		if (!this.validateFileName(duplicateName)) {
			throw new Error("Invalid file name");
		}

		// 生成文件路径
		const path = this.generateFilePath(duplicateName, originalFile.parentId);

		const now = Date.now();
		const newFileId = this.generateId();

		const duplicatedFile: FileInfo = {
			...originalFile,
			id: newFileId,
			name: duplicateName,
			path,
			parentId: originalFile.parentId,
			language: originalFile.language,
			size: originalFile.size,
			createdAt: now,
			updatedAt: now,
			isModified: false,
		};

		return duplicatedFile;
	}

	/**
	 * 删除文件夹及其所有子文件和子文件夹
	 */
	public getFilesAndFoldersToDelete(
		folderId: string,
		files: Record<string, FileInfo>,
		folders: Record<string, FolderInfo>,
	): { filesToDelete: string[]; foldersToDelete: string[] } {
		const filesToDelete: string[] = [];
		const foldersToDelete: string[] = [folderId];

		// 递归查找所有子文件夹
		const findSubFolders = (parentId: string) => {
			Object.values(folders).forEach((folder) => {
				if (folder.parentId === parentId) {
					foldersToDelete.push(folder.id);
					findSubFolders(folder.id);
				}
			});
		};

		findSubFolders(folderId);

		// 查找所有要删除的文件夹中的文件
		Object.values(files).forEach((file) => {
			if (file.folderId && foldersToDelete.includes(file.folderId)) {
				filesToDelete.push(file.id);
			}
		});

		return { filesToDelete, foldersToDelete };
	}

	/**
	 * 获取要删除的文件和文件夹列表（递归）
	 */
	public getItemsToDelete(
		folderId: string,
		folders: Record<string, FolderInfo>,
		files: Record<string, FileInfo>,
	): { filesToDelete: string[]; foldersToDelete: string[] } {
		const filesToDelete: string[] = [];
		const foldersToDelete: string[] = [folderId];

		const collectItems = (currentFolderId: string) => {
			// 收集当前文件夹下的所有文件
			Object.values(files).forEach((file) => {
				if (file.parentId === currentFolderId) {
					filesToDelete.push(file.id);
				}
			});

			// 收集当前文件夹下的所有子文件夹，并递归处理
			Object.values(folders).forEach((folder) => {
				if (folder.parentId === currentFolderId) {
					foldersToDelete.push(folder.id);
					collectItems(folder.id);
				}
			});
		};

		collectItems(folderId);

		return { filesToDelete, foldersToDelete };
	}

	/**
	 * 创建默认工作空间
	 */
	public createDefaultWorkspace(): {
		files: Record<string, FileInfo>;
		folders: Record<string, FolderInfo>;
		fileContents: Record<string, string>;
	} {
		const rootFolderId = this.generateId();
		const jsFileId = this.generateId();
		const tsFileId = this.generateId();

		// 创建根文件夹
		const rootFolder: FolderInfo = {
			id: rootFolderId,
			name: "workspace",
			type: "folder",
			parentId: null,
			isExpanded: true,
			createdAt: Date.now(),
			children: [],
		};

		// 创建示例文件
		const jsFile: FileInfo = {
			id: jsFileId,
			name: "example.js",
			path: "/workspace/example.js",
			type: "file",
			parentId: rootFolderId,
			content: DEFAULT_CODE_TEMPLATES.javascript,
			language: "javascript",
			size: DEFAULT_CODE_TEMPLATES.javascript.length,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			isModified: false,
		};

		const tsFile: FileInfo = {
			id: tsFileId,
			name: "example.ts",
			path: "/workspace/example.ts",
			type: "file",
			parentId: rootFolderId,
			content: DEFAULT_CODE_TEMPLATES.typescript,
			language: "typescript",
			size: DEFAULT_CODE_TEMPLATES.typescript.length,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			isModified: false,
		};

		return {
			files: {
				[jsFileId]: jsFile,
				[tsFileId]: tsFile,
			},
			folders: {
				[rootFolderId]: rootFolder,
			},
			fileContents: {
				[jsFileId]: DEFAULT_CODE_TEMPLATES.javascript,
				[tsFileId]: DEFAULT_CODE_TEMPLATES.typescript,
			},
		};
	}
}

// 导出单例实例
export const fileManager = FileManager.getInstance();
