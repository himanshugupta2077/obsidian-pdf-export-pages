import { Setting } from "obsidian";
import {
	HEADING_LEVELS,
	MAX_FONT_SIZE,
	MAX_SCALE_PERCENT,
	MIN_FONT_SIZE,
	MIN_SCALE_PERCENT,
	PAGE_SIZES,
	type PdfSettings,
} from "./settings.ts";

const MARGIN_LABELS: Record<PdfSettings["margin"], string> = {
	default: "Default",
	minimal: "Minimal",
	none: "None",
};

export function renderPdfSettings(
	container: HTMLElement,
	settings: PdfSettings,
	onChange: () => void
): void {
	new Setting(container)
		.setName("Front page")
		.setDesc("The file name, centered in the middle of the first page. No properties or other metadata.")
		.addToggle((toggle) =>
			toggle.setValue(settings.frontPage).onChange((value) => {
				settings.frontPage = value;
				onChange();
			})
		);

	new Setting(container)
		.setName("Table of contents")
		.setDesc("A contents page after the front page. Each line is the heading name, indented by level.")
		.addToggle((toggle) =>
			toggle.setValue(settings.toc).onChange((value) => {
				settings.toc = value;
				onChange();
			})
		);

	new Setting(container)
		.setName("Include file name as title")
		.setDesc("Adds the file name above the note when the front page is off.")
		.addToggle((toggle) =>
			toggle.setValue(settings.includeName).onChange((value) => {
				settings.includeName = value;
				onChange();
			})
		);

	new Setting(container)
		.setName("Page size")
		.setDesc("A4 portrait, a minimal margin, and full size are the defaults.")
		.addDropdown((dropdown) => {
			for (const size of PAGE_SIZES) dropdown.addOption(size, size);
			dropdown.setValue(settings.pageSize).onChange((value) => {
				if (isPageSizeValue(value)) settings.pageSize = value;
				onChange();
			});
		});

	new Setting(container).setName("Landscape").addToggle((toggle) =>
		toggle.setValue(settings.landscape).onChange((value) => {
			settings.landscape = value;
			onChange();
		})
	);

	new Setting(container)
		.setName("Margin")
		.setDesc("Minimal keeps a real top margin so text does not sit on the edge of the page.")
		.addDropdown((dropdown) => {
			dropdown
				.addOption("default", MARGIN_LABELS.default)
				.addOption("minimal", MARGIN_LABELS.minimal)
				.addOption("none", MARGIN_LABELS.none)
				.setValue(settings.margin)
				.onChange((value) => {
					if (value === "default" || value === "minimal" || value === "none") {
						settings.margin = value;
					}
					onChange();
				});
		});

	new Setting(container)
		.setName("Downscale percent")
		.setDesc("100 keeps text and images at full size, with background colors.")
		.addSlider((slider) =>
			slider
				.setLimits(MIN_SCALE_PERCENT, MAX_SCALE_PERCENT, 1)
				.setValue(settings.scalePercent)
				.setDynamicTooltip()
				.onChange((value) => {
					settings.scalePercent = value;
					onChange();
				})
		);

	new Setting(container)
		.setName("Font size")
		.setDesc("Body text size in the PDF. Headings scale with it.")
		.addSlider((slider) =>
			slider
				.setLimits(MIN_FONT_SIZE, MAX_FONT_SIZE, 1)
				.setValue(settings.fontSize)
				.setDynamicTooltip()
				.onChange((value) => {
					settings.fontSize = value;
					onChange();
				})
		);

	new Setting(container)
		.setName("New page before")
		.setDesc("A checked level starts on a new page. In the export window, each heading has its own switch. The first block stays on page 1. A heading that follows another heading stays with it until you turn that heading on.")
		.setHeading();

	for (const level of HEADING_LEVELS) {
		new Setting(container).setName(`H${level}`).addToggle((toggle) =>
			toggle.setValue(settings.breakOn[level]).onChange((value) => {
				settings.breakOn[level] = value;
				onChange();
			})
		);
	}
}

function isPageSizeValue(value: string): value is PdfSettings["pageSize"] {
	return PAGE_SIZES.some((size) => size === value);
}
