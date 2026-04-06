import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlaygroundStore } from "@/store/usePlaygroundStore";
import FileContextMenu from "./FileContextMenu";
import FileSearchBox from "./FileSearchBox";
import FileTree, { type RenamingItem } from "./FileTree";

interface FileExplorerProps {
	isOpen: boolean;
	onToggle: () => void;
}

const INVALID_CHARS_REGEX = /[<>:"/\\|?*]/;

export default function FileExplorer({ isOpen, onToggle }: FileExplorerProps) {
	const { t } = useTranslation();
	const [searchQuery, setSearchQuery] = useState("");
	const [renamingItem, setRenamingItem] = useState<RenamingItem | null>(null);
	const treeRef = useRef<HTMLDivElement>(null);

	const [contextMenu, setContextMenu] = useState<{
		isOpen: boolean;
		position: { x: number; y: number };
		itemId: string;
		itemType: "file" | "folder";
	}>({ isOpen: false, position: { x: 0, y: 0 }, itemId: "", itemType: "file" });

	const {
		files,
		folders,
		expandedFolders,
		activeFileId,
		openFile,
		toggleFolderExpansion,
		renameFile,
		renameFolder,
	} = usePlaygroundStore();

	const handleFileSelect = (fileId: string) => {
		openFile(fileId);
	};

	const handleFolderToggle = (folderId: string) => {
		toggleFolderExpansion(folderId);
	};

	const handleContextMenu = (
		e: React.MouseEvent,
		itemId: string,
		itemType: "file" | "folder",
	) => {
		e.preventDefault();
		setContextMenu({
			isOpen: true,
			position: { x: e.clientX, y: e.clientY },
			itemId,
			itemType,
		});
	};

	const handleCloseContextMenu = () => {
		setContextMenu((prev) => ({ ...prev, isOpen: false }));
	};

	const handleStartRename = useCallback(
		(id: string, type: "file" | "folder") => {
			const name = type === "file" ? files[id]?.name : folders[id]?.name;
			if (!name) return;
			setRenamingItem({ id, type, originalName: name });
		},
		[files, folders],
	);

	const handleCancelRename = useCallback(() => {
		setRenamingItem(null);
	}, []);

	const handleCommitRename = useCallback(
		async (newName: string) => {
			if (!renamingItem) return;

			// Validate
			if (INVALID_CHARS_REGEX.test(newName)) {
				// Briefly flash — keep editing. For now just don't commit.
				return;
			}

			// Check duplicate in same folder
			if (renamingItem.type === "file") {
				const file = files[renamingItem.id];
				if (!file) {
					setRenamingItem(null);
					return;
				}
				if (
					Object.values(files).some(
						(f) =>
							f.id !== file.id &&
							f.name === newName &&
							f.parentId === file.parentId,
					)
				) {
					// Duplicate name — don't commit
					return;
				}
			} else {
				const folder = folders[renamingItem.id];
				if (!folder) {
					setRenamingItem(null);
					return;
				}
				if (
					Object.values(folders).some(
						(f) =>
							f.id !== folder.id &&
							f.name === newName &&
							f.parentId === folder.parentId,
					)
				) {
					return;
				}
			}

			try {
				if (renamingItem.type === "file") {
					await renameFile(renamingItem.id, newName);
				} else {
					await renameFolder(renamingItem.id, newName);
				}
			} catch (error) {
				console.error("Rename failed:", error);
			}

			setRenamingItem(null);
		},
		[renamingItem, files, folders, renameFile, renameFolder],
	);

	// F2 keyboard handler
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key !== "F2" || renamingItem) return;

			const active = document.activeElement;
			if (!active) return;

			// Find the closest file/folder item button
			const button = (active as HTMLElement).closest(
				"button[data-file-id], button[data-folder-id]",
			);
			if (!button) return;

			e.preventDefault();

			const fileId = button.getAttribute("data-file-id");
			const folderId = button.getAttribute("data-folder-id");

			if (fileId) {
				handleStartRename(fileId, "file");
			} else if (folderId) {
				handleStartRename(folderId, "folder");
			}
		},
		[renamingItem, handleStartRename],
	);

	if (!isOpen) {
		return (
			<div className="w-10 bg-muted/30 flex flex-col">
				<div className="p-2 flex items-center justify-center">
					<Button
						variant="ghost"
						size="sm"
						onClick={onToggle}
						className="w-6 h-6 p-0"
						title={t("fileExplorer.expand")}
					>
						<ChevronRight className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col relative h-full bg-muted/30 border-r border-border">
			{/* Header */}
			<div className="px-3 py-2 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
					<span className="text-xs font-medium text-muted-foreground">
						{t("fileExplorer.title")}
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={onToggle}
					className="w-6 h-6 p-0"
					title={t("fileExplorer.collapse")}
				>
					<ChevronLeft className="w-3.5 h-3.5" />
				</Button>
			</div>

			{/* Search Box */}
			<div className="px-2 pb-2">
				<FileSearchBox
					value={searchQuery}
					onChange={setSearchQuery}
					placeholder={t("fileExplorer.searchPlaceholder")}
				/>
			</div>

			{/* File Tree */}
			<div
				className="flex-1 min-h-0"
				role="tree"
				onKeyDown={handleKeyDown}
				ref={treeRef}
			>
				<ScrollArea className="h-full">
					<FileTree
						files={files}
						folders={folders}
						expandedFolders={expandedFolders}
						selectedFileId={activeFileId}
						searchQuery={searchQuery}
						renamingItem={renamingItem}
						onFileSelect={handleFileSelect}
						onFolderToggle={handleFolderToggle}
						onContextMenu={handleContextMenu}
						onStartRename={handleStartRename}
						onCommitRename={handleCommitRename}
						onCancelRename={handleCancelRename}
					/>
				</ScrollArea>
			</div>

			{/* Context Menu */}
			<FileContextMenu
				isOpen={contextMenu.isOpen}
				position={contextMenu.position}
				targetId={contextMenu.itemId}
				targetType={contextMenu.itemType}
				onClose={handleCloseContextMenu}
				onStartRename={(id, type) => {
					handleCloseContextMenu();
					handleStartRename(id, type);
				}}
			/>
		</div>
	);
}
