// Vista previa de imagenes en CUALQUIER consola, dibujada con caracteres.
//
// Cada celda usa "▀" con el color de un pixel arriba (letra) y otro abajo (fondo),
// asi se ven 2 pixeles por celda con color de 24 bits. Funciona aunque la consola
// no tenga protocolo de imagenes (como la de GNOME). Decodifica con photon, la
// libreria de imagenes que ya trae Pi.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTerminalColorMode, rgbColor, styleText } from "@earendil-works/pi-tui";

let photon;

function cargarPhoton() {
	if (photon !== undefined) return photon;
	photon = null;
	const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
	const base = createRequire(join(raiz, "package.json"));
	const candidatos = [];
	// Pi trae photon como dependencia propia: buscar la carpeta de Pi subiendo desde aqui.
	for (let dir = raiz; ; dir = dirname(dir)) {
		const pi = join(dir, "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
		if (existsSync(pi)) candidatos.push(createRequire(pi));
		if (dirname(dir) === dir) break;
	}
	candidatos.push(base);
	for (const req of candidatos) {
		try {
			photon = req("@silvia-odwyer/photon-node");
			break;
		} catch {
			// Probar el siguiente.
		}
	}
	return photon;
}

/**
 * Dibuja una imagen como lineas de texto de color.
 * @param {string} base64 Datos de la imagen.
 * @param {number} anchoMax Columnas maximas.
 * @param {number} altoMax Lineas maximas (cada una muestra 2 filas de pixeles).
 * @returns {string[] | undefined} undefined si no se pudo decodificar.
 */
export function imagenEnTexto(base64, anchoMax, altoMax) {
	const p = cargarPhoton();
	if (!p) return undefined;
	let img;
	let chica;
	try {
		img = p.PhotonImage.new_from_byteslice(Buffer.from(base64, "base64"));
		const w = img.get_width();
		const h = img.get_height();
		const escala = Math.min(anchoMax / w, (altoMax * 2) / h, 1);
		const ancho = Math.max(1, Math.round(w * escala));
		const alto = Math.max(2, Math.round(h * escala) & ~1);
		chica = p.resize(img, ancho, alto, p.SamplingFilter.Triangle);
		const px = chica.get_raw_pixels();
		const modo = getTerminalColorMode();
		const color = (i) => rgbColor(px[i], px[i + 1], px[i + 2]);
		const lineas = [];
		for (let y = 0; y < alto; y += 2) {
			let linea = "";
			for (let x = 0; x < ancho; x++) {
				const arriba = (y * ancho + x) * 4;
				const abajo = ((y + 1) * ancho + x) * 4;
				linea += styleText("▀", { fg: color(arriba), bg: y + 1 < alto ? color(abajo) : undefined }, modo);
			}
			lineas.push(linea);
		}
		return lineas;
	} catch {
		return undefined;
	} finally {
		chica?.free?.();
		img?.free?.();
	}
}
