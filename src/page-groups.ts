export interface PageItem {
	height: number;
	breakBefore: boolean;
}

/** Split measured blocks into pages. A break starts a new page when the current page already has content. */
export function groupOntoPages(
	items: readonly PageItem[],
	capacity: number
): number[][] {
	const pages: number[][] = [];
	let used = 0;
	const cap = Math.max(1, capacity);
	items.forEach((item, index) => {
		const page = pages.length > 0 ? pages[pages.length - 1] : undefined;
		const pageHasContent = page !== undefined && page.length > 0;
		const needsNew =
			pageHasContent && (item.breakBefore || used + item.height > cap + 0.5);
		if (!page || needsNew) {
			pages.push([]);
			used = 0;
		}
		pages[pages.length - 1].push(index);
		used += item.height;
	});
	return pages;
}
