import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupOntoPages } from "./page-groups.ts";

describe("groupOntoPages", () => {
	it("keeps short blocks on one page", () => {
		assert.deepEqual(
			groupOntoPages(
				[
					{ height: 20, breakBefore: false },
					{ height: 20, breakBefore: false },
				],
				100
			),
			[[0, 1]]
		);
	});

	it("starts a new page at a heading break and when the page is full", () => {
		assert.deepEqual(
			groupOntoPages(
				[
					{ height: 40, breakBefore: false },
					{ height: 40, breakBefore: false },
					{ height: 30, breakBefore: true },
					{ height: 80, breakBefore: false },
				],
				100
			),
			[[0, 1], [2], [3]]
		);
	});

	it("does not open with an empty page when the first block asks for a break", () => {
		assert.deepEqual(
			groupOntoPages([{ height: 10, breakBefore: true }], 100),
			[[0]]
		);
	});
});
