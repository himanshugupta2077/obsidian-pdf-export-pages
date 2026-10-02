import { isHeadingLevel, type HeadingLevel } from "./settings.ts";

export interface TocHeading {
	level: HeadingLevel;
	text: string;
}

export interface TocEntry {
	level: HeadingLevel;
	text: string;
	id: string;
	label: string;
}

export function wikilinkLabel(text: string): string {
	return `[[#${text}]]`;
}

export function buildToc(headings: readonly TocHeading[]): TocEntry[] {
	const entries: TocEntry[] = [];
	for (const heading of headings) {
		const text = heading.text.replace(/\s+/g, " ").trim();
		if (!text || !isHeadingLevel(heading.level)) continue;
		const id = `pdf-h-${entries.length + 1}`;
		entries.push({
			level: heading.level,
			text,
			id,
			label: wikilinkLabel(text),
		});
	}
	return entries;
}

export function headingTarget(
	entries: readonly TocEntry[],
	dataHref: string
): string | null {
	if (!dataHref.startsWith("#")) return null;
	let text = dataHref.slice(1);
	try {
		text = decodeURIComponent(text);
	} catch {
		text = dataHref.slice(1);
	}
	text = text.replace(/\s+/g, " ").trim();
	if (!text) return null;
	const found = entries.find((entry) => entry.text === text);
	return found ? `#${found.id}` : null;
}
