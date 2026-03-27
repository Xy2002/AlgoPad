import type * as monaco from "monaco-editor";
import type { FileInfo } from "@/types/multiFile";

/**
 * Monaco Model Service
 * Manages multiple Monaco editor models for multi-file support
 */
export class MonacoModelService {
	private monaco: typeof monaco | null = null;
	private models = new Map<string, monaco.editor.ITextModel>();
	private extraLibDisposables = new Map<string, monaco.IDisposable>();

	/**
	 * Initialize the service with Monaco instance
	 */
	initialize(monacoInstance: typeof monaco) {
		this.monaco = monacoInstance;
	}

	/**
	 * Check if a model is still valid (not disposed)
	 */
	private isModelAlive(model: monaco.editor.ITextModel): boolean {
		try {
			return !model.isDisposed();
		} catch {
			return false;
		}
	}

	/**
	 * Create or update a model for a file
	 */
	createOrUpdateModel(
		fileId: string,
		content: string,
		file: FileInfo,
	): monaco.editor.ITextModel | null {
		if (!this.monaco) {
			console.warn("Monaco not initialized");
			return null;
		}

		// Check if model already exists and is still valid
		const existingModel = this.models.get(fileId);
		if (existingModel && this.isModelAlive(existingModel)) {
			// Update existing model content
			if (existingModel.getValue() !== content) {
				existingModel.setValue(content);
			}
			return existingModel;
		}

		// Clean up stale reference to a disposed model
		if (existingModel) {
			this.models.delete(fileId);
		}

		// Determine language from file extension
		const language = this.getLanguageFromFile(file);

		// Create URI for the model (Monaco uses file:// URIs)
		// Ensure path doesn't start with / to avoid double slashes
		const normalizedPath = file.path.startsWith("/")
			? file.path.substring(1)
			: file.path;
		const uri = this.monaco.Uri.parse(`file:///${normalizedPath}`);

		// Check if a model with this URI already exists
		const existingModelByUri = this.monaco.editor.getModel(uri);
		if (existingModelByUri) {
			// Update content and store reference
			if (existingModelByUri.getValue() !== content) {
				existingModelByUri.setValue(content);
			}
			this.models.set(fileId, existingModelByUri);
			return existingModelByUri;
		}

		// Create new model
		const model = this.monaco.editor.createModel(content, language, uri);
		this.models.set(fileId, model);

		return model;
	}

	/**
	 * Get model by file ID
	 */
	getModel(fileId: string): monaco.editor.ITextModel | undefined {
		return this.models.get(fileId);
	}

	/**
	 * Delete model for a file
	 */
	deleteModel(fileId: string): void {
		const model = this.models.get(fileId);
		if (model) {
			model.dispose();
			this.models.delete(fileId);
		}
	}

	/**
	 * Update model content
	 */
	updateModelContent(fileId: string, content: string): void {
		const model = this.models.get(fileId);
		if (model && this.isModelAlive(model) && model.getValue() !== content) {
			model.setValue(content);
		}
	}

	/**
	 * Sync all files with models
	 * Creates models for new files and removes models for deleted files
	 */
	syncModels(
		files: Record<string, FileInfo>,
		fileContents: Record<string, string>,
	): void {
		if (!this.monaco) return;

		// Get current file IDs
		const currentFileIds = new Set(Object.keys(files));

		// Remove models for deleted files or disposed models
		for (const [fileId, model] of this.models.entries()) {
			if (!currentFileIds.has(fileId) || !this.isModelAlive(model)) {
				if (this.isModelAlive(model)) {
					model.dispose();
				}
				this.models.delete(fileId);
			}
		}

		// Create or update models for all files
		for (const [fileId, file] of Object.entries(files)) {
			const content = fileContents[fileId] || "";
			this.createOrUpdateModel(fileId, content, file);
		}
	}

	/**
	 * Get all models
	 */
	getAllModels(): Map<string, monaco.editor.ITextModel> {
		return this.models;
	}

