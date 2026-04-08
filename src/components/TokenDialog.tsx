import { usePlaygroundStore } from "@/store/usePlaygroundStore";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

export function TokenDialog() {
	const { syncToken, isFirstSync, setIsFirstSync } = usePlaygroundStore();
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		if (!syncToken) return;
		await navigator.clipboard.writeText(syncToken);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [syncToken]);

	const handleDismiss = useCallback(() => {
		setIsFirstSync(false);
	}, [setIsFirstSync]);

	if (!isFirstSync || !syncToken) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="mx-4 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
				<h2 className="mb-2 text-lg font-semibold text-card-foreground">
					Your Sync Token
				</h2>
				<p className="mb-4 text-sm text-muted-foreground">
					Save this token somewhere safe. You'll need it to sync your data on
					other devices. If you lose it, your cloud data cannot be recovered.
				</p>

				<div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted p-3">
					<code className="flex-1 break-all text-xs text-foreground">
						{syncToken}
					</code>
					<button
						type="button"
						onClick={handleCopy}
						className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					>
						{copied ? (
							<Check className="h-4 w-4 text-green-500" />
						) : (
							<Copy className="h-4 w-4" />
						)}
					</button>
				</div>

				<button
					type="button"
					onClick={handleDismiss}
					className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					I've Saved My Token
				</button>
			</div>
		</div>
	);
}
