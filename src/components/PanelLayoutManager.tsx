import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FloatingPanelState } from "@/store/usePlaygroundStore";
import { FloatingPanel } from "./FloatingPanel";

// ---- Types ----

interface TabConfig {
	id: string;
	label: string;
	icon?: ReactNode;
	badge?: ReactNode;
	visible: boolean;
	content: ReactNode;
}

export interface PanelLayoutManagerProps {
	tabs: TabConfig[];
	tabOrder: string[];
	floatingPanels: FloatingPanelState[];
	activeTab: string;
	onActiveTabChange: (tabId: string) => void;
	onUpdateTabOrder: (tabOrder: string[]) => void;
	onFloatTab: (tabId: string, x: number, y: number) => void;
	onDockTab: (tabId: string, insertIndex?: number) => void;
	onUpdateFloatingPanel: (
		tabId: string,
		updates: Partial<Pick<FloatingPanelState, "x" | "y" | "width" | "height">>,
	) => void;
	onBringFloatingPanelToFront: (tabId: string) => void;
	onResetPanelLayout: () => void;
}

// ---- SortableTab ----

function SortableTab({ tab }: { tab: TabConfig }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: tab.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<TabsTrigger value={tab.id} className="gap-2">
				{tab.icon}
				{tab.label}
				{tab.badge}
			</TabsTrigger>
		</div>
	);
}

// ---- Main Component ----

