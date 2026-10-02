import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildToc, headingTarget } from "./toc.ts";

describe("buildToc", () => {
	it("lists heading names in document order", () => {
		const entries = buildToc([
			{ level: 1, text: "Overview" },
			{ level: 2, text: "  Setup steps  " },
			{ level: 3, text: "   " },
			{ level: 1, text: "Overview" },
		]);
		assert.deepEqual(
			entries.map((entry) => entry.text),
			["Overview", "Setup steps", "Overview"]
		);
		assert.equal(
			entries.some((entry) => entry.text.includes("[[#")),
			false
		);
		assert.deepEqual(
			entries.map((entry) => entry.id),
			["pdf-h-1", "pdf-h-2", "pdf-h-3"]
		);
		assert.deepEqual(
			entries.map((entry) => entry.level),
			[1, 2, 1]
		);
	});
});

describe("headingTarget", () => {
	const entries = buildToc([
		{ level: 1, text: "Heading here" },
		{ level: 2, text: "Next item" },
	]);

	it("points a same-file heading link at that heading", () => {
		assert.equal(headingTarget(entries, "#Heading here"), "#pdf-h-1");
		assert.equal(headingTarget(entries, "#Next%20item"), "#pdf-h-2");
	});

	it("leaves links to other notes alone", () => {
		assert.equal(headingTarget(entries, "Other note#Heading here"), null);
		assert.equal(headingTarget(entries, "#Missing"), null);
	});
});
