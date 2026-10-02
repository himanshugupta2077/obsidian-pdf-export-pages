import { applyHeadingPageBreaks } from "./page-breaks.ts";
import { isHeadingLevel, type HeadingLevel, type PdfSettings } from "./settings.ts";
import { buildToc, headingTarget, type TocEntry } from "./toc.ts";

export function appendFrontPage(parent: HTMLElement, title: string): HTMLElement {
	const page = parent.createDiv({ cls: "page-pdf-front" });
	page.style.breakAfter = "page";
	page.style.pageBreakAfter = "always";
	page.style.breakBefore = "auto";
	page.style.pageBreakBefore = "auto";
	page.style.height = "75vh";
	page.style.display = "flex";
	page.style.alignItems = "center";
	page.style.justifyContent = "center";
	page.style.textAlign = "center";
	page.style.color = "#111111";
	const name = page.createDiv({ cls: "page-pdf-front-title", text: title });
	name.style.fontSize = "2em";
	name.style.fontWeight = "600";
	name.style.lineHeight = "1.3";
	name.style.maxWidth = "80%";
	name.style.color = "#111111";
	return page;
}

export function appendToc(slot: HTMLElement, entries: readonly TocEntry[]): HTMLElement {
	const nav = slot.createEl("nav", { cls: "page-pdf-toc" });
	nav.style.breakAfter = "page";
	nav.style.pageBreakAfter = "always";
	nav.style.breakBefore = "auto";
	nav.style.pageBreakBefore = "auto";
	nav.style.display = "block";
	nav.style.visibility = "visible";
	nav.style.color = "#111111";
	const title = nav.createDiv({ cls: "page-pdf-toc-title", text: "Contents" });
	title.style.fontSize = "1.6em";
	title.style.fontWeight = "600";
	title.style.textAlign = "center";
	title.style.margin = "0 0 0.7em";
	title.style.paddingBottom = "0.35em";
	title.style.borderBottom = "1px solid #d0d0d0";
	title.style.color = "#111111";
	const list = nav.createEl("ul", { cls: "page-pdf-toc-list" });
	list.style.listStyle = "none";
	list.style.margin = "0.4em 0 0";
	list.style.padding = "0";
	for (const entry of entries) {
		const item = list.createEl("li", { cls: "page-pdf-toc-item" });
		item.dataset.level = String(entry.level);
		item.style.margin = entry.level === 1 ? "0.65em 0 0.12em" : "0.22em 0";
		item.style.paddingLeft = `${(entry.level - 1) * 1.25}em`;
		item.style.breakInside = "avoid";
		item.style.pageBreakInside = "avoid";
		const link = item.createEl("a", {
			cls: "page-pdf-toc-link",
			text: entry.text,
		});
		link.setAttribute("href", `#${entry.id}`);
		link.style.color = "#111111";
		link.style.textDecoration = "none";
		link.style.fontWeight = entry.level === 1 ? "600" : "400";
		link.style.display = "block";
		link.style.lineHeight = "1.35";
	}
	return nav;
}

export function stampHeadings(root: HTMLElement): TocEntry[] {
	const nodes = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
		(node): node is HTMLElement =>
			node instanceof HTMLElement && !node.closest(".metadata-container")
	);
	const headings: { level: HeadingLevel; text: string }[] = [];
	for (const node of nodes) {
		const level = headingLevel(node);
		const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
		if (level && text) headings.push({ level, text });
	}
	const entries = buildToc(headings);
	let index = 0;
	for (const node of nodes) {
		const level = headingLevel(node);
		const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
		if (!level || !text) continue;
		const entry = entries[index];
		index += 1;
		if (!entry) continue;
		node.id = entry.id;
	}
	return entries;
}

export function retargetInternalLinks(root: HTMLElement, entries: readonly TocEntry[]): void {
	for (const link of Array.from(root.querySelectorAll("a.internal-link"))) {
		const target = headingTarget(entries, link.getAttribute("data-href") ?? "");
		if (target) link.setAttribute("href", target);
		else link.removeAttribute("href");
	}
}

export function hideMetadata(root: HTMLElement): void {
	for (const node of Array.from(root.querySelectorAll(".metadata-container"))) {
		if (node instanceof HTMLElement) node.style.display = "none";
	}
}

export function finishNote(
	preview: HTMLElement,
	body: HTMLElement,
	basename: string,
	settings: PdfSettings,
	overrides?: ReadonlyMap<number, boolean>
): TocEntry[] {
	hideMetadata(body);
	if (settings.includeName && !settings.frontPage) {
		const title = body.createEl("h1", { text: basename, cls: "page-pdf-title" });
		body.prepend(title);
	}
	const entries = stampHeadings(body);
	retargetInternalLinks(body, entries);
	applyHeadingPageBreaks(body, settings.breakOn, overrides);
	if (settings.frontPage) {
		preview.prepend(appendFrontPage(preview, basename));
	}
	if (settings.toc && entries.length > 0) {
		const slot = preview.createDiv({ cls: "page-pdf-toc-slot" });
		appendToc(slot, entries);
		const front = preview.querySelector(".page-pdf-front");
		if (front) front.after(slot);
		else preview.prepend(slot);
	}
	return entries;
}

function headingLevel(node: HTMLElement): HeadingLevel | null {
	const level = Number(node.tagName.slice(1));
	return isHeadingLevel(level) ? level : null;
}

export function waitForImages(root: HTMLElement): Promise<void> {
	const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
	if (pending.length === 0) return Promise.resolve();
	return Promise.all(
		pending.map(
			(img) =>
				new Promise<void>((resolve) => {
					const done = () => resolve();
					img.addEventListener("load", done, { once: true });
					img.addEventListener("error", done, { once: true });
				})
		)
	).then(() => undefined);
}
