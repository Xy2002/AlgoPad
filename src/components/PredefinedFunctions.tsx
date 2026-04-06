import { BookOpen, Braces, Code, FileCode, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { usePlaygroundStore } from "@/store/usePlaygroundStore";

interface FunctionDoc {
	name: string;
	description: string;
	signature: string;
	example?: string;
}

interface Category {
	icon: React.ElementType;
	title: string;
	color: string;
	functions: FunctionDoc[];
}

export default function PredefinedFunctions() {
	const { t } = useTranslation();
	const { activeFileId, files } = usePlaygroundStore();
	const currentTreeMode = activeFileId
		? files[activeFileId]?.treeMode || "general"
		: "general";

	const categories: Category[] = [
		{
			icon: Braces,
			title: t("predefined.dataStructures"),
			color: "text-blue-500",
			functions: [
				{
					name: "ListNode",
					description: t("predefined.listNode.description"),
					signature: "class ListNode { val: number; next: ListNode | null }",
					example: `const node = new ListNode(1);
node.next = new ListNode(2);`,
				},
				currentTreeMode === "general"
					? {
							name: "TreeNode",
							description: t("predefined.treeNode.description"),
							signature:
								"class TreeNode<T> { value: T; children: TreeNode<T>[] }",
							example: `const root = new TreeNode('root');
root.addChild(new TreeNode('child'));`,
						}
					: {
							name: "TreeNode",
							description: t("predefined.treeNode.binaryDescription"),
							signature:
								"class TreeNode { val: number; left: TreeNode | null; right: TreeNode | null }",
							example: `const root = new TreeNode(1);
root.left = new TreeNode(2);
root.right = new TreeNode(3);`,
						},
			],
		},
		{
			icon: Code,
			title: t("predefined.listFunctions"),
			color: "text-green-500",
			functions: [
				{
					name: "arrayToListNode",
					description: t("predefined.arrayToListNode.description"),
					signature: "arrayToListNode(arr: number[]): ListNode | null",
					example: `const list = arrayToListNode([1, 2, 3]);`,
				},
				{
					name: "listNodeToArray",
					description: t("predefined.listNodeToArray.description"),
					signature: "listNodeToArray(head: ListNode | null): number[]",
					example: `const arr = listNodeToArray(listHead);`,
				},
			],
		},
		{
			icon: FileCode,
			title: t("predefined.treeFunctions"),
			color: "text-purple-500",
			functions: [
				{
					name: "renderTree",
					description: t("predefined.renderTree.description"),
					signature:
						"renderTree(root: any, description?: string, highlightedNodes?: any[]): void",
					example: `// Render generic tree/object
renderTree(root, "Binary Tree");

// Highlight specific values or nodes
renderTree(root, "Highlighted", [node1, node2]);`,
				},
			],
		},
		{
			icon: Workflow,
			title: t("predefined.heapFunctions"),
			color: "text-orange-500",
			functions: [
				{
					name: "renderHeap",
					description: t("predefined.renderHeap.description"),
					signature: "renderHeap(heap: any[], description: string): void",
					example: `renderHeap([3,1,4,1,5], "Min Heap");`,
				},
			],
		},
		{
			icon: BookOpen,
			title: t("predefined.testing"),
			color: "text-pink-500",
			functions: [
				{
					name: "describe",
					description: t("predefined.describe.description"),
					signature: "describe(name: string, fn: () => void): void",
					example: `describe("Math", () => {
	test("addition", () => {
		expect(1+1).toBe(2);
	});
});`,
				},
				{
					name: "test",
					description: t("predefined.test.description"),
					signature: "test(name: string, fn: () => void): void",
					example: `test("should pass", () => {
		expect(true).toBe(true);
	});`,
				},
				{
					name: "expect",
					description: t("predefined.expect.description"),
					signature: "expect<T>(actual: T): Assertion<T>",
					example: `expect(42).toBe(42);
expect("hello").toContain("ell");
expect(arr).toEqual([1,2,3]);`,
				},
			],
		},
	];

	return (
		<div className="h-full flex flex-col bg-background">
			<ScrollArea className="flex-1 px-4">
				<div className="py-4 space-y-4">
					{categories.map((category, categoryIndex) => {
						const Icon = category.icon;
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: categories is a static array that never changes order
							<div key={categoryIndex}>
								<div className="flex items-center gap-2 mb-3">
									<Icon className={`w-5 h-5 ${category.color}`} />
									<h3 className="text-sm font-semibold">{category.title}</h3>
								</div>
								<div className="space-y-3 ml-7">
									{category.functions.map((func, funcIndex) => (
										<Card
											// biome-ignore lint/suspicious/noArrayIndexKey: functions array is static within each category
											key={funcIndex}
											className="border-border/50 bg-muted/30"
										>
											<CardHeader className="pb-3">
												<div className="flex items-center justify-between">
													<CardTitle className="text-sm font-mono">
														{func.name}
													</CardTitle>
												</div>
											</CardHeader>
											<CardContent className="space-y-2">
												<p className="text-xs text-muted-foreground">
													{func.description}
												</p>
												<div className="rounded-md bg-background p-2 border">
													<code className="text-xs font-mono text-primary">
														{func.signature}
													</code>
												</div>
												{func.example && (
													<>
														<Separator />
														<div>
															<div className="flex items-center gap-1 mb-1">
																<Badge variant="outline" className="text-xs">
																	Example
																</Badge>
															</div>
															<pre className="text-xs font-mono bg-background p-2 rounded border overflow-x-auto">
																<code>{func.example}</code>
															</pre>
														</div>
													</>
												)}
											</CardContent>
										</Card>
									))}
								</div>
								{categoryIndex < categories.length - 1 && (
									<Separator className="my-4" />
								)}
							</div>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}
