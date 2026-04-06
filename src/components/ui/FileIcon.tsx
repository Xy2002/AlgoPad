import { FileText, Settings } from "lucide-react";

interface FileIconProps {
	fileName: string;
	className?: string;
}

export default function FileIcon({ fileName, className }: FileIconProps) {
	const extension = fileName.split(".").pop()?.toLowerCase();

	switch (extension) {
		case "js":
		case "jsx":
			return (
				<span
					className={`inline-flex items-center justify-center rounded-sm font-bold text-[10px] ${className}`}
					style={{
						backgroundColor: "#F7DF1E",
						color: "#000000",
						minWidth: "16px",
					}}
				>
					JS
				</span>
			);
		case "ts":
		case "tsx":
			return (
				<span
					className={`inline-flex items-center justify-center rounded-sm font-bold text-[10px] ${className}`}
					style={{
						backgroundColor: "#3178C6",
						color: "#FFFFFF",
						minWidth: "16px",
					}}
				>
					TS
				</span>
			);
		case "json":
			return <Settings className={className} />;
		default:
			return <FileText className={className} />;
	}
}
