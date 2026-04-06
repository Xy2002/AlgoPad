import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import type React from "react";
import type { FolderInfo } from "@/types/multiFile";
import InlineRenameInput from "./InlineRenameInput";

interface FolderItemProps {
	folder: FolderInfo;
	isExpanded: boolean;
	childCount: number;
	level: number;
	isRenaming?: boolean;
	onToggle: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onCommitRename?: (newName: string) => void;
	onCancelRename?: () => void;
}

export default function FolderItem({
	folder,
	isExpanded,
	childCount,
	level,
	isRenaming,
	onToggle,
	onContextMenu,
	onCommitRename,
	onCancelRename,
}: FolderItemProps) {
	// 计算缩进
	const paddingLeft = 12 + level * 16;

	if (isRenaming) {
		return (
			<div
				className="flex items-center px-2 py-1 bg-background border border-primary rounded-sm"
				style={{ paddingLeft: `${paddingLeft}px` }}
			>
				{/* 展开/折叠箭头 */}
				<div className="flex-shrink-0 mr-1">
					{isExpanded ? (
						<ChevronDown className="w-4 h-4 text-muted-foreground" />
					) : (
						<ChevronRight className="w-4 h-4 text-muted-foreground" />
					)}
				</div>

				{/* 文件夹图标 */}
				<div className="flex-shrink-0 mr-2">
					<Folder className="w-4 h-4 text-primary" />
				</div>

				{/* 内联重命名输入 */}
				<InlineRenameInput
					value={folder.name}
					onCommit={onCommitRename ?? (() => {})}
					onCancel={onCancelRename ?? (() => {})}
				/>
			</div>
		);
	}

	return (
		<button
			type="button"
			data-folder-id={folder.id}
			className="flex items-center px-2 py-1 cursor-pointer text-foreground hover:bg-accent transition-colors group w-full text-left"
			style={{ paddingLeft: `${paddingLeft}px` }}
			onClick={onToggle}
			onContextMenu={onContextMenu}
		>
			{/* 展开/折叠箭头 */}
			<div className="flex-shrink-0 mr-1">
				{isExpanded ? (
					<ChevronDown className="w-4 h-4 text-muted-foreground" />
				) : (
					<ChevronRight className="w-4 h-4 text-muted-foreground" />
				)}
			</div>

			{/* 文件夹图标 */}
			<div className="flex-shrink-0 mr-2">
				{isExpanded ? (
					<FolderOpen className="w-4 h-4 text-primary" />
				) : (
					<Folder className="w-4 h-4 text-primary" />
				)}
			</div>

			{/* 文件夹名 */}
			<span className="flex-1 text-sm truncate">{folder.name}</span>

			{/* 子项数量 */}
			{childCount > 0 && (
				<span className="flex-shrink-0 ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
					{childCount}
				</span>
			)}
		</button>
	);
}
