import {
	isHeadingLevel,
	type HeadingFlags,
	type HeadingLevel,
} from "./settings.ts";

export type ContentBlock =
	| { kind: "heading"; level: HeadingLevel }
	| { kind: "text" };

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export type BlockPlacement = "break" | "stack" | "flow";

export function blockPlacements(
	blocks: readonly ContentBlock[],
	breakOn: HeadingFlags
): BlockPlacement[] {
	return blocks.map((block, index) => {
		if (block.kind !== "heading") return "flow";
		const previous = index > 0 ? blocks[index - 1] : undefined;
		if (previous?.kind === "heading") return "stack";
		if (index > 0 && breakOn[block.level]) return "break";
		return "flow";
	});
}

export function blocksThatBreak(
	blocks: readonly ContentBlock[],
	breakOn: HeadingFlags
): number[] {
	const indexes: number[] = [];
	blockPlacements(blocks, breakOn).forEach((placement, index) => {
		if (placement === "break") indexes.push(index);
	});
	return indexes;
}

interface DomHeading {
	kind: "heading";
	level: HeadingLevel;
	el: HTMLElement;
}

interface DomText {
	kind: "text";
}

type DomBlock = DomHeading | DomText;

export function applyHeadingPageBreaks(
	root: HTMLElement,
	breakOn: HeadingFlags
): void {
	const blocks = collectBlocks(root);
	const placements = blockPlacements(blocks, breakOn);
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
}

function collectBlocks(root: HTMLElement): DomBlock[] {
	const blocks: DomBlock[] = [];
	const visit = (el: HTMLElement) => {
		if (el.classList.contains("metadata-container")) return;
		const level = headingLevel(el);
		if (level) {
			blocks.push({ kind: "heading", level, el });
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
		if (isVisibleBlock(el)) blocks.push({ kind: "text" });
	};
	for (const child of Array.from(root.children)) {
		if (child instanceof HTMLElement) visit(child);
	}
	return blocks;
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
