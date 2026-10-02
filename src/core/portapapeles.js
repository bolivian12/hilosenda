// Lectura del portapapeles en Windows, macOS y Linux (Wayland y X11).
//
// Devuelve, en este orden de preferencia, archivos copiados (por ejemplo desde el
// explorador de archivos), una imagen o texto.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { delimiter, join } from "node:path";

function ejecutar(programa, args, binario = false) {
	return new Promise((resolver) => {
		execFile(programa, args, { encoding: binario ? "buffer" : "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 5000, windowsHide: true }, (error, salida) => {
			resolver(error ? undefined : salida);
		});
	});
}

const existeEnPath = (p) => (process.env.PATH ?? "").split(delimiter).some((c) => c && existsSync(join(c, p)));

/** Convierte una lista de URIs o rutas (una por linea) en rutas que existen. */
export function rutasDesdeTexto(texto) {
	if (!texto) return [];
	const lineas = texto
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));
	if (lineas.length === 0) return [];
	const rutas = [];
	for (let linea of lineas) {
		// Arrastrar y soltar suele entregar rutas entre comillas o con espacios escapados.
		linea = linea.replace(/^['"]|['"]$/g, "").replace(/\\ /g, " ");
		if (linea.startsWith("file://")) {
			try {
				linea = fileURLToPath(linea);
			} catch {
				return [];
			}
		}
		if (!existsSync(linea)) return [];
		rutas.push(linea);
	}
	return rutas;
}

/**
 * @returns {Promise<{ tipo: "archivos", rutas: string[] } | { tipo: "imagen", datos: Buffer, mime: string } | { tipo: "texto", texto: string } | undefined>}
 */
export async function leerPortapapeles() {
	if (process.platform === "win32") {
		const ps = (comando, binario) => ejecutar("powershell.exe", ["-NoProfile", "-STA", "-Command", comando], binario);
		const archivos = await ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { $_ }");
		const rutas = rutasDesdeTexto(archivos);
		if (rutas.length) return { tipo: "archivos", rutas };
		const imagen = await ps(
			"Add-Type -AssemblyName System.Windows.Forms; $i=[System.Windows.Forms.Clipboard]::GetImage(); if ($i) { $m=New-Object IO.MemoryStream; $i.Save($m,[Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray()) }",
		);
		if (imagen?.trim()) return { tipo: "imagen", datos: Buffer.from(imagen.trim(), "base64"), mime: "image/png" };
		const texto = await ps("[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw");
		return texto ? { tipo: "texto", texto: texto.replace(/\r?\n$/, "") } : undefined;
	}
	if (process.platform === "darwin") {
		const archivos = await ejecutar("osascript", ["-e", 'try\nset l to the clipboard as «class furl»\nPOSIX path of l\nend try']);
		const rutas = rutasDesdeTexto(archivos);
		if (rutas.length) return { tipo: "archivos", rutas };
		const imagen = await ejecutar("osascript", ["-e", 'try\nset d to the clipboard as «class PNGf»\nset f to (POSIX path of (path to temporary items)) & "hilosenda-pegado.png"\nset h to open for access POSIX file f with write permission\nset eof h to 0\nwrite d to h\nclose access h\nf\nend try']);
		if (imagen?.trim() && existsSync(imagen.trim())) return { tipo: "archivos", rutas: [imagen.trim()] };
		const texto = await ejecutar("pbpaste", []);
		return texto ? { tipo: "texto", texto } : undefined;
	}
	// Linux: Wayland (wl-paste) o X11 (xclip / xsel).
	const wayland = Boolean(process.env.WAYLAND_DISPLAY) && existeEnPath("wl-paste");
	const leer = (mime, binario) =>
		wayland
			? ejecutar("wl-paste", ["--no-newline", "--type", mime], binario)
			: existeEnPath("xclip")
				? ejecutar("xclip", ["-selection", "clipboard", "-t", mime, "-o"], binario)
				: Promise.resolve(undefined);
	const tipos = wayland ? await ejecutar("wl-paste", ["--list-types"]) : existeEnPath("xclip") ? await ejecutar("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"]) : "";
	const lista = (tipos ?? "").split(/\s+/);
	if (lista.includes("text/uri-list")) {
		const rutas = rutasDesdeTexto(await leer("text/uri-list"));
		if (rutas.length) return { tipo: "archivos", rutas };
	}
	const mimeImagen = ["image/png", "image/jpeg", "image/webp", "image/gif"].find((m) => lista.includes(m));
	if (mimeImagen) {
		const datos = await leer(mimeImagen, true);
		if (datos?.length) return { tipo: "imagen", datos, mime: mimeImagen };
	}
	let texto = await leer("text/plain;charset=utf-8");
	if (texto === undefined) texto = await leer("UTF8_STRING");
	if (texto === undefined && existeEnPath("xsel")) texto = await ejecutar("xsel", ["-b", "-o"]);
	return texto ? { tipo: "texto", texto } : undefined;
}
