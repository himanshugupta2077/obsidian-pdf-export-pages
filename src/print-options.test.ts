import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPrintRequest } from "./print-options.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

describe("buildPrintRequest", () => {
	it("prints A4 portrait at full size with a minimal margin and backgrounds", () => {
		const request = buildPrintRequest(DEFAULT_SETTINGS, "/tmp/note.pdf");
		assert.equal(request.filepath, "/tmp/note.pdf");
		assert.equal(request.open, true);
		assert.equal(request.pageSize, "A4");
		assert.equal(request.landscape, false);
		assert.equal(request.marginsType, 2);
		assert.deepEqual(request.margins, { top: 0, left: 0, bottom: 0, right: 0 });
		assert.equal(request.scale, 1);
		assert.equal(request.printBackground, true);
		assert.equal(request.preferCSSPageSize, false);
	});

	it("uses Obsidian's margin codes for default and none", () => {
		const none = buildPrintRequest(
			{ ...DEFAULT_SETTINGS, margin: "none", scalePercent: 10 },
			"a.pdf"
		);
		assert.equal(none.marginsType, 1);
		assert.equal(none.scale, 0.1);

		const standard = buildPrintRequest(
			{ ...DEFAULT_SETTINGS, margin: "default", landscape: true, pageSize: "Letter" },
			"b.pdf"
		);
		assert.equal(standard.marginsType, 0);
		assert.equal(standard.margins, undefined);
		assert.equal(standard.landscape, true);
		assert.equal(standard.pageSize, "Letter");
	});
});
