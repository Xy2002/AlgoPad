import { Copy, Edit3, FilePlus, FolderPlus, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { usePlaygroundStore } from "../store/usePlaygroundStore";
import { ConfirmDialog } from "./ConfirmDialog";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { InputDialog } from "./InputDialog";

export type FileAction =
	| "newFile"
	| "newFolder"
	| "rename"
	| "delete"
	| "duplicate";

export interface FileContextMenuProps {
	isOpen: boolean;
	position: { x: number; y: number };
	targetId: string;
	targetType: "file" | "folder" | "empty";
	onClose: () => void;
	onAction?: (action: FileAction, targetId: string) => void;
	onStartRename?: (id: string, type: "file" | "folder") => void;
}

type DialogType = "newFile" | "newFolder" | "duplicate" | null;

interface DialogState {
	type: DialogType;
	title: string;
	placeholder: string;
	defaultValue?: string;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
	isOpen,
	position,
	targetId,
	targetType,
	onClose,
	onAction,
	onStartRename,
}) => {
	const {
		createFile,
		createFolder,
		deleteFile,
		deleteFolder,
		duplicateFile,
		files,
		folders,
	} = usePlaygroundStore();

	const [dialogState, setDialogState] = useState<DialogState | null>(null);
	const [confirmState, setConfirmState] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		onConfirm: () => void;
	} | null>(null);

	const handleDialogConfirm = async (value: string) => {
		if (!dialogState) return;

		try {
			switch (dialogState.type) {
				case "newFile": {
					const parentId = targetType === "folder" ? targetId : "root";
					// 根据文件扩展名确定语言类型
					const language =
						value.endsWith(".ts") || value.endsWith(".tsx")
							? "typescript"
							: "javascript";
					await createFile({
						name: value,
						parentId,
						content: "",
						language,
					});
					break;
				}

				case "newFolder": {
					const parentId = targetType === "folder" ? targetId : "root";
					await createFolder({
						name: value,
						parentId,
					});
					break;
				}

				case "duplicate": {
					if (targetType === "file") {
						await duplicateFile(targetId, value);
					}
					break;
				}
			}

			// 调用外部回调
			if (onAction && dialogState.type) {
				onAction(dialogState.type as FileAction, targetId);
			}
		} catch (error) {
			console.error("文件操作失败:", error);
			alert("操作失败，请重试");
		}

		setDialogState(null);
	};

	const handleDialogCancel = () => {
		setDialogState(null);
	};

	const handleAction = async (action: FileAction) => {
		try {
			switch (action) {
				case "newFile": {
					setDialogState({
						type: "newFile",
						title: "新建文件",
						placeholder: "请输入文件名",
					});
					break;
				}

				case "newFolder": {
					setDialogState({
						type: "newFolder",
						title: "新建文件夹",
						placeholder: "请输入文件夹名",
					});
					break;
				}

				case "rename": {
					if (
						onStartRename &&
						(targetType === "file" || targetType === "folder")
					) {
						onStartRename(targetId, targetType);
					}
					break;
				}

				case "delete": {
					const itemName =
						targetType === "file"
							? files[targetId]?.name
							: folders[targetId]?.name;
					const confirmMessage =
						targetType === "file"
							? `确定要删除文件 "${itemName}" 吗？`
							: `确定要删除文件夹 "${itemName}" 及其所有内容吗？`;

					setConfirmState({
						isOpen: true,
						title: "确认删除",
						message: confirmMessage,
						onConfirm: async () => {
							try {
								if (targetType === "file") {
									await deleteFile(targetId);
								} else if (targetType === "folder") {
									await deleteFolder(targetId);
								}
								setConfirmState(null);
							} catch (error) {
								console.error("删除失败:", error);
								alert("删除失败，请重试");
								setConfirmState(null);
							}
						},
					});
					break;
				}

				case "duplicate": {
					if (targetType === "file") {
						const file = files[targetId];
						if (file) {
							setDialogState({
								type: "duplicate",
								title: "复制文件",
								placeholder: "请输入复制文件名",
								defaultValue: `${file.name}_copy`,
							});
						}
					}
					break;
				}
			}

			// 调用外部回调
			if (onAction) {
				onAction(action, targetId);
			}
		} catch (error) {
			console.error("文件操作失败:", error);
			alert("操作失败，请重试");
		}
	};

	const getMenuItems = (): MenuItem[] => {
		const items: MenuItem[] = [];

		// 新建文件和文件夹（适用于文件夹和空白区域）
		if (targetType === "folder" || targetType === "empty") {
			items.push(
				{
					id: "newFile",
					label: "新建文件",
					icon: <FilePlus size={16} />,
					onClick: () => handleAction("newFile"),
				},
				{
					id: "newFolder",
					label: "新建文件夹",
					icon: <FolderPlus size={16} />,
					onClick: () => handleAction("newFolder"),
				},
			);
		}

		// 文件和文件夹的通用操作
		if (targetType === "file" || targetType === "folder") {
			if (items.length > 0) {
				items.push({ id: "separator-1", label: "", separator: true });
			}

			items.push(
				{
					id: "rename",
					label: "重命名",
					icon: <Edit3 size={16} />,
					onClick: () => handleAction("rename"),
				},
				{
					id: "delete",
					label: "删除",
					icon: <Trash2 size={16} />,
					onClick: () => handleAction("delete"),
				},
			);
		}

		// 文件特有操作
		if (targetType === "file") {
			items.push({
				id: "duplicate",
				label: "复制",
				icon: <Copy size={16} />,
				onClick: () => handleAction("duplicate"),
			});
		}

		return items;
	};

	return (
		<>
			<ContextMenu
				isOpen={isOpen}
				position={position}
				items={getMenuItems()}
				onClose={onClose}
			/>

			{dialogState && (
				<InputDialog
					isOpen={true}
					title={dialogState.title}
					placeholder={dialogState.placeholder}
					defaultValue={dialogState.defaultValue}
					onConfirm={handleDialogConfirm}
					onCancel={handleDialogCancel}
				/>
			)}

			{confirmState && (
				<ConfirmDialog
					isOpen={confirmState.isOpen}
					title={confirmState.title}
					message={confirmState.message}
					variant="destructive"
					confirmText="删除"
					cancelText="取消"
					onConfirm={confirmState.onConfirm}
					onCancel={() => setConfirmState(null)}
				/>
			)}
		</>
	);
};

export default FileContextMenu;