export default function PanelLayoutManager({
	tabs,
	tabOrder,
	floatingPanels,
	activeTab,
	onActiveTabChange,
	onUpdateTabOrder,
	onFloatTab,
	onDockTab,
	onUpdateFloatingPanel,
	onBringFloatingPanelToFront,
	onResetPanelLayout,
}: PanelLayoutManagerProps) {
	const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
	const dragStartPos = useRef<{ x: number; y: number } | null>(null);
	const tabBarRef = useRef<HTMLDivElement>(null);

	// Filter visible tabs, respecting order, excluding floating ones
	const visibleTabIds = useMemo(() => {
		const floatingIds = new Set(floatingPanels.map((p) => p.tabId));
		return tabOrder.filter(
			(id) =>
				!floatingIds.has(id) && tabs.some((t) => t.id === id && t.visible),
		);
	}, [tabOrder, floatingPanels, tabs]);

	const visibleTabsMap = useMemo(() => {
		const map = new Map<string, TabConfig>();
		for (const tab of tabs) {
			if (tab.visible) map.set(tab.id, tab);
		}
		return map;
	}, [tabs]);

	// Resolve active tab: fall back if active is floating or hidden
	const effectiveActiveTab = useMemo(() => {
		if (visibleTabIds.includes(activeTab)) return activeTab;
		return visibleTabIds[0] || "output";
	}, [activeTab, visibleTabIds]);

	// dnd-kit sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
	);

	// ---- Drag handlers ----

	const handleDragStart = useCallback((event: DragStartEvent) => {
		setDraggedTabId(event.active.id as string);
		dragStartPos.current = { x: 0, y: 0 };
	}, []);

	const handleDragOver = useCallback((event: DragOverEvent) => {
		if (!dragStartPos.current) return;
		const delta = event.delta;
		dragStartPos.current = { x: delta.x, y: delta.y };
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			const tabId = active.id as string;
			const delta = dragStartPos.current;

			// Check detach: if dragged upward by more than 40px
			if (delta && delta.y < -40) {
				const rect = tabBarRef.current?.getBoundingClientRect();
				if (rect) {
					onFloatTab(
						tabId,
						rect.left + (delta.x || 0),
						rect.top + (delta.y || 0),
					);
				} else {
					onFloatTab(tabId, 100, 100);
				}
				if (effectiveActiveTab === tabId) {
					const remaining = visibleTabIds.filter((id) => id !== tabId);
					onActiveTabChange(remaining[0] || "output");
				}
				setDraggedTabId(null);
				dragStartPos.current = null;
				return;
			}

			// Reorder within tab bar
			if (over && active.id !== over.id) {
				const oldIndex = visibleTabIds.indexOf(tabId);
				const newIndex = visibleTabIds.indexOf(over.id as string);
				if (oldIndex !== -1 && newIndex !== -1) {
					const newOrder = [...tabOrder];
					const globalOld = newOrder.indexOf(tabId);
					const globalNew = newOrder.indexOf(over.id as string);
					if (globalOld !== -1 && globalNew !== -1) {
						newOrder.splice(globalOld, 1);
						newOrder.splice(globalNew, 0, tabId);
						onUpdateTabOrder(newOrder);
					}
				}
			}

			setDraggedTabId(null);
			dragStartPos.current = null;
		},
		[
			visibleTabIds,
			tabOrder,
			effectiveActiveTab,
			onFloatTab,
			onUpdateTabOrder,
			onActiveTabChange,
		],
	);

	// ---- Floating panel drag-to-dock ----

	const handleTitleBarDrag = useCallback(
		(_tabId: string, _x: number, _y: number) => {
			// Could show visual indicator in future
		},
		[],
	);

	const handleFloatingDragStop = useCallback(
		(tabId: string, x: number, y: number) => {
			if (!tabBarRef.current) {
				onUpdateFloatingPanel(tabId, { x, y });
				return;
			}
			const rect = tabBarRef.current.getBoundingClientRect();
			if (
				x + 100 > rect.left &&
				x + 100 < rect.right &&
				y > rect.top - 60 &&
				y < rect.bottom + 20
			) {
				onDockTab(tabId);
			} else {
				onUpdateFloatingPanel(tabId, { x, y });
			}
		},
		[onDockTab, onUpdateFloatingPanel],
	);

	const handleFloatingResizeStop = useCallback(
		(tabId: string, width: number, height: number) => {
			onUpdateFloatingPanel(tabId, { width, height });
		},
		[onUpdateFloatingPanel],
	);

	// ---- Render tab content helper ----

	const renderTabContent = useCallback(
		(tabId: string): ReactNode => {
			const tab = visibleTabsMap.get(tabId);
			return tab?.content ?? null;
		},
		[visibleTabsMap],
	);

	// ---- Auto-close floating panels for invisible tabs ----

	const validFloatingPanels = useMemo(
		() => floatingPanels.filter((p) => visibleTabsMap.has(p.tabId)),
		[floatingPanels, visibleTabsMap],
	);

	return (
		<div className="h-full flex flex-col">
			<div className="flex-1 min-h-0 relative">
				{/* Docked tab area */}
				<Tabs
					value={effectiveActiveTab}
					onValueChange={onActiveTabChange}
					className="h-full flex flex-col"
				>
					<div className="px-4 py-1.5 border-b border-border" ref={tabBarRef}>
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragStart={handleDragStart}
							onDragOver={handleDragOver}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={visibleTabIds}
								strategy={horizontalListSortingStrategy}
							>
								<TabsList className="w-full justify-start bg-transparent h-auto p-0 gap-0">
									{visibleTabIds.map((id) => {
										const tab = visibleTabsMap.get(id);
										if (!tab) return null;
										return <SortableTab key={id} tab={tab} />;
									})}
									{visibleTabIds.length === 0 && (
										<button
											type="button"
											className="text-xs text-muted-foreground px-3 py-1 hover:text-foreground transition-colors"
											onClick={onResetPanelLayout}
										>
											Reset layout
										</button>
									)}
								</TabsList>
							</SortableContext>
						</DndContext>
					</div>

					<div className="flex-1 min-h-0">
						{visibleTabIds.map((id) => (
							<TabsContent key={id} value={id} className="h-full m-0 p-0">
								{renderTabContent(id)}
							</TabsContent>
						))}
					</div>
				</Tabs>

				{/* Floating panels layer */}
				{validFloatingPanels.map((panel) => {
					const tab = visibleTabsMap.get(panel.tabId);
					if (!tab) return null;
					return (
						<FloatingPanel
							key={panel.tabId}
							tabId={panel.tabId}
							title={tab.label}
							x={panel.x}
							y={panel.y}
							width={panel.width}
							height={panel.height}
							zIndex={panel.zIndex}
							onClose={() => onDockTab(panel.tabId)}
							onDragStop={handleFloatingDragStop}
							onResizeStop={handleFloatingResizeStop}
							onFocus={() => onBringFloatingPanelToFront(panel.tabId)}
							onTitleBarDrag={handleTitleBarDrag}
						>
							{renderTabContent(panel.tabId)}
						</FloatingPanel>
					);
				})}
			</div>
		</div>
	);
}
