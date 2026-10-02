import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blocksThatBreak, type ContentBlock } from "./page-breaks.ts";
import { DEFAULT_BREAKS, type HeadingFlags } from "./settings.ts";

function breaks(blocks: ContentBlock[], flags: HeadingFlags = DEFAULT_BREAKS): number[] {
	return blocksThatBreak(blocks, flags);
}

describe("blocksThatBreak", () => {
	it("keeps the first block on page 1", () => {
		const blocks: ContentBlock[] = [
			{ kind: "heading", level: 1 },
			{ kind: "text" },
			{ kind: "heading", level: 2 },
		];
		assert.deepEqual(breaks(blocks), [2]);
	});

	it("keeps an H1 and the H2 directly under it on the same page", () => {
		const blocks: ContentBlock[] = [
			{ kind: "heading", level: 1 },
			{ kind: "heading", level: 2 },
			{ kind: "text" },
			{ kind: "heading", level: 2 },
		];
		assert.deepEqual(breaks(blocks), [3]);
	});

	it("starts a new page only when content separates the headings", () => {
		const blocks: ContentBlock[] = [
			{ kind: "heading", level: 1 },
			{ kind: "heading", level: 2 },
			{ kind: "text" },
			{ kind: "heading", level: 3 },
			{ kind: "heading", level: 1 },
		];
		assert.deepEqual(breaks(blocks), [3]);
	});

	it("leaves H4 to H6 on the same page until those levels are turned on", () => {
		const blocks: ContentBlock[] = [
			{ kind: "text" },
			{ kind: "heading", level: 4 },
			{ kind: "heading", level: 5 },
			{ kind: "heading", level: 6 },
		];
		assert.deepEqual(breaks(blocks), []);
		assert.deepEqual(
			breaks(blocks, { 1: false, 2: false, 3: false, 4: true, 5: true, 6: true }),
			[1]
		);
	});

	it("breaks an opening heading when something comes before it", () => {
		const blocks: ContentBlock[] = [
			{ kind: "text" },
			{ kind: "heading", level: 1 },
		];
		assert.deepEqual(breaks(blocks), [1]);
	});
});
