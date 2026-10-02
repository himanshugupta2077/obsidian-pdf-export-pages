/**
 * Chromium writes contents links as named destinations (`/Dest /pdf-h-1`).
 * macOS Preview does not follow those. It follows an explicit `/GoTo` action.
 * Chromium also omits the sidebar outline unless the PDF is tagged, and it
 * never sets `/PageMode /UseOutlines`, so Preview does not open that sidebar.
 * This appends an incremental update that fixes both, without rewriting streams.
 */

interface PdfObject {
	num: number;
	gen: number;
	dict: string;
}

export function enablePreviewNavigation(pdf: Uint8Array): Uint8Array {
	try {
		return patch(pdf);
	} catch {
		return pdf;
	}
}

function patch(pdf: Uint8Array): Uint8Array {
	const text = new TextDecoder("latin1").decode(pdf);
	const trailer = lastTrailer(text);
	if (!trailer) return pdf;
	const objects = objectsFromXrefs(text, trailer.startxref);
	if (!objects) return pdf;
	const root = trailer.dict.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
	if (!root) return pdf;
	const catalog = objects.find((obj) => obj.num === Number(root[1]) && obj.gen === Number(root[2]));
	if (!catalog || !/\/Type\s*\/Catalog\b/.test(catalog.dict)) return pdf;

	const dests = destinationMap(objects, catalog.dict);
	const replacements: PdfObject[] = [];
	for (const obj of objects) {
		const updated = rewriteLink(obj.dict, dests);
		if (updated && updated !== obj.dict) replacements.push({ ...obj, dict: updated });
	}
	const catalogDict = withOutlinePageMode(catalog.dict);
	if (catalogDict !== catalog.dict) replacements.push({ ...catalog, dict: catalogDict });
	if (replacements.length === 0) return pdf;

	return appendUpdate(pdf, replacements, trailer);
}

function destinationMap(objects: readonly PdfObject[], catalogDict: string): Map<string, string> {
	const map = new Map<string, string>();
	const ref = catalogDict.match(/\/Dests\s+(\d+)\s+(\d+)\s+R/);
	if (!ref) return map;
	const dests = objects.find((obj) => obj.num === Number(ref[1]) && obj.gen === Number(ref[2]));
	if (!dests) return map;
	const pattern = /\/(pdf-h-\d+)\s*(\[[^\[\]]*\])/g;
	for (const match of dests.dict.matchAll(pattern)) {
		const name = match[1];
		const explicit = match[2];
		if (name && explicit) map.set(name, explicit.trim());
	}
	return map;
}

function rewriteLink(dict: string, dests: ReadonlyMap<string, string>): string | null {
	if (!/\/Subtype\s*\/Link\b/.test(dict)) return null;
	const named = dict.match(/\/Dest\s+\/(pdf-h-\d+)\b/);
	if (!named?.[1]) return null;
	const explicit = dests.get(named[1]);
	if (!explicit) return null;
	return dict.replace(
		/\/Dest\s+\/pdf-h-\d+\b/,
		`/Dest ${explicit} /A << /S /GoTo /D ${explicit} >>`
	);
}

function withOutlinePageMode(dict: string): string {
	if (!/\/Outlines\b/.test(dict) || /\/PageMode\b/.test(dict)) return dict;
	return dict.replace(/>>\s*$/, " /PageMode /UseOutlines>>");
}

function appendUpdate(
	pdf: Uint8Array,
	replacements: readonly PdfObject[],
	trailer: { dict: string; startxref: number }
): Uint8Array {
	const parts: Uint8Array[] = [pdf];
	let offset = pdf.length;
	if (pdf.length === 0 || pdf[pdf.length - 1] !== 0x0a) {
		parts.push(ascii("\n"));
		offset += 1;
	}
	const placed: { num: number; offset: number }[] = [];
	for (const obj of replacements) {
		const body = ascii(`${obj.num} ${obj.gen} obj\n${obj.dict}\nendobj\n`);
		placed.push({ num: obj.num, offset });
		parts.push(body);
		offset += body.length;
	}
	placed.sort((a, b) => a.num - b.num);
	let xref = "xref\n0 1\n0000000000 65535 f \n";
	for (const entry of placed) {
		xref += `${entry.num} 1\n${String(entry.offset).padStart(10, "0")} 00000 n \n`;
	}
	const xrefOffset = offset;
	const size = trailerSize(trailer.dict);
	const nextTrailer = updateTrailer(trailer.dict, size, trailer.startxref);
	const tail = ascii(`${xref}trailer\n${nextTrailer}\nstartxref\n${xrefOffset}\n%%EOF\n`);
	parts.push(tail);
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let cursor = 0;
	for (const part of parts) {
		out.set(part, cursor);
		cursor += part.length;
	}
	return out;
}

function trailerSize(dict: string): number {
	const size = dict.match(/\/Size\s+(\d+)/);
	return size ? Number(size[1]) : 0;
}

