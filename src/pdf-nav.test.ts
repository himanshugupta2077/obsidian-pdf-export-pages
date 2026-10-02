import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { enablePreviewNavigation } from "./pdf-nav.ts";

describe("enablePreviewNavigation", () => {
	it("turns named contents links into explicit GoTo actions and opens the outline", () => {
		const original = samplePdf();
		const patched = enablePreviewNavigation(original);
		assert.notEqual(patched, original);
		const text = new TextDecoder("latin1").decode(patched);
		assert.match(text, /\/PageMode \/UseOutlines/);
		const latestLink = text.slice(text.lastIndexOf("6 0 obj"));
		assert.match(latestLink, /\/S \/GoTo/);
		assert.match(latestLink, /\/D \[3 0 R \/XYZ 10 180 0\]/);
		assert.equal(latestLink.includes("/Dest /pdf-h-1"), false);
		const dir = mkdtempSync(join(tmpdir(), "pdf-nav-"));
		const file = join(dir, "sample.pdf");
		try {
			writeFileSync(file, patched);
			execFileSync("qpdf", ["--check", "--warning-exit-0", file], { stdio: "pipe" });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}

		const again = enablePreviewNavigation(patched);
		assert.equal(again, patched);
	});

	it("leaves a PDF alone when it has no contents links and no outline", () => {
		const original = ascii("%PDF-1.4\ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n9\n%%EOF\n");
		assert.equal(enablePreviewNavigation(original), original);
	});
});

function samplePdf(): Uint8Array {
	const objects = [
		"",
		"<< /Type /Catalog /Pages 2 0 R /Dests 4 0 R /Outlines 5 0 R /MarkInfo << /Marked true >> >>",
		"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [6 0 R] /Resources << >> >>",
		"<< /pdf-h-1 [3 0 R /XYZ 10 180 0] >>",
		"<< /Type /Outlines /Count 0 >>",
		"<< /Type /Annot /Subtype /Link /Rect [10 10 80 30] /Border [0 0 0] /Dest /pdf-h-1 >>",
	];
	let body = "%PDF-1.4\n";
	const offsets = [0];
	for (let index = 1; index < objects.length; index += 1) {
		offsets[index] = body.length;
		body += `${index} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xrefAt = body.length;
	let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
	for (let index = 1; index < objects.length; index += 1) {
		xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
	}
	body += xref;
	body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
	return ascii(body);
}

function ascii(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}
