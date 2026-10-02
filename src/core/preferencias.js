// Preferencias de hilosenda (independientes de la configuracion de Pi).

import { existsSync } from "node:fs";
import { leerJson, escribirJson } from "./archivos.js";
import { archivoPreferencias } from "./rutas.js";

/**
 * @typedef {"preguntar" | "libre" | "lectura"} ModoPermisos
 *
 * @typedef {object} Preferencias
 * @property {Array<{ ruta: string, fecha: string }>} recientes Carpetas abiertas hace poco.
 * @property {string | undefined} instrucciones Archivo .md o .txt de instrucciones elegido.
 * @property {boolean} instruccionesActivas
 * @property {ModoPermisos} permisos
 * @property {boolean} barraBotones Mostrar la barra de botones dentro del chat.
 * @property {boolean} barraCompleta Barra con todos los botones (si no, solo los esenciales).
 * @property {boolean} modoPrincipiante Mostrar consejos y explicaciones.
 * @property {boolean} buscarModelosLocales Buscar Ollama, LM Studio, etc. al iniciar.
 * @property {boolean} selectorGrafico Usar la ventana del sistema para elegir carpetas.
 * @property {boolean} animacion Mostrar la animacion de inicio.
 * @property {"auto" | "oscuro" | "claro" | "pi"} tema Tema de colores del chat.
 * @property {boolean} bienvenidaVista
 * @property {string} idioma "auto" o un codigo ("es", "en", ...).
 */

/** @type {Preferencias} */
export const PREFERENCIAS_POR_DEFECTO = {
	recientes: [],
	instrucciones: undefined,
	instruccionesActivas: true,
	permisos: "preguntar",
	barraBotones: true,
	barraCompleta: false,
	modoPrincipiante: true,
	buscarModelosLocales: true,
	selectorGrafico: true,
	animacion: true,
	tema: "auto",
	bienvenidaVista: false,
	idioma: "auto",
};

const MAX_RECIENTES = 15;

/** @returns {Preferencias} */
export function leerPreferencias() {
	return { ...PREFERENCIAS_POR_DEFECTO, ...leerJson(archivoPreferencias(), {}) };
}

/** @param {Partial<Preferencias>} cambios */
export function guardarPreferencias(cambios) {
	const nuevas = { ...leerPreferencias(), ...cambios };
	escribirJson(archivoPreferencias(), nuevas);
	return nuevas;
}

/** Pone una carpeta al principio de la lista de recientes. */
export function agregarReciente(ruta) {
	const { recientes } = leerPreferencias();
	const lista = [{ ruta, fecha: new Date().toISOString() }, ...recientes.filter((r) => r.ruta !== ruta)];
	return guardarPreferencias({ recientes: lista.slice(0, MAX_RECIENTES) });
}

export function quitarReciente(ruta) {
	const { recientes } = leerPreferencias();
	return guardarPreferencias({ recientes: recientes.filter((r) => r.ruta !== ruta) });
}

/** Recientes que todavia existen en disco. */
export function recientesExistentes() {
	return leerPreferencias().recientes.filter((r) => existsSync(r.ruta));
}
