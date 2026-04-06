import { X } from "lucide-react";
import type React from "react";
import type { OpenTab } from "@/types/multiFile";
import FileIcon from "./ui/FileIcon";

interface FileTabProps {
	tab: OpenTab;
	isActive: boolean;
	isDirty: boolean;
	onClose: () => void;
	onClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
}

export default function FileTab({
	tab,
	isActive,
	isDirty,
	onClose,
	onClick,
	onContextMenu,
}: FileTabProps) {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	};

	const handleCloseClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onClose();
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: Using div for tab component is semantically correct
		<div
			role="button"
			tabIndex={0}
			className={`relative flex items-center px-3 h-9 cursor-pointer transition-colors group min-w-0 max-w-44 ${
				isActive
					? "text-foreground"
					: "text-muted-foreground hover:text-foreground"
			}`}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			onContextMenu={onContextMenu}
		>
			{/* Active indicator - bottom underline */}
			{isActive && (
				<div className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
			)}

			<div
				className={`flex-shrink-0 mr-1.5 ${
					isActive ? "text-foreground" : "text-muted-foreground"
				}`}
			>
				<FileIcon fileName={tab.fileName} className="w-3.5 h-3.5" />
			</div>

			<span className="flex-1 text-xs truncate">{tab.fileName}</span>

			{isDirty && (
				<div className="flex-shrink-0 ml-1 mr-0.5">
					<div
						className="w-1.5 h-1.5 bg-warning rounded-full"
						title="文件已修改"
					/>
				</div>
			)}

			<button
				type="button"
				onClick={handleCloseClick}
				className={`flex-shrink-0 ml-0.5 p-0.5 rounded-sm transition-colors ${
					isActive
						? "text-muted-foreground hover:text-foreground hover:bg-muted"
						: "text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100"
				}`}
				title="关闭标签"
			>
				<X className="w-3 h-3" />
			</button>
		</div>
	);
}
