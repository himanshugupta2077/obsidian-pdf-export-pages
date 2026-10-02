import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_SETTINGS,
	clampFontSize,
	sanitizeSettings,
} from "./settings.ts";

describe("sanitizeSettings", () => {
	it("starts from A4 portrait, minimal margin, full size, and H1 to H3", () => {
		const { settings, fontSizeSet } = sanitizeSettings(undefined);
		assert.equal(fontSizeSet, false);
		assert.equal(settings.pageSize, "A4");
		assert.equal(settings.landscape, false);
		assert.equal(settings.margin, "minimal");
		assert.equal(settings.scalePercent, 100);
		assert.equal(settings.fontSize, 16);
		assert.equal(settings.includeName, false);
		assert.equal(settings.frontPage, true);
		assert.equal(settings.toc, true);
		assert.deepEqual(settings.breakOn, {
			1: true,
			2: true,
			3: true,
			4: false,
			5: false,
			6: false,
		});
	});

	it("keeps a saved heading choice and drops unknown page sizes", () => {
		const { settings, fontSizeSet } = sanitizeSettings({
			pageSize: "Poster",
			margin: "none",
			landscape: true,
			scalePercent: 250,
			fontSize: 20.4,
			includeName: true,
			frontPage: false,
			toc: false,
			breakOn: { 1: false, 4: true, 9: true },
		});
		assert.equal(fontSizeSet, true);
		assert.equal(settings.pageSize, DEFAULT_SETTINGS.pageSize);
		assert.equal(settings.margin, "none");
		assert.equal(settings.landscape, true);
		assert.equal(settings.scalePercent, 100);
		assert.equal(settings.fontSize, 20);
		assert.equal(settings.includeName, true);
		assert.equal(settings.frontPage, false);
		assert.equal(settings.toc, false);
		assert.equal(settings.breakOn[1], false);
		assert.equal(settings.breakOn[2], true);
		assert.equal(settings.breakOn[4], true);
		assert.equal(settings.breakOn[6], false);
	});
});

describe("clampFontSize", () => {
	it("keeps the size inside the slider range", () => {
		assert.equal(clampFontSize(7), 8);
		assert.equal(clampFontSize(36), 36);
		assert.equal(clampFontSize(80), 36);
		assert.equal(clampFontSize(Number.NaN), 16);
	});
});
