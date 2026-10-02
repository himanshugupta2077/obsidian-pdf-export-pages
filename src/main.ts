import {
	Menu,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	TFile,
	type App,
} from "obsidian";
import { choosePdfPath, printMarkdownFile } from "./print-note.ts";
import {
	clampFontSize,
	cloneSettings,
	DEFAULT_FONT_SIZE,
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

	async exportFile(file: TFile, draft: PdfSettings): Promise<boolean> {
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
			await printMarkdownFile(this.app, file, this.settings, filepath);
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
	constructor(
		private readonly plugin: PdfExportPagesPlugin,
		private readonly file: TFile,
		private readonly draft: PdfSettings
	) {
		super(plugin.app);
	}

	override onOpen(): void {
		this.modalEl.addClass("mod-narrow");
		this.setTitle("Export to PDF");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", {
			cls: "u-muted u-break-word",
			text: `Export ${this.file.basename} to PDF with the settings below.`,
		});
		renderPdfSettings(contentEl, this.draft, () => undefined);
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
		window.setTimeout(() => exportButton.focus(), 0);
	}

	private async onExport(button: HTMLButtonElement): Promise<void> {
		button.disabled = true;
		button.addClass("mod-loading");
		const saved = await this.plugin.exportFile(this.file, this.draft);
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
