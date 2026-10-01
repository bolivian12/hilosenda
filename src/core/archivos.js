// Lectura y escritura segura de archivos JSON.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Lee un JSON. Devuelve `porDefecto` si no existe o esta danado. */
export function leerJson(ruta, porDefecto) {
	try {
		if (!existsSync(ruta)) return structuredClone(porDefecto);
		const texto = readFileSync(ruta, "utf8");
		return texto.trim() ? JSON.parse(texto) : structuredClone(porDefecto);
	} catch {
		return structuredClone(porDefecto);
	}
}

/**
 * Escribe un JSON de forma atomica: primero a un archivo temporal y luego lo renombra,
 * asi un corte de luz nunca deja el archivo a medias.
 * @param {string} ruta
 * @param {unknown} datos
 * @param {{ privado?: boolean }} [opciones] `privado` deja el archivo legible solo por su dueno.
 */
export function escribirJson(ruta, datos, opciones = {}) {
	mkdirSync(dirname(ruta), { recursive: true, mode: opciones.privado ? 0o700 : 0o755 });
	const temporal = `${ruta}.${process.pid}.tmp`;
	const modo = opciones.privado ? 0o600 : 0o644;
	writeFileSync(temporal, `${JSON.stringify(datos, null, 2)}\n`, { encoding: "utf8", mode: modo });
	renameSync(temporal, ruta);
	if (opciones.privado && process.platform !== "win32") {
		try {
			chmodSync(ruta, 0o600);
		} catch {
			// Algunos sistemas de archivos no admiten permisos.
		}
	}
}
