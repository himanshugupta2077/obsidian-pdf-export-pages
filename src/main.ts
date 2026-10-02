import {
	Component,
	Menu,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	TFile,
	type App,
} from "obsidian";
import { headingStartsNewPage } from "./page-breaks.ts";
import { listHeadings, paintPreview, renderNoteSource, type ListedHeading } from "./preview.ts";
import { choosePdfPath, printMarkdownFile } from "./print-note.ts";
import {
	clampFontSize,
	cloneSettings,
	DEFAULT_FONT_SIZE,
	HEADING_LEVELS,
	sanitizeSettings,
	type PdfSettings,
} from "./settings.ts";
import { renderPdfSettings } from "./settings-view.ts";

const MENU_TITLE = "Export PDF pages...";

export default class PdfExportPagesPlugin extends Plugin {
	settings: PdfSettings = cloneSettings(
		sanitizeSettings(undefined).settings
	);
	fontSizeSet = false;
	private exporting = false;

	override async onload(): Promise<void> {
		const stored = sanitizeSettings(await this.loadData());
		this.settings = stored.settings;
		this.fontSizeSet = stored.fontSizeSet;
		this.addSettingTab(new PdfExportSettingTab(this.app, this));
		this.app.workspace.onLayoutReady(() => {
			if (!this.fontSizeSet) this.settings.fontSize = readComputedFontSize();
		});
		this.addCommand({
			id: "export-pdf",
			name: "Export current note to PDF",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") return false;
				if (!checking) void this.openExport(file);
				return true;
			},
		});
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					addExportItem(menu, () => this.openExport(file));
				}
			})
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	openExport(file: TFile): void {
		if (this.exporting) {
			new Notice("A PDF export is already running.");
			return;
		}
		const draft = cloneSettings(this.settings);
		if (!this.fontSizeSet) draft.fontSize = readComputedFontSize();
		new ExportModal(this, file, draft).open();
	}

	async exportFile(
		file: TFile,
		draft: PdfSettings,
		headingBreaks?: ReadonlyMap<number, boolean>
	): Promise<boolean> {
		if (this.exporting) {
			new Notice("A PDF export is already running.");
			return false;
		}
		this.exporting = true;
		try {
			this.settings = cloneSettings(draft);
			this.fontSizeSet = true;
			await this.saveSettings();
			const filepath = await choosePdfPath(file.basename);
			if (!filepath) return false;
			await printMarkdownFile(
				this.app,
				file,
				this.settings,
				filepath,
				headingBreaks
			);
			new Notice(`PDF saved to ${filepath}`);
			return true;
		} catch (error) {
			console.error("PDF export pages failed", error);
			new Notice(exportErrorMessage(error));
			return false;
		} finally {
			this.exporting = false;
		}
	}

}

function addExportItem(menu: Menu, onClick: () => void): void {
	menu.addItem((item) => {
		item
			.setTitle(MENU_TITLE)
			.setIcon("file-down")
			.setSection("action")
			.onClick(onClick);
	});
}

function readComputedFontSize(): number {
	const raw = getComputedStyle(document.body).getPropertyValue("--font-text-size");
	const size = Number.parseFloat(raw);
	return clampFontSize(Number.isFinite(size) ? size : DEFAULT_FONT_SIZE);
}

function exportErrorMessage(error: unknown): string {
	if (
		error instanceof Error &&
		error.message.length > 0 &&
		error.message.length < 180 &&
		!error.message.includes("\n")
	) {
		return error.message;
	}
	return "Failed to save PDF.";
}

class ExportModal extends Modal {
	private readonly overrides = new Map<number, boolean>();
	private readonly component = new Component();
	private source: HTMLElement | null = null;
	private headings: ListedHeading[] = [];
	private toggleInputs: HTMLInputElement[] = [];
	private previewEl: HTMLElement | null = null;
	private headingEl: HTMLElement | null = null;
	private paintTimer = 0;
	private closed = false;
	private lastFitWidth = 0;
	private resizeObserver: ResizeObserver | null = null;
	private levelSnapshot: PdfSettings["breakOn"];