	/**
	 * Dispose all models and extra libs
	 */
	disposeAll(): void {
		for (const model of this.models.values()) {
			model.dispose();
		}
		this.models.clear();

		for (const disposable of this.extraLibDisposables.values()) {
			disposable.dispose();
		}
		this.extraLibDisposables.clear();
	}

	/**
	 * Get language from file info
	 */
	private getLanguageFromFile(file: FileInfo): string {
		// Use the language field from FileInfo
		return file.language;
	}

	/**
	 * Add extra lib for TypeScript definitions
	 * This allows Monaco to understand imported modules
	 */
	addExtraLib(content: string, filePath: string): monaco.IDisposable | null {
		if (!this.monaco) return null;

		// Remove old lib if it exists
		const oldDisposable = this.extraLibDisposables.get(filePath);
		if (oldDisposable) {
			oldDisposable.dispose();
		}

		// Add new lib and track it
		const disposable =
			this.monaco.languages.typescript.typescriptDefaults.addExtraLib(
				content,
				filePath,
			);

		this.extraLibDisposables.set(filePath, disposable);
		return disposable;
	}

	/**
	 * Configure TypeScript compiler options for module resolution
	 */
	configureTypeScriptModuleResolution(): void {
		if (!this.monaco) return;

		// Configure TypeScript compiler options
		this.monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
			target: this.monaco.languages.typescript.ScriptTarget.ES2020,
			allowNonTsExtensions: true,
			moduleResolution:
				this.monaco.languages.typescript.ModuleResolutionKind.NodeJs,
			module: this.monaco.languages.typescript.ModuleKind.ESNext,
			noEmit: true,
			esModuleInterop: true,
			jsx: this.monaco.languages.typescript.JsxEmit.React,
			reactNamespace: "React",
			allowJs: true,
			typeRoots: ["node_modules/@types"],
			// Enable module resolution without file extensions
			allowImportingTsExtensions: false,
			resolveJsonModule: true,
			// Allow relative imports without extensions
			paths: {},
			baseUrl: "file:///",
		});

		// Configure diagnostics
		this.monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
			noSemanticValidation: false,
			noSyntaxValidation: false,
			onlyVisible: false,
			diagnosticCodesToIgnore: [
				2451, // Cannot redeclare block-scoped variable
				2300, // Duplicate identifier
				2307, // Cannot find module (we'll handle this differently)
			],
		});
	}

	/**
	 * Create virtual lib entries for all files
	 * This allows TypeScript to resolve imports between files
	 */
	createVirtualLibs(
		files: Record<string, FileInfo>,
		fileContents: Record<string, string>,
	): void {
		if (!this.monaco) return;

		// Track which paths we're currently creating
		const currentPaths = new Set<string>();

		for (const [fileId, file] of Object.entries(files)) {
			const content = fileContents[fileId] || "";

			// Only add TypeScript/JavaScript files as extra libs
			if (file.language === "typescript" || file.language === "javascript") {
				// Normalize path (remove leading slash if present)
				const normalizedPath = file.path.startsWith("/")
					? file.path.substring(1)
					: file.path;

				// Create virtual path without extension for import resolution
				const pathWithoutExt = normalizedPath.replace(/\.(ts|js|tsx|jsx)$/, "");

				// Track paths we're adding
				const pathWithExt = `file:///${normalizedPath}`;
				const pathWithoutExtFull = `file:///${pathWithoutExt}`;

				currentPaths.add(pathWithExt);
				currentPaths.add(pathWithoutExtFull);

				// Add with and without extension (addExtraLib handles deduplication)
				this.addExtraLib(content, pathWithExt);
				this.addExtraLib(content, pathWithoutExtFull);
			}
		}

		// Remove extra libs for files that no longer exist
		for (const [path, disposable] of this.extraLibDisposables.entries()) {
			if (!currentPaths.has(path)) {
				disposable.dispose();
				this.extraLibDisposables.delete(path);
			}
		}
	}
}

// Singleton instance
export const monacoModelService = new MonacoModelService();
