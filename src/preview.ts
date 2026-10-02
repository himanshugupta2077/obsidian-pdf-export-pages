import { Component, MarkdownRenderer, TFile, type App } from "obsidian";
import { applyHeadingPageBreaks, collectFlowBlocks, type HeadingBreakTarget } from "./page-breaks.ts";
import { groupOntoPages } from "./page-groups.ts";
import {
	appendFrontPage,
	appendToc,
	hideMetadata,
	retargetInternalLinks,
	stampHeadings,
	waitForImages,
} from "./print-document.ts";
import { marginInches, paperInches } from "./print-options.ts";
import { clampScalePercent, type HeadingLevel, type PdfSettings } from "./settings.ts";

export interface ListedHeading extends HeadingBreakTarget {
	text: string;
}

const PX_PER_INCH = 96;

export async function renderNoteSource(
	app: App,
	file: TFile,
	component: Component
): Promise<HTMLElement> {
	const host = document.body.createDiv({
		cls: "page-pdf-source theme-light markdown-preview-view markdown-rendered",
	});
	host.style.position = "fixed";
	host.style.left = "-100000px";
	host.style.top = "0";
	host.style.width = "800px";
	host.style.padding = "0";
	host.style.pointerEvents = "none";
	host.style.color = "#222222";
	host.style.background = "#ffffff";
	const markdown = await app.vault.cachedRead(file);
	await MarkdownRenderer.render(app, markdown, host, file.path, component);
	hideMetadata(host);
	if (document.fonts?.ready) await document.fonts.ready;
	await waitForImages(host);
	return host;
}

export function listHeadings(
	source: HTMLElement,
	basename: string,
	settings: Pick<PdfSettings, "includeName" | "frontPage">
): ListedHeading[] {
	const probe = document.createElement("div");
	for (const child of Array.from(source.childNodes)) {
		probe.appendChild(child.cloneNode(true));
	}
	if (settings.includeName && !settings.frontPage) {
		const title = document.createElement("h1");
		title.textContent = basename;
		probe.prepend(title);
	}
	const blocks = collectFlowBlocks(probe);
	const listed: ListedHeading[] = [];
	blocks.forEach((block, index) => {
		if (block.kind !== "heading" || block.level === null || block.headingIndex === null) return;
		listed.push({
			headingIndex: block.headingIndex,
			level: block.level,
			text: block.text,
			isFirstBlock: index === 0,
			followsHeading: index > 0 && blocks[index - 1]?.kind === "heading",
		});
	});
	return listed;
}

export function paintPreview(options: {
	mount: HTMLElement;
	source: HTMLElement;
	basename: string;
	settings: PdfSettings;
	overrides: ReadonlyMap<number, boolean>;
}): void {
	const { mount, source, basename, settings, overrides } = options;
	mount.empty();
	const paper = paperInches(settings.pageSize, settings.landscape);
	const margins = marginInches(settings.margin);
	const printScale = clampScalePercent(settings.scalePercent) / 100;
	const pageWidth = paper.width * PX_PER_INCH;
	const pageHeight = paper.height * PX_PER_INCH;
	const marginPx = {
		top: margins.top * PX_PER_INCH,
		right: margins.right * PX_PER_INCH,
		bottom: margins.bottom * PX_PER_INCH,
		left: margins.left * PX_PER_INCH,
	};
	const contentWidth = Math.max(72, pageWidth - marginPx.left - marginPx.right);
	const contentHeight = Math.max(72, pageHeight - marginPx.top - marginPx.bottom);
	const layoutWidth = contentWidth / printScale;
	const layoutCapacity = contentHeight / printScale;
	const fit = fitScale(mount, pageWidth);
	let pageNumber = 1;

	const measure = document.body.createDiv({
		cls: "page-pdf-measure theme-light markdown-preview-view markdown-rendered",
	});
	measure.style.position = "fixed";
	measure.style.left = "-100000px";
	measure.style.top = "0";
	measure.style.width = `${layoutWidth}px`;
	measure.style.padding = "0";
	measure.style.fontSize = `${settings.fontSize}px`;
	measure.style.setProperty("--font-text-size", `${settings.fontSize}px`);
	measure.style.color = "#222222";
	measure.style.background = "#ffffff";
	measure.style.height = "auto";
	measure.style.maxHeight = "none";
	measure.style.overflow = "visible";

	const addSheet = (fill: (flow: HTMLElement) => void, unscaledHeight?: number): void => {
		const visualContent =
			unscaledHeight === undefined
				? contentHeight
				: Math.max(contentHeight, unscaledHeight * printScale);
		const sheetHeight = marginPx.top + marginPx.bottom + visualContent;
		const wrap = mount.createDiv({ cls: "page-pdf-sheet-wrap" });
		const sheet = wrap.createDiv({ cls: "page-pdf-sheet theme-light" });
		sheet.style.width = `${pageWidth * fit}px`;
		sheet.style.height = `${sheetHeight * fit}px`;
		const zoom = sheet.createDiv({ cls: "page-pdf-sheet-zoom" });
		zoom.style.width = `${pageWidth}px`;
		zoom.style.height = `${sheetHeight}px`;
		zoom.style.transform = `scale(${fit})`;
		const pad = zoom.createDiv({
			cls: "page-pdf-sheet-pad markdown-preview-view markdown-rendered",
		});
		pad.style.boxSizing = "border-box";
		pad.style.width = `${pageWidth}px`;
		pad.style.height = "auto";
		pad.style.maxHeight = "none";
		pad.style.overflow = "visible";
		pad.style.minHeight = `${sheetHeight}px`;
		pad.style.padding = `${marginPx.top}px ${marginPx.right}px ${marginPx.bottom}px ${marginPx.left}px`;
		pad.style.fontSize = `${settings.fontSize}px`;
		pad.style.setProperty("--font-text-size", `${settings.fontSize}px`);
		pad.style.color = "#222222";
		pad.style.background = "#ffffff";
		const flow = pad.createDiv({ cls: "page-pdf-sheet-flow" });
		flow.style.width = `${layoutWidth}px`;
		flow.style.setProperty("zoom", String(printScale));
		fill(flow);
		wrap.createDiv({ cls: "page-pdf-sheet-num", text: `Page ${pageNumber}` });
		pageNumber += 1;
	};

	try {
		const body = measure.createDiv({ cls: "page-pdf-body" });
		for (const child of Array.from(source.childNodes)) {
			body.appendChild(child.cloneNode(true));
		}
		if (settings.includeName && !settings.frontPage) {
			const title = body.createEl("h1", { text: basename, cls: "page-pdf-title" });
			body.prepend(title);
		}
		hideMetadata(body);
		const entries = stampHeadings(body);
		retargetInternalLinks(body, entries);
		applyHeadingPageBreaks(body, settings.breakOn, overrides);

		if (settings.frontPage) {
			addSheet((flow) => {
				const page = appendFrontPage(flow, basename);
				page.style.height = `${layoutCapacity}px`;
				page.style.breakAfter = "auto";
				page.style.pageBreakAfter = "auto";
			});
		}

		if (settings.toc && entries.length > 0) {
			paintToc(measure, entries, layoutWidth, layoutCapacity, addSheet);
		}

		const blocks = collectFlowBlocks(body);
		if (blocks.length > 0) {
			const heights = blocks.map((block) => outerHeight(block.el));
			const groups = groupOntoPages(
				blocks.map((block, index) => ({
					height: heights[index] ?? 0,
					breakBefore: block.el.classList.contains("page-pdf-break"),
				})),
				layoutCapacity
			);
			for (const indexes of groups) {
				const unscaled = indexes.reduce((sum, index) => sum + (heights[index] ?? 0), 0);
				addSheet((flow) => {
					for (const index of indexes) {
						const block = blocks[index];
						if (block) flow.appendChild(block.el);
					}
				}, unscaled);
			}
		}
	} finally {
		measure.detach();
	}
}