function updateTrailer(dict: string, size: number, prev: number): string {
	let next = dict;
	if (/\/Size\s+\d+/.test(next)) next = next.replace(/\/Size\s+\d+/, `/Size ${size}`);
	else next = next.replace(/<<\s*/, `<< /Size ${size} `);
	if (/\/Prev\s+\d+/.test(next)) next = next.replace(/\/Prev\s+\d+/, `/Prev ${prev}`);
	else next = next.replace(/>>\s*$/, ` /Prev ${prev} >>`);
	return next;
}

function lastTrailer(text: string): { dict: string; startxref: number } | null {
	const xref = text.match(/startxref\s+(\d+)\s*%%EOF\s*$/);
	if (!xref?.[1]) return null;
	const trailerAt = text.lastIndexOf("trailer");
	if (trailerAt < 0) return null;
	const dictAt = text.indexOf("<<", trailerAt);
	if (dictAt < 0) return null;
	const dictEnd = endOfDict(text, dictAt);
	if (dictEnd < 0) return null;
	return { dict: text.slice(dictAt, dictEnd), startxref: Number(xref[1]) };
}

function objectsFromXrefs(text: string, startxref: number): PdfObject[] | null {
	const chain: number[] = [];
	const seen = new Set<number>();
	let at = startxref;
	while (!seen.has(at)) {
		seen.add(at);
		if (!text.startsWith("xref", at)) return null;
		chain.push(at);
		const trailerAt = text.indexOf("trailer", at);
		if (trailerAt < 0) return null;
		const dictAt = text.indexOf("<<", trailerAt);
		if (dictAt < 0) return null;
		const dictEnd = endOfDict(text, dictAt);
		if (dictEnd < 0) return null;
		const prev = text.slice(dictAt, dictEnd).match(/\/Prev\s+(\d+)/);
		if (!prev?.[1]) break;
		at = Number(prev[1]);
	}
	const byNumber = new Map<number, PdfObject>();
	for (const xrefAt of chain.reverse()) {
		const entries = readXref(text, xrefAt);
		if (!entries) return null;
		for (const entry of entries) {
			const obj = readObjectAt(text, entry.offset, entry.num, entry.gen);
			if (obj) byNumber.set(obj.num, obj);
		}
	}
	return [...byNumber.values()];
}

function readXref(
	text: string,
	at: number
): { num: number; gen: number; offset: number }[] | null {
	let cursor = at + 4;
	if (text[cursor] === "\r") cursor += 1;
	if (text[cursor] === "\n") cursor += 1;
	const entries: { num: number; gen: number; offset: number }[] = [];
	while (!text.startsWith("trailer", cursor)) {
		const lineEnd = text.indexOf("\n", cursor);
		if (lineEnd < 0) return null;
		const header = text.slice(cursor, lineEnd).match(/^(\d+)\s+(\d+)\s*$/);
		if (!header?.[1] || !header[2]) return null;
		const startNum = Number(header[1]);
		const count = Number(header[2]);
		cursor = lineEnd + 1;
		for (let index = 0; index < count; index += 1) {
			const row = text.slice(cursor, cursor + 20);
			if (row.length < 20) return null;
			cursor += 20;
			if (row[17] !== "n") continue;
			const offset = Number(row.slice(0, 10));
			const gen = Number(row.slice(11, 16));
			if (!Number.isFinite(offset) || offset <= 0) continue;
			entries.push({ num: startNum + index, gen, offset });
		}
	}
	return entries;
}

function readObjectAt(text: string, offset: number, num: number, gen: number): PdfObject | null {
	const header = `${num} ${gen} obj`;
	if (!text.startsWith(header, offset)) return null;
	let cursor = offset + header.length;
	while (cursor < text.length && /\s/.test(text[cursor] ?? "")) cursor += 1;
	if (text[cursor] !== "<" || text[cursor + 1] !== "<") return null;
	const dictEnd = endOfDict(text, cursor);
	if (dictEnd < 0) return null;
	return { num, gen, dict: text.slice(cursor, dictEnd) };
}

function endOfDict(text: string, start: number): number {
	let depth = 0;
	let i = start;
	while (i < text.length) {
		const char = text[i];
		const next = text[i + 1];
		if (char === "<" && next === "<") {
			depth += 1;
			i += 2;
			continue;
		}
		if (char === ">" && next === ">") {
			depth -= 1;
			i += 2;
			if (depth === 0) return i;
			continue;
		}
		if (char === "(") {
			i = skipLiteralString(text, i);
			continue;
		}
		if (char === "<") {
			i = skipHexString(text, i);
			continue;
		}
		if (char === "%") {
			while (i < text.length && text[i] !== "\n") i += 1;
			continue;
		}
		i += 1;
	}
	return -1;
}

function skipLiteralString(text: string, start: number): number {
	let i = start + 1;
	let depth = 1;
	while (i < text.length && depth > 0) {
		const char = text[i];
		if (char === "\\") {
			i += 2;
			continue;
		}
		if (char === "(") depth += 1;
		else if (char === ")") depth -= 1;
		i += 1;
	}
	return i;
}

function skipHexString(text: string, start: number): number {
	const end = text.indexOf(">", start + 1);
	return end < 0 ? text.length : end + 1;
}

function ascii(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}
