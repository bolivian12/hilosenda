// Idiomas de hilosenda.
//
// Los textos se escriben en español en el codigo y se traducen con tr():
//   tr("Elegir carpeta")                 → "Choose folder" en ingles
//   tr("Modelo: {0}", [nombre])          → con valores
// Las traducciones viven en src/idiomas/<codigo>.json, con el texto en español como
// clave. Si falta una traduccion se muestra el español.
//
// El idioma se detecta del sistema (LC_ALL, LC_MESSAGES, LANG, LANGUAGE o la
// configuracion regional de Windows/macOS) y se puede cambiar en Ajustes.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const IDIOMAS = {
	es: "Español",
	en: "English",
	pt: "Português",
	fr: "Français",
	de: "Deutsch",
	it: "Italiano",
};

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), "idiomas");

/** Idioma del sistema, reducido a un codigo soportado ("es", "en", ...). */
export function idiomaDelSistema() {
	const candidatos = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG, ...(process.env.LANGUAGE ?? "").split(":")];
	try {
		candidatos.push(Intl.DateTimeFormat().resolvedOptions().locale);
	} catch {
		// Sin Intl.
	}
	for (const c of candidatos) {
		const codigo = (c ?? "").toLowerCase().split(/[_.@-]/)[0];
		if (codigo && codigo !== "c" && codigo !== "posix" && codigo in IDIOMAS) return codigo;
	}
	return "en";
}

/** Idioma elegido en Ajustes ("auto" = el del sistema). Se lee sin depender de otros modulos. */
function idiomaPreferido() {
	try {
		const base = process.env.HILOSENDA_HOME || join(homedir(), ".hilosenda");
		const archivo = join(base.replace(/^~(?=$|[\\/])/, homedir()), "preferencias.json");
		if (!existsSync(archivo)) return undefined;
		const idioma = JSON.parse(readFileSync(archivo, "utf8")).idioma;
		return idioma && idioma !== "auto" && idioma in IDIOMAS ? idioma : undefined;
	} catch {
		return undefined;
	}
}

export const idioma = idiomaPreferido() ?? idiomaDelSistema();

let diccionario = {};
if (idioma !== "es") {
	try {
		diccionario = JSON.parse(readFileSync(join(CARPETA, `${idioma}.json`), "utf8"));
	} catch {
		diccionario = {};
	}
}

/**
 * Traduce un texto escrito en español.
 * @param {string} texto
 * @param {unknown[]} [valores] Reemplazan {0}, {1}, ...
 */
export function tr(texto, valores) {
	let salida = diccionario[texto] ?? texto;
	if (valores) salida = salida.replace(/\{(\d+)\}/g, (_, i) => String(valores[Number(i)] ?? ""));
	return salida;
}

/** Locale para fechas y numeros ("es", "en", ...). */
export const localeFechas = idioma;
