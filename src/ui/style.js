// Estilos de texto para la consola.
//
// Los componentes de hilosenda reciben un objeto "estilo" en lugar de colores fijos.
// Fuera de Pi (pantalla de inicio) se usa `estiloBase`; dentro de Pi se construye
// uno a partir del tema activo con `estiloDesdeTemaPi()`, asi todo combina con el
// tema claro u oscuro que elija la persona.

const CSI = "\x1b[";
const envolver = (abrir, cerrar) => (texto) => `${CSI}${abrir}m${texto}${CSI}${cerrar}m`;

const sinColor = Boolean(process.env.NO_COLOR);
const identidad = (texto) => texto;
const color = (abrir, cerrar) => (sinColor ? identidad : envolver(abrir, cerrar));

/**
 * @typedef {"primario" | "normal" | "peligro" | "suave"} TipoBoton
 *
 * @typedef {object} Estilo
 * @property {(t: string) => string} acento
 * @property {(t: string) => string} titulo
 * @property {(t: string) => string} texto
 * @property {(t: string) => string} suave
 * @property {(t: string) => string} tenue
 * @property {(t: string) => string} exito
 * @property {(t: string) => string} aviso
 * @property {(t: string) => string} error
 * @property {(t: string) => string} negrita
 * @property {(t: string) => string} borde
 * @property {(t: string) => string} seleccion
 * @property {(t: string, tipo: TipoBoton, enfocado: boolean, presionado: boolean) => string} boton
 */

/** @type {Estilo} */
export const estiloBase = {
	acento: color("38;5;44", "39"),
	titulo: (t) => (sinColor ? t : `${CSI}1;38;5;44m${t}${CSI}22;39m`),
	texto: identidad,
	suave: color("38;5;250", "39"),
	tenue: color("38;5;244", "39"),
	exito: color("38;5;114", "39"),
	aviso: color("38;5;221", "39"),
	error: color("38;5;203", "39"),
	negrita: color("1", "22"),
	borde: color("38;5;240", "39"),
	seleccion: (t) => (sinColor ? `> ${t}` : `${CSI}48;5;24;38;5;231m${t}${CSI}49;39m`),
	boton: (t, tipo, enfocado, presionado) => {
		if (sinColor) return enfocado ? `[>${t}<]` : `[ ${t} ]`;
		let fondo = "48;5;238";
		let frente = "38;5;255";
		if (tipo === "primario") {
			fondo = "48;5;30";
			frente = "38;5;231";
		} else if (tipo === "peligro") {
			fondo = "48;5;88";
			frente = "38;5;231";
		} else if (tipo === "suave") {
			fondo = "48;5;236";
			frente = "38;5;250";
		}
		if (enfocado) {
			fondo = "48;5;44";
			frente = "38;5;16";
		}
		if (presionado) {
			fondo = "48;5;231";
			frente = "38;5;16";
		}
		return `${CSI}${fondo};${frente};1m${t}${CSI}22;39;49m`;
	},
};

/**
 * Construye un estilo a partir del tema de Pi.
 * @param {any} tema Instancia `Theme` de Pi.
 * @returns {Estilo}
 */
export function estiloDesdeTemaPi(tema) {
	return {
		acento: (t) => tema.fg("accent", t),
		titulo: (t) => tema.bold(tema.fg("accent", t)),
		texto: (t) => tema.fg("text", t),
		suave: (t) => tema.fg("muted", t),
		tenue: (t) => tema.fg("dim", t),
		exito: (t) => tema.fg("success", t),
		aviso: (t) => tema.fg("warning", t),
		error: (t) => tema.fg("error", t),
		negrita: (t) => tema.bold(t),
		borde: (t) => tema.fg("border", t),
		seleccion: (t) => tema.bg("selectedBg", tema.fg("accent", t)),
		boton: (t, tipo, enfocado, presionado) => {
			if (presionado || enfocado) return tema.inverse(tema.bold(tema.fg("accent", t)));
			if (tipo === "primario") return tema.bg("toolSuccessBg", tema.bold(tema.fg("success", t)));
			if (tipo === "peligro") return tema.bg("toolErrorBg", tema.bold(tema.fg("error", t)));
			if (tipo === "suave") return tema.bg("userMessageBg", tema.fg("muted", t));
			return tema.bg("selectedBg", tema.bold(tema.fg("text", t)));
		},
	};
}
