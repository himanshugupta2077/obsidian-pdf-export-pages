import {
	clampScalePercent,
	type MarginChoice,
	type PageSize,
	type PdfSettings,
} from "./settings.ts";

export interface PrintToPdfRequest {
	filepath: string;
	open: true;
	pageSize: PageSize;
	landscape: boolean;
	marginsType: 0 | 1 | 2;
	margins?: { top: number; left: number; bottom: number; right: number };
	scale: number;
	printBackground: true;
	preferCSSPageSize: false;
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
	const marginsType = marginsTypeFor(settings.margin);
	const request: PrintToPdfRequest = {
		filepath,
		open: true,
		pageSize: settings.pageSize,
		landscape: settings.landscape,
		marginsType,
		scale: clampScalePercent(settings.scalePercent) / 100,
		printBackground: true,
		preferCSSPageSize: false,
	};
	if (marginsType === 1 || marginsType === 2) {
		request.margins = { top: 0, left: 0, bottom: 0, right: 0 };
	}
	return request;
}
