import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
	Activity,
	ChevronLeft,
	ChevronRight,
	FastForward,
	SkipBack,
	Pause,
	Play,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { RecursiveTrace, TraceStep } from "@/services/codeExecutionService";

interface RecursiveTraceVisualizationProps {
	trace: RecursiveTrace;
	currentStepIndex: number;
	onStepChange: (index: number) => void;
	isPlaying: boolean;
	onPlayToggle: () => void;
	playSpeed: number;
	onSpeedChange: (speed: number) => void;
}

interface CallStackEntry {
	functionName: string;
	args: string[];
	depth: number;
}

export default function RecursiveTraceVisualization({
	trace,
	currentStepIndex,
	onStepChange,
	isPlaying,
	onPlayToggle,
	playSpeed,
	onSpeedChange,
}: RecursiveTraceVisualizationProps) {
	const { t } = useTranslation();
	const scrollRef = useRef<HTMLDivElement>(null);

	const steps = trace.steps;
	const currentStep: TraceStep | undefined = steps[currentStepIndex];

	// Auto-play
	useEffect(() => {
		if (!isPlaying) return;

		const timer = setInterval(() => {
			onStepChange(currentStepIndex + 1);
		}, playSpeed);

		return () => clearInterval(timer);
	}, [isPlaying, currentStepIndex, playSpeed, onStepChange]);

	// Stop auto-play at the end
	useEffect(() => {
		if (isPlaying && currentStepIndex >= steps.length - 1) {
			onPlayToggle();
		}
	}, [currentStepIndex, isPlaying, onPlayToggle, steps.length]);

	// Rebuild call stack from trace history
	const callStack = useMemo((): CallStackEntry[] => {
		const stack: CallStackEntry[] = [];
		for (let i = 0; i <= currentStepIndex && i < steps.length; i++) {
			const step = steps[i];
			if (step.action === "enter") {
				stack.push({
					functionName: step.functionName,
					args: step.args,
					depth: step.depth,
				});
			} else if (step.action === "exit") {
				stack.pop();
			}
		}
		return stack;
	}, [steps, currentStepIndex]);

	// Get args string for display
	const getArgsDisplay = useCallback(
		(step: TraceStep): string => {
			return step.args.map((arg, i) => `arg${i}: ${arg}`).join(", ");
		},
		[],
	);

	const handlePrev = useCallback(() => {
		onStepChange(Math.max(0, currentStepIndex - 1));
	}, [currentStepIndex, onStepChange]);

	const handleNext = useCallback(() => {
		onStepChange(Math.min(steps.length - 1, currentStepIndex + 1));
	}, [currentStepIndex, onStepChange, steps.length]);

	const handleFirst = useCallback(() => {
		onStepChange(0);
	}, [onStepChange]);

	const handleLast = useCallback(() => {
		onStepChange(steps.length - 1);
	}, [onStepChange, steps.length]);

	if (steps.length === 0) {
		return (
			<div className="h-full flex items-center justify-center text-muted-foreground p-4">
				<p>{t("trace.noTrace")}</p>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col p-3 gap-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Activity className="h-4 w-4 text-amber-500" />
					<span className="text-sm font-medium">{t("trace.title")}</span>
					<Badge variant="secondary" className="text-xs font-mono">
						{currentStepIndex + 1} / {steps.length}
					</Badge>
				</div>
				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					<span>
						{t("trace.totalCalls")}: {trace.totalCalls}
					</span>
					<span>
						{t("trace.maxDepth")}: {trace.maxDepth}
					</span>
				</div>
			</div>

			{trace.truncated && (
				<div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-3 py-1.5 rounded-md">
					{t("trace.truncated", { max: 10000 })}
				</div>
			)}

			{/* Step scrubber */}
			<div className="flex items-center gap-3">
				<span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">
					{currentStepIndex + 1}
				</span>
				<Slider
					value={[currentStepIndex]}
					onValueChange={([v]) => onStepChange(v)}
					min={0}
					max={steps.length - 1}
					step={1}
					className="flex-1"
				/>
				<span className="text-xs font-mono text-muted-foreground w-8 shrink-0">
					{steps.length}
				</span>
			</div>

			{/* Navigation */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={handleFirst}
						disabled={currentStepIndex === 0}
					>
						<SkipBack className="h-3 w-3" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={handlePrev}
						disabled={currentStepIndex === 0}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						variant={isPlaying ? "default" : "outline"}
						size="icon"
						className="h-7 w-7"
						onClick={onPlayToggle}
					>
						{isPlaying ? (
							<Pause className="h-3 w-3" />
						) : (
							<Play className="h-3 w-3" />
						)}
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={handleNext}
						disabled={currentStepIndex >= steps.length - 1}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="h-7 w-7"
						onClick={handleLast}
						disabled={currentStepIndex >= steps.length - 1}
					>
						<FastForward className="h-3 w-3" />
					</Button>
				</div>

				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{t("trace.speed")}:</span>
					<Slider
						value={[playSpeed]}
						onValueChange={([v]) => onSpeedChange(v)}
						min={50}
						max={2000}
						step={50}
						className="w-20"
					/>
					<span className="w-12 text-right">{playSpeed}ms</span>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 flex gap-3">
				{/* Call Stack */}
				<Card className="flex-1 flex flex-col p-0 overflow-hidden">
					<div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
						{t("trace.callStack")}
					</div>
					<ScrollArea className="flex-1">
						<div ref={scrollRef} className="p-2">
							{callStack.length === 0 ? (
								<div className="text-xs text-muted-foreground p-2">
									-
								</div>
							) : (
								callStack.map((entry, index) => (
									<div
										key={`${index}-${entry.depth}`}
										className="flex items-center gap-1 py-0.5 px-1 rounded text-xs font-mono"
										style={{ paddingLeft: `${entry.depth * 16 + 4}px` }}
									>
										{index === callStack.length - 1 ? (
											<span className="text-amber-500">&#9654;</span>
										) : (
											<span className="text-muted-foreground/40">
												&#9654;
											</span>
										)}
										<span
											className={
												index === callStack.length - 1
													? "text-amber-600 dark:text-amber-400"
													: "text-muted-foreground"
											}
										>
											{entry.functionName}
										</span>
										<span className="text-muted-foreground/60">
											({entry.args.join(", ")})
										</span>
									</div>
								))
							)}
						</div>
					</ScrollArea>
				</Card>

				{/* Step Detail */}
				<Card className="w-64 flex flex-col p-0 overflow-hidden">
					<div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
						{t("trace.step")} #{currentStepIndex + 1}
					</div>
					{currentStep && (
						<div className="p-3 space-y-2 text-xs">
							<div>
								<span className="text-muted-foreground">
									{t("trace.title")}:
								</span>{" "}
								<span className="font-mono font-medium">
									{currentStep.functionName}
								</span>
							</div>
							<div>
								<span className="text-muted-foreground">
									Action:
								</span>{" "}
								<Badge
									variant={
										currentStep.action === "enter"
											? "default"
											: "secondary"
									}
									className="text-[10px] px-1.5 py-0"
								>
									{currentStep.action === "enter"
										? t("trace.enter")
										: t("trace.exit")}
								</Badge>
							</div>
							<div>
								<span className="text-muted-foreground">
									{t("trace.arguments")}:
								</span>
								<div className="font-mono mt-0.5 bg-muted/50 rounded px-2 py-1 break-all">
									{getArgsDisplay(currentStep)}
								</div>
							</div>
							{currentStep.action === "exit" &&
								currentStep.returnValue !== undefined && (
									<div>
										<span className="text-muted-foreground">
											{t("trace.returnValue")}:
										</span>
										<div className="font-mono mt-0.5 bg-muted/50 rounded px-2 py-1 break-all">
											{currentStep.returnValue}
										</div>
									</div>
								)}
							<div>
								<span className="text-muted-foreground">
									{t("trace.depth")}:
								</span>{" "}
								<span>{currentStep.depth}</span>
							</div>
							<div>
								<span className="text-muted-foreground">
									Line:
								</span>{" "}
								<span>{currentStep.line}</span>
							</div>
							<div>
								<span className="text-muted-foreground">
									Time:
								</span>{" "}
								<span>{currentStep.timestamp.toFixed(2)}ms</span>
							</div>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
