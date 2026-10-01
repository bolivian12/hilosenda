// Colores y formas de hilosenda.
//
// La consola solo dibuja caracteres, pero combinando colores de 24 bits con los
// caracteres de bloque (▗ ▄ ▖ ▐ ▌ ▝ ▀ ▘) se consiguen botones con forma de pildora
// y tarjetas con esquinas redondeadas, como en una aplicacion de escritorio.
// pi-tui convierte los colores a 256 si la terminal no admite 24 bits.

import { getTerminalColorMode, mixColors, rgbColor, styleText, visibleWidth } from "@earendil-works/pi-tui";

const sinColor = Boolean(process.env.NO_COLOR);
const hex = (valor) => rgbColor(Number.parseInt(valor.slice(1, 3), 16), Number.parseInt(valor.slice(3, 5), 16), Number.parseInt(valor.slice(5, 7), 16));

/** Paletas para fondo oscuro y claro. */
const PALETAS = {
	oscuro: {
		barra: "#1b1f27",
		tarjeta: "#262b35",
		tarjetaHover: "#303746",
		borde: "#3a4150",
		texto: "#e6e8ee",
		suave: "#a3abba",
		tenue: "#6b7383",
		acento: "#2dd4bf",
		textoSobreAcento: "#04201d",
		exito: "#4ade80",
		aviso: "#fbbf24",
		error: "#f87171",
		peligro: "#7f2a33",
		peligroHover: "#9b3440",
		seleccion: "#1d3d3b",
		acentos: ["#2dd4bf", "#38bdf8", "#a78bfa", "#fbbf24", "#f472b6", "#4ade80", "#818cf8", "#fb923c", "#22d3ee", "#e879f9", "#94a3b8"],
	},
	claro: {
		barra: "#e9edf3",
		tarjeta: "#f1f4f8",
		tarjetaHover: "#e2e8f0",
		borde: "#cbd5e1",
		texto: "#1f2937",
		suave: "#4b5563",
		tenue: "#8a94a6",
		acento: "#0d9488",
		textoSobreAcento: "#ffffff",
		exito: "#15803d",
		aviso: "#b45309",
		error: "#dc2626",
		peligro: "#fbe0e0",
		peligroHover: "#f7caca",
		seleccion: "#ccfbf1",
		acentos: ["#0d9488", "#0284c7", "#7c3aed", "#b45309", "#db2777", "#15803d", "#4f46e5", "#ea580c", "#0891b2", "#c026d3", "#64748b"],
	},
};

/**
 * @typedef {"primario" | "normal" | "peligro" | "suave"} TipoBoton
 * @typedef {"normal" | "hover" | "foco" | "presionado"} EstadoBoton
 * @typedef {{ t: string, fg?: any, negrita?: boolean, tenue?: boolean, cursiva?: boolean }} Segmento
 */

/**
 * Crea el estilo visual de hilosenda.
 * @param {{ oscuro?: boolean }} [opciones]
 */
