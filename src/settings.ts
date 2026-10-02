export const PAGE_SIZES = ["A3", "A4", "A5", "Legal", "Letter", "Tabloid"] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const MARGINS = ["default", "minimal", "none"] as const;
export type MarginChoice = (typeof MARGINS)[number];

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];
export type HeadingFlags = Record<HeadingLevel, boolean>;

export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 36;
export const MIN_SCALE_PERCENT = 10;
export const MAX_SCALE_PERCENT = 100;

export interface PdfSettings {
	includeName: boolean;
	pageSize: PageSize;
	landscape: boolean;
	margin: MarginChoice;
	scalePercent: number;
	fontSize: number;
	breakOn: HeadingFlags;
}

export const DEFAULT_BREAKS: HeadingFlags = {
	1: true,
	2: true,
	3: true,
	4: false,
	5: false,
	6: false,
};

export const DEFAULT_SETTINGS: PdfSettings = {
	includeName: false,
	pageSize: "A4",
	landscape: false,
	margin: "minimal",
	scalePercent: 100,
	fontSize: DEFAULT_FONT_SIZE,
	breakOn: { ...DEFAULT_BREAKS },
};

const PAGE_SIZE_SET = new Set<string>(PAGE_SIZES);
const MARGIN_SET = new Set<string>(MARGINS);

export function isPageSize(value: unknown): value is PageSize {
	return typeof value === "string" && PAGE_SIZE_SET.has(value);
}

export function isMargin(value: unknown): value is MarginChoice {
	return typeof value === "string" && MARGIN_SET.has(value);
}

export function isHeadingLevel(value: number): value is HeadingLevel {
	return HEADING_LEVELS.some((level) => level === value);
}

export function clampFontSize(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
	return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function clampScalePercent(value: number): number {
	if (!Number.isFinite(value)) return MAX_SCALE_PERCENT;
	return Math.min(
		MAX_SCALE_PERCENT,
		Math.max(MIN_SCALE_PERCENT, Math.round(value))
	);
}

export function cloneSettings(settings: PdfSettings): PdfSettings {
	return {
		...settings,
		breakOn: { ...settings.breakOn },
	};
}

export interface SanitizedSettings {
	settings: PdfSettings;
	fontSizeSet: boolean;
}

export function sanitizeSettings(raw: unknown): SanitizedSettings {
	const settings = cloneSettings(DEFAULT_SETTINGS);
	if (!raw || typeof raw !== "object") {
		return { settings, fontSizeSet: false };
	}
	const stored = raw as Partial<PdfSettings> & { breakOn?: unknown };
	if (typeof stored.includeName === "boolean") {
		settings.includeName = stored.includeName;
	}
	if (isPageSize(stored.pageSize)) settings.pageSize = stored.pageSize;
	if (typeof stored.landscape === "boolean") settings.landscape = stored.landscape;
	if (isMargin(stored.margin)) settings.margin = stored.margin;
	if (typeof stored.scalePercent === "number") {
		settings.scalePercent = clampScalePercent(stored.scalePercent);
	}
	const fontSize = stored.fontSize;
	const fontSizeSet = typeof fontSize === "number";
	if (fontSizeSet) settings.fontSize = clampFontSize(fontSize);
	settings.breakOn = readBreaks(stored.breakOn);
	return { settings, fontSizeSet };
}

function readBreaks(raw: unknown): HeadingFlags {
	const flags: HeadingFlags = { ...DEFAULT_BREAKS };
	if (!raw || typeof raw !== "object") return flags;
	const record = raw as Record<string, unknown>;
	for (const level of HEADING_LEVELS) {
		const value = record[String(level)];
		if (typeof value === "boolean") flags[level] = value;
	}
	return flags;
}
