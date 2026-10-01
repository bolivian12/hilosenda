// Ventanas del sistema para elegir carpetas y archivos.
//
// Windows usa PowerShell, macOS usa AppleScript y Linux usa zenity, kdialog o yad
// (el que este instalado). Si no hay entorno grafico (por ejemplo por SSH),
// devuelve "no-disponible" y hilosenda ofrece su explorador dentro de la consola.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * @typedef {{ estado: "ok", ruta: string } | { estado: "cancelado" } | { estado: "no-disponible", motivo: string }} Resultado
 */

function ejecutar(programa, argumentos, opciones = {}) {
	return new Promise((resolver) => {
		execFile(programa, argumentos, { windowsHide: true, maxBuffer: 1024 * 1024, ...opciones }, (error, salida, errores) => {
			resolver({ codigo: error ? (typeof error.code === "number" ? error.code : 1) : 0, salida: String(salida), errores: String(errores), error });
		});
	});
}

function existeEnPath(programa) {
	const carpetas = (process.env.PATH ?? "").split(delimiter);
	return carpetas.some((carpeta) => carpeta && existsSync(join(carpeta, programa)));
}

const hayEscritorioLinux = () => Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

/** Indica si se puede abrir una ventana del sistema en este equipo. */
export function selectorGraficoDisponible() {
	if (process.platform === "win32" || process.platform === "darwin") return !process.env.SSH_CONNECTION;
	return hayEscritorioLinux() && ["zenity", "kdialog", "yad"].some(existeEnPath);
}

// --- Windows -------------------------------------------------------------------

const cadenaPs = (texto) => `'${texto.replace(/'/g, "''")}'`;

function scriptWindows(tipo, titulo, inicio) {
	const comun = [
		"$ErrorActionPreference = 'Stop'",
		"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
		"Add-Type -AssemblyName System.Windows.Forms",
		"[System.Windows.Forms.Application]::EnableVisualStyles()",
		"$duenio = New-Object System.Windows.Forms.Form",
		"$duenio.TopMost = $true",
		"$duenio.ShowInTaskbar = $false",
		"$duenio.WindowState = 'Minimized'",
	];
	if (tipo === "carpeta") {
		return [
			...comun,
			"$d = New-Object System.Windows.Forms.FolderBrowserDialog",
			`$d.Description = ${cadenaPs(titulo)}`,
			"$d.ShowNewFolderButton = $true",
			"try { $d.UseDescriptionForTitle = $true } catch {}",
			inicio ? `$d.SelectedPath = ${cadenaPs(inicio)}` : "",
			"if ($d.ShowDialog($duenio) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }",
		].join("; ");
	}
	return [
		...comun,
		"$d = New-Object System.Windows.Forms.OpenFileDialog",
		`$d.Title = ${cadenaPs(titulo)}`,
		"$d.Filter = 'Instrucciones (*.md;*.txt)|*.md;*.markdown;*.txt|Todos los archivos (*.*)|*.*'",
		inicio ? `$d.InitialDirectory = ${cadenaPs(inicio)}` : "",
		"if ($d.ShowDialog($duenio) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }",
	].join("; ");
}

async function elegirWindows(tipo, titulo, inicio) {
	const script = scriptWindows(tipo, titulo, inicio);
	for (const powershell of ["powershell.exe", "pwsh.exe"]) {
		const r = await ejecutar(powershell, ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script]);
		if (r.error && r.error.code === "ENOENT") continue;
		const ruta = r.salida.trim();
		if (ruta) return { estado: "ok", ruta };
		if (r.codigo !== 0) return { estado: "no-disponible", motivo: r.errores.trim() || "PowerShell fallo" };
		return { estado: "cancelado" };
	}
	return { estado: "no-disponible", motivo: "No se encontro PowerShell" };
}

// --- macOS ---------------------------------------------------------------------

const cadenaAs = (texto) => `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function elegirMac(tipo, titulo, inicio) {
	const desde = inicio ? ` default location (POSIX file ${cadenaAs(inicio)})` : "";
	const intentos =
		tipo === "carpeta"
			? [`POSIX path of (choose folder with prompt ${cadenaAs(titulo)}${desde})`]
			: [
					`POSIX path of (choose file with prompt ${cadenaAs(titulo)} of type {"md", "markdown", "txt", "public.plain-text"}${desde})`,
					`POSIX path of (choose file with prompt ${cadenaAs(titulo)}${desde})`,
				];
	for (const script of intentos) {
		const r = await ejecutar("osascript", ["-e", script]);
		if (r.codigo === 0 && r.salida.trim()) return { estado: "ok", ruta: r.salida.trim().replace(/\/$/, "") || "/" };
		if (/-128/.test(r.errores)) return { estado: "cancelado" };
	}
	return { estado: "no-disponible", motivo: "AppleScript no pudo abrir la ventana" };
}

// --- Linux ---------------------------------------------------------------------

async function elegirLinux(tipo, titulo, inicio) {
	if (!hayEscritorioLinux()) return { estado: "no-disponible", motivo: "No hay escritorio grafico" };
	const desde = inicio ? `${inicio.replace(/\/$/, "")}/` : undefined;
	const opciones = [];
	if (existeEnPath("zenity") || existeEnPath("yad")) {
		const programa = existeEnPath("zenity") ? "zenity" : "yad";
		const args = ["--file-selection", `--title=${titulo}`];
		if (tipo === "carpeta") args.push("--directory");
		else args.push("--file-filter=Instrucciones | *.md *.markdown *.txt", "--file-filter=Todos | *");
		if (desde) args.push(`--filename=${desde}`);
		opciones.push([programa, args]);
	}
	if (existeEnPath("kdialog")) {
		opciones.push([
			"kdialog",
			tipo === "carpeta"
				? ["--title", titulo, "--getexistingdirectory", inicio ?? "."]
				: ["--title", titulo, "--getopenfilename", inicio ?? ".", "*.md *.markdown *.txt|Instrucciones"],
		]);
	}
	for (const [programa, args] of opciones) {
		const r = await ejecutar(programa, args);
		if (r.codigo === 0 && r.salida.trim()) return { estado: "ok", ruta: r.salida.trim() };
		if (r.codigo === 1) return { estado: "cancelado" };
	}
	return { estado: "no-disponible", motivo: "Instala zenity o kdialog para usar la ventana de seleccion" };
}

/**
 * Abre la ventana del sistema para elegir una carpeta o un archivo de instrucciones.
 * @param {"carpeta" | "instrucciones"} tipo
 * @param {{ titulo?: string, inicio?: string }} [opciones]
 * @returns {Promise<Resultado>}
 */
export async function elegirConVentana(tipo, opciones = {}) {
	const titulo = opciones.titulo ?? (tipo === "carpeta" ? "Elige la carpeta de tu proyecto" : "Elige el archivo de instrucciones (.md o .txt)");
	const inicio = opciones.inicio && existsSync(opciones.inicio) ? opciones.inicio : undefined;
	try {
		if (process.platform === "win32") return await elegirWindows(tipo, titulo, inicio);
		if (process.platform === "darwin") return await elegirMac(tipo, titulo, inicio);
		return await elegirLinux(tipo, titulo, inicio);
	} catch (error) {
		return { estado: "no-disponible", motivo: error instanceof Error ? error.message : String(error) };
	}
}