	constructor(
		private readonly plugin: PdfExportPagesPlugin,
		private readonly file: TFile,
		private readonly draft: PdfSettings
	) {
		super(plugin.app);
		this.levelSnapshot = { ...draft.breakOn };
	}

	override onOpen(): void {
		this.modalEl.addClass("page-pdf-modal");
		this.setTitle("Export to PDF");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", {
			cls: "u-muted u-break-word page-pdf-lead",
			text: this.file.basename,
		});
		const layout = contentEl.createDiv({ cls: "page-pdf-layout" });
		const previewCol = layout.createDiv({ cls: "page-pdf-col page-pdf-col-preview" });
		const settingsCol = layout.createDiv({ cls: "page-pdf-col page-pdf-col-settings" });
		const headingCol = layout.createDiv({ cls: "page-pdf-col page-pdf-col-headings" });
		previewCol.createDiv({ cls: "page-pdf-col-title", text: "Preview" });
		this.previewEl = previewCol.createDiv({ cls: "page-pdf-preview" });
		this.previewEl.setText("Preparing preview…");
		settingsCol.createDiv({ cls: "page-pdf-col-title", text: "Settings" });
		renderPdfSettings(settingsCol.createDiv(), this.draft, () => {
			this.onSettingsChanged();
		});
		headingCol.createDiv({ cls: "page-pdf-col-title", text: "Page breaks" });
		this.headingEl = headingCol.createDiv({ cls: "page-pdf-heading-list" });
		this.headingEl.setText("Reading headings…");
		const actions = contentEl.createDiv({ cls: "page-pdf-actions" });
		const exportButton = actions.createEl("button", {
			cls: "mod-cta",
			text: "Export to PDF",
		});
		const cancelButton = actions.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());
		exportButton.addEventListener("click", () => {
			void this.onExport(exportButton);
		});
		this.component.load();
		if (this.previewEl) {
			this.resizeObserver = new ResizeObserver(() => {
				const width = this.previewEl?.clientWidth ?? 0;
				if (Math.abs(width - this.lastFitWidth) < 2) return;
				this.schedulePaint();
			});
			this.resizeObserver.observe(this.previewEl);
		}
		void this.loadSource();
	}

	override onClose(): void {
		this.closed = true;
		window.clearTimeout(this.paintTimer);
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.source?.detach();
		this.source = null;
		this.component.unload();
	}

	private async loadSource(): Promise<void> {
		try {
			const source = await renderNoteSource(this.plugin.app, this.file, this.component);
			if (this.closed) {
				source.detach();
				return;
			}
			this.source = source;
			this.rebuildHeadings(true);
			this.paint();
		} catch (error) {
			console.error("PDF preview failed", error);
			this.previewEl?.setText("Could not build the preview.");
			this.headingEl?.setText("Could not read the headings.");
		}
	}

	private onSettingsChanged(): void {
		for (const level of HEADING_LEVELS) {
			if (this.levelSnapshot[level] === this.draft.breakOn[level]) continue;
			for (const heading of this.headings) {
				if (heading.level === level) this.overrides.delete(heading.headingIndex);
			}
		}
		this.levelSnapshot = { ...this.draft.breakOn };
		this.rebuildHeadings(false);
		this.schedulePaint();
	}

	private schedulePaint(): void {
		window.clearTimeout(this.paintTimer);
		this.paintTimer = window.setTimeout(() => this.paint(), 40);
	}

	private paint(): void {
		if (!this.source || !this.previewEl || this.closed) return;
		this.lastFitWidth = this.previewEl.clientWidth;
		paintPreview({
			mount: this.previewEl,
			source: this.source,
			basename: this.file.basename,
			settings: this.draft,
			overrides: this.overrides,
		});
	}

	private rebuildHeadings(first: boolean): void {
		if (!this.source || !this.headingEl) return;
		const next = listHeadings(this.source, this.file.basename, this.draft);
		const same =
			!first &&
			next.length === this.headings.length &&
			next.every(
				(heading, index) =>
					heading.text === this.headings[index]?.text &&
					heading.level === this.headings[index]?.level &&
					heading.isFirstBlock === this.headings[index]?.isFirstBlock &&
					heading.followsHeading === this.headings[index]?.followsHeading
			);
		if (same) {
			this.syncToggles();
			return;
		}
		if (!first) this.overrides.clear();
		this.headings = next;
		this.renderHeadingList();
	}

	private renderHeadingList(): void {
		const col = this.headingEl;
		if (!col) return;
		col.empty();
		this.toggleInputs = [];
		if (this.headings.length === 0) {
			col.createEl("p", {
				cls: "setting-item-description",
				text: "This note has no headings.",
			});
			return;
		}
		col.createEl("p", {
			cls: "setting-item-description page-pdf-heading-help",
			text: "Turn a heading on to start it on a new page. The preview updates with this and with the other settings.",
		});
		for (const heading of this.headings) {
			const row = col.createDiv({ cls: "page-pdf-heading-row" });
			row.style.paddingLeft = `${(heading.level - 1) * 12}px`;
			const input = row.createEl("input", { type: "checkbox" });
			input.checked = headingStartsNewPage(heading, this.draft.breakOn, this.overrides);
			input.disabled = heading.isFirstBlock;
			input.setAttribute("aria-label", `Page break before ${heading.text}`);
			row.createSpan({ cls: "page-pdf-heading-level", text: `H${heading.level}` });
			const label = row.createSpan({ cls: "page-pdf-heading-text", text: heading.text });
			label.title = heading.text;
			if (heading.isFirstBlock) {
				row.title = "This heading stays on the first page.";
			} else if (
				heading.followsHeading &&
				!this.overrides.has(heading.headingIndex) &&
				this.draft.breakOn[heading.level]
			) {
				row.title = "Stays with the heading above until you turn it on.";
			}
			input.addEventListener("change", () => {
				this.onHeadingToggle(heading, input.checked);
			});
			row.addEventListener("click", (event) => {
				if (input.disabled || event.target === input) return;
				input.checked = !input.checked;
				this.onHeadingToggle(heading, input.checked);
			});
			this.toggleInputs.push(input);
		}
	}

	private onHeadingToggle(heading: ListedHeading, checked: boolean): void {
		const natural = headingStartsNewPage(heading, this.draft.breakOn);
		if (checked === natural) this.overrides.delete(heading.headingIndex);
		else this.overrides.set(heading.headingIndex, checked);
		const row = this.toggleInputs[this.headings.indexOf(heading)]?.parentElement;
		if (row && heading.followsHeading && !heading.isFirstBlock) {
			row.title = this.overrides.has(heading.headingIndex)
				? heading.text
				: "Stays with the heading above until you turn it on.";
		}
		this.schedulePaint();
	}

	private syncToggles(): void {
		this.headings.forEach((heading, index) => {
			const input = this.toggleInputs[index];
			if (!input) return;
			input.checked = headingStartsNewPage(heading, this.draft.breakOn, this.overrides);
		});
	}

	private async onExport(button: HTMLButtonElement): Promise<void> {
		button.disabled = true;
		button.addClass("mod-loading");
		const saved = await this.plugin.exportFile(
			this.file,
			this.draft,
			new Map(this.overrides)
		);
		if (saved) {
			this.close();
			return;
		}
		button.disabled = false;
		button.removeClass("mod-loading");
	}
}

class PdfExportSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: PdfExportPagesPlugin
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		renderPdfSettings(containerEl, this.plugin.settings, () => {
			this.plugin.fontSizeSet = true;
			void this.plugin.saveSettings();
		});
	}
}