function paintToc(
	measure: HTMLElement,
	entries: readonly { level: HeadingLevel; text: string; id: string }[],
	layoutWidth: number,
	layoutCapacity: number,
	addSheet: (fill: (flow: HTMLElement) => void, unscaledHeight?: number) => void
): void {
	const probe = measure.createDiv();
	probe.style.width = `${layoutWidth}px`;
	const nav = appendToc(probe, entries);
	nav.style.breakAfter = "auto";
	nav.style.pageBreakAfter = "auto";
	nav.style.height = "auto";
	const title = nav.querySelector(".page-pdf-toc-title");
	const titleHeight = title instanceof HTMLElement ? outerHeight(title) : 0;
	const items = Array.from(nav.querySelectorAll<HTMLElement>(".page-pdf-toc-item"));
	const itemHeights = items.map((item) => outerHeight(item));
	const pages = packWithHeader(titleHeight, itemHeights, layoutCapacity);
	pages.forEach((indexes, pageIndex) => {
		const unscaled =
			(pageIndex === 0 ? titleHeight : 0) +
			indexes.reduce((sum, index) => sum + (itemHeights[index] ?? 0), 0);
		addSheet((flow) => {
			const slot = flow.createDiv();
			const pageNav = appendToc(
				slot,
				indexes.map((index) => entries[index]).filter((entry) => entry !== undefined)
			);
			pageNav.style.breakAfter = "auto";
			pageNav.style.pageBreakAfter = "auto";
			pageNav.style.height = "auto";
			if (pageIndex > 0) pageNav.querySelector(".page-pdf-toc-title")?.remove();
		}, unscaled);
	});
	probe.detach();
}

function packWithHeader(
	headerHeight: number,
	itemHeights: readonly number[],
	capacity: number
): number[][] {
	const pages: number[][] = [];
	let current: number[] = [];
	let used = headerHeight;
	const cap = Math.max(1, capacity);
	itemHeights.forEach((height, index) => {
		if (current.length > 0 && used + height > cap) {
			pages.push(current);
			current = [];
			used = 0;
		}
		current.push(index);
		used += height;
	});
	if (current.length > 0 || pages.length === 0) pages.push(current);
	return pages;
}

function outerHeight(el: HTMLElement): number {
	const style = getComputedStyle(el);
	const top = Number.parseFloat(style.marginTop) || 0;
	const bottom = Number.parseFloat(style.marginBottom) || 0;
	return el.offsetHeight + top + bottom;
}

function fitScale(mount: HTMLElement, pageWidth: number): number {
	const available = Math.max(240, mount.clientWidth - 8);
	if (pageWidth <= 0) return 0.4;
	return Math.min(1, available / pageWidth);
}
