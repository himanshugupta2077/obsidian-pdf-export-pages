import {
	isHeadingLevel,
	type HeadingFlags,
	type HeadingLevel,
} from "./settings.ts";

export type ContentBlock =
	| { kind: "heading"; level: HeadingLevel; headingIndex?: number }
	| { kind: "text" };

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export type BlockPlacement = "break" | "stack" | "flow";

export interface HeadingBreakTarget {
	headingIndex: number;
	level: HeadingLevel;
	isFirstBlock: boolean;
	followsHeading: boolean;
}

export function placementForHeading(
	heading: HeadingBreakTarget,
	breakOn: HeadingFlags,
	overrides?: ReadonlyMap<number, boolean>
): BlockPlacement {
	if (heading.isFirstBlock) return "flow";
	const override = overrides?.get(heading.headingIndex);
	if (override === true) return "break";
	if (override === false) return heading.followsHeading ? "stack" : "flow";
	if (heading.followsHeading) return "stack";
	if (breakOn[heading.level]) return "break";
	return "flow";
}

export function headingStartsNewPage(
	heading: HeadingBreakTarget,
	breakOn: HeadingFlags,
	overrides?: ReadonlyMap<number, boolean>
): boolean {
	return placementForHeading(heading, breakOn, overrides) === "break";
}

export function blockPlacements(
	blocks: readonly ContentBlock[],
	breakOn: HeadingFlags,
	overrides?: ReadonlyMap<number, boolean>
): BlockPlacement[] {
	return blocks.map((block, index) => {
		if (block.kind !== "heading") return "flow";
		return placementForHeading(
			{
				headingIndex: block.headingIndex ?? index,
				level: block.level,
				isFirstBlock: index === 0,
				followsHeading: index > 0 && blocks[index - 1]?.kind === "heading",
			},
			breakOn,
			overrides
		);
	});
}

export function blocksThatBreak(
	blocks: readonly ContentBlock[],
	breakOn: HeadingFlags,
	overrides?: ReadonlyMap<number, boolean>
): number[] {
	const indexes: number[] = [];
	blockPlacements(blocks, breakOn, overrides).forEach((placement, index) => {
		if (placement === "break") indexes.push(index);
	});
	return indexes;
}

export interface FlowBlock {
	kind: "heading" | "text";
	level: HeadingLevel | null;
	headingIndex: number | null;
	el: HTMLElement;
	text: string;
}

export function collectFlowBlocks(root: HTMLElement): FlowBlock[] {
	const blocks: FlowBlock[] = [];
	let headingIndex = 0;
	const visit = (el: HTMLElement) => {
		if (
			el.classList.contains("metadata-container") ||
			el.classList.contains("page-pdf-front") ||
			el.classList.contains("page-pdf-toc") ||
			el.classList.contains("page-pdf-toc-slot")
		) {
			return;
		}
		const level = headingLevel(el);
		if (level) {
			blocks.push({
				kind: "heading",
				level,
				headingIndex,
				el,
				text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
			});
			headingIndex += 1;
			return;
		}
		const children = Array.from(el.children).filter(
			(child): child is HTMLElement => child instanceof HTMLElement
		);
		const hasHeading = children.some(
			(child) =>
				headingLevel(child) !== null ||
				child.querySelector(HEADING_SELECTOR) !== null
		);
		if (children.length > 0 && hasHeading) {
			for (const child of children) visit(child);
			return;
		}
		if (isVisibleBlock(el)) {
			blocks.push({
				kind: "text",
				level: null,
				headingIndex: null,
				el,
				text: "",
			});
		}
	};
	for (const child of Array.from(root.children)) {
		if (child instanceof HTMLElement) visit(child);
	}
	return blocks;
}

export function applyHeadingPageBreaks(
	root: HTMLElement,
	breakOn: HeadingFlags,
	overrides?: ReadonlyMap<number, boolean>
): void {
	const blocks = collectFlowBlocks(root);
	const placements = blockPlacements(
		blocks.map((block) =>
			block.kind === "heading" && block.level !== null && block.headingIndex !== null
				? {
						kind: "heading" as const,
						level: block.level,
						headingIndex: block.headingIndex,
					}
				: { kind: "text" as const }
		),
		breakOn,
		overrides
	);
	blocks.forEach((block, index) => {
		if (block.kind !== "heading") return;
		setPageBreak(block.el, placements[index] ?? "flow");
	});
}

function setPageBreak(el: HTMLElement, placement: BlockPlacement): void {
	const broke = placement === "break";
	const stacked = placement === "stack";
	el.classList.toggle("page-pdf-break", broke);
	el.classList.toggle("page-pdf-stacked", stacked);
	el.style.breakBefore = broke ? "page" : "auto";
	el.style.pageBreakBefore = broke ? "always" : "auto";
	el.style.breakAfter = "avoid";
	el.style.pageBreakAfter = "avoid";
	if (stacked) el.style.marginTop = "0.2em";
}

function headingLevel(el: Element): HeadingLevel | null {
	const level = Number(el.tagName.slice(1));
	if (!/^H[1-6]$/.test(el.tagName) || !isHeadingLevel(level)) return null;
	return level;
}

function isVisibleBlock(el: HTMLElement): boolean {
	if ((el.textContent ?? "").replace(/\s+/g, "").length > 0) return true;
	return (
		el.matches("img, svg, canvas, table, hr, pre, iframe") ||
		el.querySelector("img, svg, canvas, table, hr, pre, iframe") !== null
	);
}
