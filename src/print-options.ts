import {
	clampScalePercent,
	type MarginChoice,
	type PageSize,
	type PdfSettings,
} from "./settings.ts";

export interface InchMargins {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface PrintToPdfRequest {
	filepath: string;
	open: boolean;
	pageSize: PageSize;
	landscape: boolean;
	marginsType: 0 | 1 | 2;
	margins: InchMargins;
	scale: number;
	printBackground: true;
	preferCSSPageSize: false;
	/**
	 * Chromium only embeds the heading outline when tagging is on.
	 * macOS Preview's sidebar reads that outline.
	 */
	generateTaggedPDF: true;
	generateDocumentOutline: true;
}

/** Paper size in inches. Matches Electron's printToPDF page sizes. */
export const PAPER_INCHES: Record<PageSize, { width: number; height: number }> = {
	A3: { width: 11.7, height: 16.54 },
	A4: { width: 8.27, height: 11.7 },
	A5: { width: 5.83, height: 8.27 },
	Legal: { width: 8.5, height: 14 },
	Letter: { width: 8.5, height: 11 },
	Tabloid: { width: 11, height: 17 },
};

/**
 * Inches. Electron 43 reads margins.top/right/bottom/left and ignores marginsType.
 * Minimal used to send 0, which put text on the top edge of every page.
 * 0.6in is about 15mm, enough that a heading is not flush with the paper.
 */
export const MARGIN_INCHES: Record<MarginChoice, InchMargins> = {
	default: { top: 0.4, right: 0.4, bottom: 0.4, left: 0.4 },
	minimal: { top: 0.6, right: 0.4, bottom: 0.5, left: 0.4 },
	none: { top: 0, right: 0, bottom: 0, left: 0 },
};

export function marginInches(margin: MarginChoice): InchMargins {
	return { ...MARGIN_INCHES[margin] };
}

export function paperInches(
	pageSize: PageSize,
	landscape: boolean
): { width: number; height: number } {
	const size = PAPER_INCHES[pageSize];
	return landscape
		? { width: size.height, height: size.width }
		: { width: size.width, height: size.height };
}

export function marginsTypeFor(margin: MarginChoice): 0 | 1 | 2 {
	if (margin === "none") return 1;
	if (margin === "minimal") return 2;
	return 0;
}

export function buildPrintRequest(
	settings: Pick<PdfSettings, "pageSize" | "landscape" | "margin" | "scalePercent">,
	filepath: string
): PrintToPdfRequest {
	return {
		filepath,
		open: true,
		pageSize: settings.pageSize,
		landscape: settings.landscape,
		marginsType: marginsTypeFor(settings.margin),
		margins: marginInches(settings.margin),
		scale: clampScalePercent(settings.scalePercent) / 100,
		printBackground: true,
		preferCSSPageSize: false,
		generateTaggedPDF: true,
		generateDocumentOutline: true,
	};
}
