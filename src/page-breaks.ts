import {
	isHeadingLevel,
	type HeadingFlags,
	type HeadingLevel,
} from "./settings.ts";

export type ContentBlock =
	| { kind: "heading"; level: HeadingLevel }
	| { kind: "text" };

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export function blocksThatBreak(
	blocks: readonly ContentBlock[],
	breakOn: HeadingFlags
): number[] {
	const indexes: number[] = [];
	let preceded = false;
	blocks.forEach((block, index) => {
		if (block.kind === "heading" && breakOn[block.level] && preceded) {
			indexes.push(index);
		}
		preceded = true;
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
	const breaks = new Set(blocksThatBreak(blocks, breakOn));
	blocks.forEach((block, index) => {
		if (block.kind !== "heading") return;
		setPageBreak(block.el, breaks.has(index));
	});
}

function setPageBreak(el: HTMLElement, on: boolean): void {
	el.classList.toggle("page-pdf-break", on);
	el.style.breakBefore = on ? "page" : "";
	el.style.pageBreakBefore = on ? "always" : "";
	el.style.breakAfter = on ? "avoid" : "";
	el.style.pageBreakAfter = on ? "avoid" : "";
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
