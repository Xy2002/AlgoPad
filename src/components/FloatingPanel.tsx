import { X } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { Rnd } from "react-rnd";
import { Button } from "./ui/button";

interface FloatingPanelProps {
	tabId?: string;
	title: string;
	children: ReactNode;
	x?: number;
	y?: number;
	width: number;
	height: number;
	zIndex?: number;
	onClose: () => void;
	onDragStop?: (tabId: string, x: number, y: number) => void;
	onResizeStop?: (tabId: string, width: number, height: number) => void;
	onFocus?: () => void;
	onTitleBarDrag?: (tabId: string, x: number, y: number) => void;
	// Legacy props for backward compatibility (Task 5 will remove these)
	isOpen?: boolean;
	defaultPosition?: { x: number; y: number };
}

export function FloatingPanel({
	tabId = "",
	title,
	children,
	x: xProp,
	y: yProp,
	width,
	height,
	zIndex = 50,
	onClose,
	onDragStop,
	onResizeStop,
	onFocus,
	onTitleBarDrag,
	// Legacy props
	isOpen = true,
	defaultPosition,
}: FloatingPanelProps) {
	// Support legacy defaultPosition prop
	const x = xProp ?? defaultPosition?.x ?? 100;
	const y = yProp ?? defaultPosition?.y ?? 100;

	const handleDragStop = useCallback(
		(_e: unknown, d: { x: number; y: number }) => {
			onDragStop?.(tabId, d.x, d.y);
		},
		[tabId, onDragStop],
	);

	const handleResizeStop = useCallback(
		(
			_e: unknown,
			_dir: unknown,
			ref: HTMLElement,
			_delta: unknown,
			position: { x: number; y: number },
		) => {
			onResizeStop?.(
				tabId,
				parseInt(ref.style.width, 10),
				parseInt(ref.style.height, 10),
			);
			onDragStop?.(tabId, position.x, position.y);
		},
		[tabId, onResizeStop, onDragStop],
	);

	const handleDrag = useCallback(
		(_e: unknown, d: { x: number; y: number }) => {
			onTitleBarDrag?.(tabId, d.x, d.y);
		},
		[tabId, onTitleBarDrag],
	);

	if (!isOpen) return null;

	return (
		<Rnd
			style={{ zIndex }}
			default={{ x, y, width, height }}
			minWidth={300}
			minHeight={200}
			bounds="parent"
			dragHandleClassName="floating-panel-titlebar"
			onDragStop={handleDragStop}
			onDrag={handleDrag}
			onResizeStop={handleResizeStop}
			onMouseDown={onFocus}
			enableResizing={{
				bottom: true,
				bottomRight: true,
				bottomLeft: true,
				left: true,
				right: true,
				top: false,
				topLeft: false,
				topRight: false,
			}}
		>
			<div className="h-full flex flex-col bg-background border border-border rounded-md shadow-lg overflow-hidden">
				<div className="floating-panel-titlebar flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-muted/50 cursor-move select-none">
					<span className="text-xs font-medium text-muted-foreground truncate">
						{title}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onClick={onClose}
						className="h-5 w-5 p-0 hover:text-destructive"
					>
						<X className="h-3 w-3" />
					</Button>
				</div>
				<div className="flex-1 min-h-0 overflow-hidden">{children}</div>
			</div>
		</Rnd>
	);
}
