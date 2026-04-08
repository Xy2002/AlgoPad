import {
	ArrowLeft,
	Check,
	Copy,
	Cloud,
	Download,
	Eye,
	EyeOff,
	Indent,
	Loader2,
	Monitor,
	Moon,
	Save,
	Sun,
	Type,
	Upload,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import DataExportImport from "@/components/DataExportImport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { MotionCard, PageTransition } from "@/components/ui/motion";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { usePlaygroundStore } from "@/store/usePlaygroundStore";
import { disconnect, recover } from "@/services/syncService";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.05,
			delayChildren: 0.05,
		},
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0 },
};

export default function Settings() {
	const { settings, updateSettings } = usePlaygroundStore();
	const { syncToken, syncStatus } = usePlaygroundStore();
	const { t } = useTranslation();
	const [dataExportImportOpen, setDataExportImportOpen] = useState(false);
	const [tokenInput, setTokenInput] = useState("");
	const [showToken, setShowToken] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [connectError, setConnectError] = useState("");
	const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

	const handleThemeChange = (theme: "vs-dark" | "vs") => {
		updateSettings({ theme });
	};

	const handleAppThemeChange = (appTheme: "light" | "dark" | "system") => {
		updateSettings({ appTheme });
	};

	const handleFontSizeChange = (fontSize: number) => {
		updateSettings({ fontSize });
	};

	const handleIndentSizeChange = (indentSize: 2 | 4) => {
		updateSettings({ indentSize });
	};

	const handleAutoSaveToggle = () => {
		updateSettings({ autoSave: !settings.autoSave });
	};

	return (
		<PageTransition>
			<div className="min-h-screen bg-background">
				{/* Header */}
				<header className="border-b border-border bg-background px-4 py-3 sticky top-0 z-50">
					<div className="flex items-center gap-3">
						<Button
							variant="ghost"
							size="sm"
							asChild
							className="text-muted-foreground hover:text-foreground"
						>
							<Link to="/" className="flex items-center gap-2">
								<ArrowLeft className="w-4 h-4" />
								<span className="text-xs font-medium hidden sm:inline">
									{t("header.backToPlayground")}
								</span>
								<span className="text-xs font-medium sm:hidden">
									{t("common.back")}
								</span>
							</Link>
						</Button>
						<div className="w-px h-4 bg-border/50" />
						<h1 className="text-sm font-semibold tracking-tight">
							{t("settings.title")}
						</h1>
					</div>
				</header>

				{/* Main Content */}
				<motion.div
					initial="hidden"
					animate="visible"
					variants={containerVariants}
					className="max-w-2xl mx-auto p-4 sm:p-8"
				>
					<div className="space-y-4">
						{/* Data Export / Import */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Download className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.dataExport.title")}</span>
								</CardTitle>
								<CardDescription className="text-xs">
									{t("settings.dataExport.description")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button
									variant="outline"
									className="w-full h-auto p-3 justify-start"
									onClick={() => setDataExportImportOpen(true)}
								>
									<div className="flex items-center gap-3">
										<Upload className="w-4 h-4 text-muted-foreground" />
										<div className="text-left">
											<div className="text-xs font-medium">
												{t("settings.dataExport.button")}
											</div>
											<div className="text-[10px] text-muted-foreground">
												{t("settings.dataExport.buttonDesc")}
											</div>
										</div>
									</div>
								</Button>
							</CardContent>
						</MotionCard>

						{/* Cloud Sync */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Cloud className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.cloudSync.title")}</span>
									{syncToken && (
										<span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-sm bg-green-500/10 text-green-600 dark:text-green-400">
											{t("settings.cloudSync.connected")}
										</span>
									)}
									{!syncToken && (
										<span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-sm bg-muted text-muted-foreground">
											{t("settings.cloudSync.notConnected")}
										</span>
									)}
								</CardTitle>
								<CardDescription className="text-xs">
									{t("settings.cloudSync.description")}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{syncToken ? (
									<>
										{/* Status */}
										{syncStatus !== "idle" && (
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												{syncStatus === "syncing" && (
													<Loader2 className="w-3 h-3 animate-spin" />
												)}
												<span>
													{t(
														syncStatus === "syncing"
															? "settings.cloudSync.statusSyncing"
															: syncStatus === "error"
																? "settings.cloudSync.statusError"
																: "settings.cloudSync.statusIdle",
													)}
												</span>
											</div>
										)}

										{/* Token display */}
										<div className="space-y-1.5">
											<div className="flex items-center gap-2">
												<code className="flex-1 text-[11px] font-mono bg-muted px-2.5 py-1.5 rounded-sm break-all select-all">
													{showToken
														? syncToken
														: `${syncToken.slice(0, 8)}${"-".repeat(4)}${"-".repeat(4)}${"-".repeat(4)}${syncToken.slice(-4)}`}
												</code>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 w-7 p-0 shrink-0"
													onClick={() => setShowToken(!showToken)}
													title={
														showToken
															? t("settings.cloudSync.hideToken")
															: t("settings.cloudSync.showToken")
													}
												>
													{showToken ? (
														<EyeOff className="w-3.5 h-3.5" />
													) : (
														<Eye className="w-3.5 h-3.5" />
													)}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 w-7 p-0 shrink-0"
													onClick={() => {
														navigator.clipboard.writeText(syncToken);
														setCopied(true);
														setTimeout(() => setCopied(false), 2000);
													}}
													title={t("settings.cloudSync.copyToken")}
												>
													{copied ? (
														<Check className="w-3.5 h-3.5 text-green-500" />
													) : (
														<Copy className="w-3.5 h-3.5" />
													)}
												</Button>
											</div>
										</div>

										{/* Disconnect */}
										<Button
											variant="outline"
											size="sm"
											className="w-full text-xs"
											onClick={() => setShowDisconnectDialog(true)}
										>
											{t("settings.cloudSync.disconnect")}
										</Button>
									</>
								) : (
									<>
										{/* Token input */}
										<div className="space-y-1.5">
											<label
												htmlFor="sync-token-input"
												className="text-xs font-medium text-muted-foreground"
											>
												{t("settings.cloudSync.tokenLabel")}
											</label>
											<Input
												id="sync-token-input"
												value={tokenInput}
												onChange={(e) => {
													setTokenInput(e.target.value);
													setConnectError("");
												}}
												placeholder={t("settings.cloudSync.tokenPlaceholder")}
												className="text-xs font-mono h-8"
											/>
											{connectError && (
												<p className="text-[10px] text-red-500">
													{connectError}
												</p>
											)}
										</div>
										<Button
											size="sm"
											className="w-full text-xs"
											disabled={!tokenInput.trim() || isConnecting}
											onClick={async () => {
												setIsConnecting(true);
												setConnectError("");
												try {
													await recover(tokenInput.trim());
													setTokenInput("");
												} catch (err) {
													setConnectError(
														err instanceof Error
															? err.message
															: "Connection failed",
													);
												} finally {
													setIsConnecting(false);
												}
											}}
										>
											{isConnecting ? (
												<>
													<Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
													{t("settings.cloudSync.statusSyncing")}
												</>
											) : (
												t("settings.cloudSync.connect")
											)}
										</Button>
									</>
								)}
							</CardContent>
						</MotionCard>

						{/* App Theme */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Sun className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.applicationTheme.title")}</span>
								</CardTitle>
								<CardDescription className="text-xs">
									{t("settings.applicationTheme.description")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-3 gap-2">
									{[
										{
											value: "light" as const,
											icon: Sun,
											label: t("settings.applicationTheme.light"),
										},
										{
											value: "dark" as const,
											icon: Moon,
											label: t("settings.applicationTheme.dark"),
										},
										{
											value: "system" as const,
											icon: Monitor,
											label: t("settings.applicationTheme.system"),
										},
									].map(({ value, icon: Icon, label }) => (
										<button
											type="button"
											key={value}
											onClick={() => handleAppThemeChange(value)}
											className={`p-3 rounded-sm border text-left transition-all text-xs ${
												settings.appTheme === value
													? "border-foreground bg-foreground text-background"
													: "border-border hover:border-foreground/30"
											}`}
										>
											<Icon className="w-4 h-4 mb-1.5" />
											<span className="font-medium">{label}</span>
										</button>
									))}
								</div>
							</CardContent>
						</MotionCard>

						{/* Editor Theme */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Monitor className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.editorTheme.title")}</span>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => handleThemeChange("vs")}
										className={`p-3 rounded-sm border text-left transition-all text-xs ${
											settings.theme === "vs"
												? "border-foreground bg-foreground text-background"
												: "border-border hover:border-foreground/30"
										}`}
									>
										<Sun className="w-4 h-4 mb-1.5" />
										<span className="font-medium">
											{t("settings.editorTheme.light")}
										</span>
									</button>
									<button
										type="button"
										onClick={() => handleThemeChange("vs-dark")}
										className={`p-3 rounded-sm border text-left transition-all text-xs ${
											settings.theme === "vs-dark"
												? "border-foreground bg-foreground text-background"
												: "border-border hover:border-foreground/30"
										}`}
									>
										<Moon className="w-4 h-4 mb-1.5" />
										<span className="font-medium">
											{t("settings.editorTheme.dark")}
										</span>
									</button>
								</div>
							</CardContent>
						</MotionCard>

						{/* Font Settings */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Type className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.fontSettings.title")}</span>
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="text-xs font-medium">
											{t("settings.fontSettings.fontSize")}
										</span>
										<span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">
											{settings.fontSize}px
										</span>
									</div>
									<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
										<Slider
											value={[settings.fontSize]}
											onValueChange={(value) => handleFontSizeChange(value[0])}
											min={10}
											max={24}
											step={1}
											className="flex-1"
										/>
										<div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-1.5">
											{[12, 14, 16, 18].map((size) => (
												<button
													type="button"
													key={size}
													onClick={() => handleFontSizeChange(size)}
													className={`px-2 py-1 text-[10px] font-medium rounded-sm transition-all ${
														settings.fontSize === size
															? "bg-foreground text-background"
															: "bg-muted text-muted-foreground hover:bg-muted/80"
													}`}
												>
													{size}
												</button>
											))}
										</div>
									</div>
								</div>
							</CardContent>
						</MotionCard>

						{/* Code Formatting */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Indent className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.codeFormatting.title")}</span>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => handleIndentSizeChange(2)}
										className={`flex-1 px-3 py-2 text-xs font-medium rounded-sm border transition-all ${
											settings.indentSize === 2
												? "border-foreground bg-foreground text-background"
												: "border-border hover:border-foreground/30"
										}`}
									>
										{t("settings.codeFormatting.spaces2")}
									</button>
									<button
										type="button"
										onClick={() => handleIndentSizeChange(4)}
										className={`flex-1 px-3 py-2 text-xs font-medium rounded-sm border transition-all ${
											settings.indentSize === 4
												? "border-foreground bg-foreground text-background"
												: "border-border hover:border-foreground/30"
										}`}
									>
										{t("settings.codeFormatting.spaces4")}
									</button>
								</div>
							</CardContent>
						</MotionCard>

						{/* Auto Save */}
						<MotionCard variants={itemVariants} className="overflow-hidden">
							<CardHeader className="pb-3">
								<CardTitle className="flex items-center gap-2 text-sm">
									<Save className="w-4 h-4 text-muted-foreground" />
									<span>{t("settings.autoSave.title")}</span>
								</CardTitle>
								<CardDescription className="text-xs">
									{t("settings.autoSave.description")}
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex items-center justify-between">
									<div>
										<div className="text-xs font-medium">
											{t("settings.autoSave.enable")}
										</div>
									</div>
									<Switch
										checked={settings.autoSave}
										onCheckedChange={handleAutoSaveToggle}
									/>
								</div>
							</CardContent>
						</MotionCard>
					</div>
				</motion.div>

				<DataExportImport
					open={dataExportImportOpen}
					onOpenChange={setDataExportImportOpen}
				/>

				{/* Disconnect Dialog */}
				<Dialog
					open={showDisconnectDialog}
					onOpenChange={setShowDisconnectDialog}
				>
					<DialogContent className="max-w-sm">
						<DialogHeader>
							<DialogTitle className="text-sm">
								{t("settings.cloudSync.disconnect")}
							</DialogTitle>
							<DialogDescription className="text-xs">
								{t("settings.cloudSync.disconnectDesc")}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="flex-col gap-2 sm:flex-col">
							<Button
								variant="outline"
								size="sm"
								className="w-full text-xs"
								onClick={() => {
									disconnect();
									setShowDisconnectDialog(false);
								}}
							>
								{t("settings.cloudSync.disconnectKeepData")}
							</Button>
							<Button
								variant="destructive"
								size="sm"
								className="w-full text-xs"
								onClick={() => {
									disconnect();
									usePlaygroundStore.getState().clearAllState();
									setShowDisconnectDialog(false);
								}}
							>
								{t("settings.cloudSync.disconnectClearData")}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="w-full text-xs"
								onClick={() => setShowDisconnectDialog(false)}
							>
								{t("common.cancel")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</PageTransition>
	);
}
