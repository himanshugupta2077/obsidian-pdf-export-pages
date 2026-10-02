import { Component, MarkdownRenderer, TFile, type App } from "obsidian";
import { applyHeadingPageBreaks } from "./page-breaks.ts";
import { buildPrintRequest, type PrintToPdfRequest } from "./print-options.ts";
import type { PdfSettings } from "./settings.ts";

interface SaveDialogResult {
	canceled?: boolean;
	filePath?: string;
}

interface ElectronLike {
	ipcRenderer?: {
		send(channel: string, payload: unknown): void;
		once(channel: string, listener: () => void): void;
	};
	remote?: {
		dialog?: {
			showSaveDialog(options: {
				defaultPath?: string;
				filters?: { name: string; extensions: string[] }[];
				properties?: string[];
			}): Promise<SaveDialogResult>;
		};
	};
}

const PRINT_CHANNEL = "print-to-pdf";

export async function choosePdfPath(basename: string): Promise<string | null> {
	const dialog = loadElectron()?.remote?.dialog;
	if (!dialog?.showSaveDialog) {
		throw new Error("Could not open the save dialog.");
	}
	const picked = await dialog.showSaveDialog({
		defaultPath: `${basename}.pdf`,
		filters: [
			{ name: "PDF Files", extensions: ["pdf"] },
			{ name: "All Files", extensions: ["*"] },
		],
		properties: ["showOverwriteConfirmation"],
	});
	if (picked.canceled || !picked.filePath) return null;
	return picked.filePath;
}

export async function printMarkdownFile(
	app: App,
	file: TFile,
	settings: PdfSettings,
	filepath: string
): Promise<void> {
	const electron = loadElectron();
	if (!electron?.ipcRenderer) {
		throw new Error("PDF export needs the desktop app.");
	}
	const component = new Component();
	component.load();
	const host = document.body.createDiv({ cls: "print page-pdf-print" });
	host.style.position = "fixed";
	host.style.left = "-100000px";
	host.style.top = "0";
	host.style.width = "720px";
	host.style.pointerEvents = "none";
	host.style.setProperty("--page-pdf-font-size", `${settings.fontSize}px`);
	try {
		const preview = host.createDiv({ cls: "markdown-preview-view markdown-rendered" });
		preview.style.fontSize = `${settings.fontSize}px`;
		preview.style.setProperty("--font-text-size", `${settings.fontSize}px`);
		preview.classList.toggle("rtl", vaultConfig(app, "rightToLeft") === true);
		preview.classList.toggle(
			"show-properties",
			vaultConfig(app, "propertiesInDocument") !== "hidden"
		);
		if (settings.includeName) {
			preview.createEl("h1", { text: file.basename, cls: "page-pdf-title" });
		}
		const markdown = await app.vault.cachedRead(file);
		const rendered = preview.createDiv({ cls: "page-pdf-body" });
		await MarkdownRenderer.render(app, markdown, rendered, file.path, component);
		stripInternalLinks(preview);
		applyHeadingPageBreaks(preview, settings.breakOn);
		await waitForImages(preview);
		if (document.fonts?.ready) await document.fonts.ready;
		await sleep(200);
		await withLightPrintTheme(() =>
			sendPrint(electron, buildPrintRequest(settings, filepath))
		);
		assertPdfWritten(filepath);
	} finally {
		component.unload();
		host.detach();
	}
}

function stripInternalLinks(root: HTMLElement): void {
	for (const link of Array.from(root.querySelectorAll("a.internal-link"))) {
		link.removeAttribute("href");
	}
}

function vaultConfig(app: App, key: string): unknown {
	const vault = app.vault as App["vault"] & {
		getConfig?: (setting: string) => unknown;
	};
	if (typeof vault.getConfig !== "function") return undefined;
	return vault.getConfig(key);
}

async function withLightPrintTheme<T>(task: () => Promise<T>): Promise<T> {
	const nodes = [document.body, document.documentElement];
	const wasDark = nodes.map((node) => node.classList.contains("theme-dark"));
	nodes.forEach((node, index) => {
		if (!wasDark[index]) return;
		node.classList.remove("theme-dark");
		node.classList.add("theme-light");
	});
	try {
		await sleep(50);
		return await task();
	} finally {
		nodes.forEach((node, index) => {
			if (!wasDark[index]) return;
			node.classList.add("theme-dark");
			node.classList.remove("theme-light");
		});
	}
}

function sendPrint(electron: ElectronLike, request: PrintToPdfRequest): Promise<void> {
	const ipc = electron.ipcRenderer;
	if (!ipc) return Promise.reject(new Error("PDF export needs the desktop app."));
	return new Promise((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new Error("PDF export timed out."));
		}, 120000);
		ipc.once(PRINT_CHANNEL, () => {
			window.clearTimeout(timer);
			resolve();
		});
		ipc.send(PRINT_CHANNEL, request);
	});
}

function waitForImages(root: HTMLElement): Promise<void> {
	const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
	if (pending.length === 0) return Promise.resolve();
	return Promise.all(
		pending.map(
			(img) =>
				new Promise<void>((resolve) => {
					const done = () => resolve();
					img.addEventListener("load", done, { once: true });
					img.addEventListener("error", done, { once: true });
				})
		)
	).then(() => undefined);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function assertPdfWritten(filepath: string): void {
	const req = (window as Window & { require?: (id: string) => NodeFs }).require;
	if (!req) return;
	let fs: NodeFs;
	try {
		fs = req("fs");
	} catch {
		return;
	}
	if (!fs.existsSync(filepath) || fs.statSync(filepath).size < 5) {
		throw new Error("Failed to save PDF.");
	}
}

interface NodeFs {
	existsSync(path: string): boolean;
	statSync(path: string): { size: number };
}

function loadElectron(): ElectronLike | null {
	const bridged = (window as Window & { electron?: ElectronLike }).electron;
	let required: ElectronLike | null = null;
	const req = (window as Window & { require?: (id: string) => ElectronLike }).require;
	if (req) {
		try {
			required = req("electron");
		} catch {
			required = null;
		}
	}
	if (!bridged && !required) return null;
	return {
		ipcRenderer: bridged?.ipcRenderer ?? required?.ipcRenderer,
		remote: required?.remote ?? bridged?.remote,
	};
}
