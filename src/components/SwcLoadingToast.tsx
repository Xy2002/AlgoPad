import { useTranslation } from "react-i18next";
import type { SWCLoadProgress } from "@/services/codeExecutionService";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

interface SwcLoadingToastProps {
	progress: SWCLoadProgress;
	onRetry?: () => void;
}

export function SwcLoadingToast({ progress, onRetry }: SwcLoadingToastProps) {
	const { t } = useTranslation();

	if (progress.state === "error") {
		return (
			<div className="px-4 py-3 w-[300px]">
				<div className="flex items-center gap-2 mb-2">
					<div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
					<p className="text-[13px] font-medium text-destructive">
						{t("swcLoading.errorTitle")}
					</p>
				</div>
				<p className="text-xs text-muted-foreground leading-relaxed pl-3.5 mb-3">
					{progress.error}
				</p>
				{onRetry && (
					<Button
						size="sm"
						variant="outline"
						onClick={onRetry}
						className="ml-3.5 h-7 text-xs rounded-md gap-1.5"
					>
						<RefreshCw className="w-3 h-3" />
						{t("swcLoading.retry")}
					</Button>
				)}
			</div>
		);
	}

	if (progress.state === "ready") {
		return (
			<div className="px-4 py-3">
				<div className="flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
					<p className="text-[13px] font-medium">{t("swcLoading.ready")}</p>
				</div>
			</div>
		);
	}

	// Loading state
	const stepLabel =
		progress.step === 1
			? t("swcLoading.stepLoadModule")
			: t("swcLoading.stepDownloadWasm");

	// Overall progress estimation
	let overallPercent: number;
	if (progress.step === 1) {
		overallPercent = 10;
	} else if (progress.percent !== null) {
		overallPercent = 10 + progress.percent * 0.9;
	} else if (progress.loaded > 0) {
		const estimatedPercent = Math.min(
			(progress.loaded / (progress.loaded * 1.5)) * 100,
			90,
		);
		overallPercent = 10 + estimatedPercent * 0.9;
	} else {
		overallPercent = 10;
	}

	const hasByteProgress = progress.step === 2 && progress.loaded > 0;

	return (
		<div className="px-4 py-3 w-[300px]">
			{/* Header */}
			<div className="flex items-center gap-2 mb-2.5">
				<Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[hsl(var(--vercel-blue))]" />
				<p className="text-[13px] font-medium">{t("swcLoading.title")}</p>
			</div>

			{/* Progress bar */}
			<div className="flex flex-col gap-1.5 ml-[22px]">
				<div className="h-1 w-full overflow-hidden rounded-full bg-border">
					<div
						className={cn(
							"h-full rounded-full transition-all duration-300 ease-out",
							"bg-[hsl(var(--vercel-blue))]",
						)}
						style={{
							width: `${overallPercent}%`,
						}}
					/>
				</div>

				{/* Step info */}
				<div className="flex items-center justify-between">
					<p className="text-[11px] text-muted-foreground leading-none">
						{t("swcLoading.stepOf", {
							step: progress.step,
							total: progress.totalSteps,
						})}{" "}
						{stepLabel}
					</p>
					{hasByteProgress && (
						<p className="text-[11px] tabular-nums text-muted-foreground leading-none">
							{formatBytes(progress.loaded)}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
