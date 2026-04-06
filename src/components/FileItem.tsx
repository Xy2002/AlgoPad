import type React from "react";
import type { FileInfo } from "@/types/multiFile";
import InlineRenameInput from "./InlineRenameInput";
import FileIcon from "./ui/FileIcon";

interface FileItemProps {
	file: FileInfo;
	isSelected: boolean;
	isDirty: boolean;
	level: number;
	isRenaming?: boolean;
	onClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onCommitRename?: (newName: string) => void;
	onCancelRename?: () => void;
}

export default function FileItem({
	file,
	isSelected,
	isDirty,
	level,
	isRenaming,
	onClick,
	onContextMenu,
	onCommitRename,
	onCancelRename,
}: FileItemProps) {
	// 计算缩进
	const paddingLeft = 12 + level * 16;

	if (isRenaming) {
		return (
			<div
				className="flex items-center px-2 py-1 bg-background border border-primary rounded-sm"
				style={{ paddingLeft: `${paddingLeft}px` }}
			>
				{/* 文件图标 */}
				<div className="flex-shrink-0 mr-2">
					<FileIcon fileName={file.name} className="w-4 h-4" />
				</div>

				{/* 内联重命名输入 */}
				<InlineRenameInput
					value={file.name}
					onCommit={onCommitRename ?? (() => {})}
					onCancel={onCancelRename ?? (() => {})}
				/>

				{/* 修改状态指示器 */}
				{isDirty && (
					<div className="flex-shrink-0 ml-2">
						<div
							className="w-2 h-2 bg-destructive rounded-full"
							title="文件已修改"
						/>
					</div>
				)}
			</div>
		);
	}

	return (
		<button
			type="button"
			data-file-id={file.id}
			className={`flex items-center px-2 py-1 cursor-pointer transition-colors group w-full text-left ${
				isSelected
					? "bg-primary text-primary-foreground"
					: "text-foreground hover:bg-accent"
			}`}
			style={{ paddingLeft: `${paddingLeft}px` }}
			onClick={onClick}
			onContextMenu={onContextMenu}
		>
			{/* 文件图标 */}
			<div className="flex-shrink-0 mr-2">
				<FileIcon fileName={file.name} className="w-4 h-4" />
			</div>

			{/* 文件名 */}
			<span className="flex-1 text-sm truncate">{file.name}</span>

			{/* 修改状态指示器 */}
			{isDirty && (
				<div className="flex-shrink-0 ml-2">
					<div
						className="w-2 h-2 bg-destructive rounded-full"
						title="文件已修改"
					/>
				</div>
			)}
		</button>
	);
}