export function crearEstilo(opciones = {}) {
	const oscuro = opciones.oscuro ?? true;
	const p = PALETAS[oscuro ? "oscuro" : "claro"];
	const c = {
		barra: hex(p.barra),
		tarjeta: hex(p.tarjeta),
		tarjetaHover: hex(p.tarjetaHover),
		borde: hex(p.borde),
		texto: hex(p.texto),
		suave: hex(p.suave),
		tenue: hex(p.tenue),
		acento: hex(p.acento),
		textoSobreAcento: hex(p.textoSobreAcento),
		exito: hex(p.exito),
		aviso: hex(p.aviso),
		error: hex(p.error),
		peligro: hex(p.peligro),
		peligroHover: hex(p.peligroHover),
		seleccion: hex(p.seleccion),
		acentos: p.acentos.map(hex),
	};
	const modo = getTerminalColorMode();

	/** Pinta texto con colores y atributos. */
	const pintar = (texto, { fg, bg, negrita, tenue, cursiva, subrayado } = {}) =>
		sinColor ? texto : styleText(texto, { fg, bg, bold: negrita, dim: tenue, italic: cursiva, underline: subrayado }, modo);

	/** Une segmentos de texto, todos sobre el mismo fondo. */
	const segmentos = (partes, bg) => partes.map((s) => pintar(s.t, { fg: s.fg ?? c.texto, bg, negrita: s.negrita, tenue: s.tenue, cursiva: s.cursiva })).join("");

	/** Mezcla dos colores (0 = primero, 1 = segundo). */
	const mezclar = (a, b, cantidad) => mixColors(a, b, cantidad);

	/** Colores de un boton segun su tipo y estado. */
	function colorBoton(tipo, estado) {
		let fondo = c.tarjeta;
		let frente = c.texto;
		if (tipo === "primario") {
			fondo = c.acento;
			frente = c.textoSobreAcento;
		} else if (tipo === "peligro") {
			fondo = c.peligro;
			frente = oscuro ? hex("#ffe4e6") : c.error;
		} else if (tipo === "suave") {
			fondo = oscuro ? c.barra : c.tarjeta;
			frente = c.suave;
		}
		if (estado === "hover") {
			fondo = tipo === "primario" ? mezclar(c.acento, hex(oscuro ? "#ffffff" : "#000000"), 0.18) : tipo === "peligro" ? c.peligroHover : c.tarjetaHover;
			if (tipo === "suave") frente = c.texto;
		} else if (estado === "foco") {
			fondo = tipo === "primario" ? mezclar(c.acento, hex(oscuro ? "#ffffff" : "#000000"), 0.28) : mezclar(c.tarjeta, c.acento, 0.35);
			frente = tipo === "primario" ? c.textoSobreAcento : oscuro ? hex("#ffffff") : c.texto;
		} else if (estado === "presionado") {
			fondo = oscuro ? hex("#ffffff") : c.texto;
			frente = oscuro ? hex("#0b0d12") : hex("#ffffff");
		}
		return { fondo, frente };
	}

	/** Boton de una linea con extremos redondeados: ▐ texto ▌ */
	function pastilla(texto, fondo, frente, negrita = true) {
		if (sinColor) return `[${texto}]`;
		return pintar("▐", { fg: fondo }) + pintar(texto, { fg: frente, bg: fondo, negrita }) + pintar("▌", { fg: fondo });
	}

	/**
	 * Rectangulo relleno con esquinas redondeadas. `interiores` deben venir pintadas
	 * con el mismo fondo (por ejemplo con `segmentos`). Ocupa `interiores.length + 2` lineas.
	 */
	function bloque(interiores, ancho, fondo) {
		if (sinColor) return [`+${"-".repeat(ancho - 2)}+`, ...interiores.map((l) => `|${l}`), `+${"-".repeat(ancho - 2)}+`];
		const relleno = (linea) => {
			const falta = Math.max(0, ancho - visibleWidth(linea));
			return linea + pintar(" ".repeat(falta), { bg: fondo });
		};
		return [
			pintar(`▗${"▄".repeat(Math.max(0, ancho - 2))}▖`, { fg: fondo }),
			...interiores.map(relleno),
			pintar(`▝${"▀".repeat(Math.max(0, ancho - 2))}▘`, { fg: fondo }),
		];
	}

	return {
		oscuro,
		c,
		pintar,
		segmentos,
		mezclar,
		colorBoton,
		pastilla,
		bloque,
		// Atajos de texto.
		acento: (t) => pintar(t, { fg: c.acento }),
		titulo: (t) => pintar(t, { fg: c.acento, negrita: true }),
		texto: (t) => pintar(t, { fg: c.texto }),
		suave: (t) => pintar(t, { fg: c.suave }),
		tenue: (t) => pintar(t, { fg: c.tenue }),
		exito: (t) => pintar(t, { fg: c.exito }),
		aviso: (t) => pintar(t, { fg: c.aviso }),
		error: (t) => pintar(t, { fg: c.error }),
		negrita: (t) => pintar(t, { negrita: true }),
		borde: (t) => pintar(t, { fg: c.borde }),
		seleccion: (t) => pintar(t, { fg: c.texto, bg: c.seleccion }),
	};
}

/** @typedef {ReturnType<typeof crearEstilo>} Estilo */

/** Estilo por defecto (fondo oscuro). */
export const estiloBase = crearEstilo({ oscuro: true });

/** Decide si un color de fondo es claro (luminancia relativa). */
export function esFondoClaro(rgb) {
	if (!rgb) return false;
	const canal = (v) => {
		const x = v / 255;
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * canal(rgb.r) + 0.7152 * canal(rgb.g) + 0.0722 * canal(rgb.b) > 0.4;
}
