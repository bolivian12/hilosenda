// Animacion de inicio: un hilo de luz cruza la pantalla y va tejiendo el logo.
//
// Fases (en milisegundos desde el inicio):
//   0-450     el hilo avanza de izquierda a derecha con una chispa en la punta
//   450-1250  el logo aparece columna a columna detras de una "aguja"
//   1250-1600 aparece el lema
//   1600-2000 pausa y termina
// Cualquier tecla o clic la salta.

import { visibleWidth } from "@earendil-works/pi-tui";

export const LOGO_GRANDE = [
	"╻ ╻ ╻ ╻   ┏━┓ ┏━┓ ┏━╸ ┏┓╻ ╺┳┓ ┏━┓",
	"┣━┫ ┃ ┃   ┃ ┃ ┗━┓ ┣╸  ┃┗┫  ┃┃ ┣━┫",
	"╹ ╹ ╹ ┗━╸ ┗━┛ ┗━┛ ┗━╸ ╹ ╹ ╺┻┛ ╹ ╹",
];

export const LEMA = "tu senda con la IA, hilo a hilo";

const sinColor = Boolean(process.env.NO_COLOR);

// Degradado turquesa → azul → violeta (mas oscuro para fondos claros).
const PARADAS = [
	[45, 212, 191],
	[56, 189, 248],
	[129, 140, 248],
	[192, 132, 252],
];
const PARADAS_CLARO = [
	[13, 148, 136],
	[2, 132, 199],
	[79, 70, 229],
	[147, 51, 234],
];

/** Color del degradado en la posicion t (0..1). */
export function colorDegradado(t, oscuro = true) {
	const paradas = oscuro ? PARADAS : PARADAS_CLARO;
	const x = Math.max(0, Math.min(1, t)) * (paradas.length - 1);
	const i = Math.min(paradas.length - 2, Math.floor(x));
	const f = x - i;
	return paradas[i].map((c, k) => Math.round(c + (paradas[i + 1][k] - c) * f));
}

const pintar = ([r, g, b], texto, negrita = false) =>
	sinColor ? texto : `\x1b[${negrita ? "1;" : ""}38;2;${r};${g};${b}m${texto}\x1b[0m`;

/** Pinta una linea del logo con el degradado, mostrando solo las primeras `visibles` columnas. */
export function lineaDegradada(linea, visibles = Infinity, brillo = 0, oscuro = true) {
	const caracteres = [...linea];
	let salida = "";
	caracteres.forEach((caracter, i) => {
		if (i >= visibles) {
			salida += " ";
			return;
		}
		const base = colorDegradado(i / Math.max(1, caracteres.length - 1), oscuro);
		const cerca = Number.isFinite(visibles) && visibles - i <= 2;
		const color = cerca || brillo > 0 ? base.map((c) => Math.min(255, c + (cerca ? 90 : brillo))) : base;
		salida += pintar(color, caracter, true);
	});
	return salida;
}

/** Logo estatico con degradado (o version corta si no cabe). */
export function logoDegradado(ancho, oscuro = true) {
	if (ancho < visibleWidth(LOGO_GRANDE[0]) + 2) return [lineaDegradada("hilosenda", Infinity, 0, oscuro)];
	return LOGO_GRANDE.map((l) => lineaDegradada(l, Infinity, 0, oscuro));
}

const centrar = (linea, ancho) => " ".repeat(Math.max(0, Math.floor((ancho - visibleWidth(linea)) / 2))) + linea;

/** Componente de la animacion. Llama a `alTerminar` al acabar o al saltarla. */
export class AnimacionInicio {
	/** @param {{ alTerminar: () => void, alto?: () => number, version?: string, oscuro?: boolean }} opciones */
	constructor(opciones) {
		this.alTerminar = opciones.alTerminar;
		this.oscuro = opciones.oscuro ?? true;
		this.alto = opciones.alto ?? (() => process.stdout.rows || 24);
		this.version = opciones.version;
		this.inicio = Date.now();
		this.terminada = false;
		this.tui = undefined;
		this.reloj = undefined;
	}

	/** Arranca el temporizador de cuadros. */
	empezar(tui) {
		this.tui = tui;
		this.inicio = Date.now();
		this.reloj = setInterval(() => {
			if (Date.now() - this.inicio > 2000) this.terminar();
			else this.tui?.requestRender();
		}, 33);
	}

	terminar() {
		if (this.terminada) return;
		this.terminada = true;
		clearInterval(this.reloj);
		this.alTerminar();
	}

	invalidate() {}

	render(ancho) {
		const t = Date.now() - this.inicio;
		const logoAncho = visibleWidth(LOGO_GRANDE[0]);
		const usarGrande = ancho >= logoAncho + 4;
		const lineasLogo = usarGrande ? LOGO_GRANDE : ["hilosenda"];
		const anchoLogo = usarGrande ? logoAncho : 9;

		const alto = Math.max(lineasLogo.length + 6, this.alto() - 1);
		const arriba = Math.max(0, Math.floor((alto - (lineasLogo.length + 4)) / 2));
		const lineas = Array.from({ length: arriba }, () => "");

		// Fase 2: logo tejido detras de la aguja.
		const progresoLogo = Math.max(0, Math.min(1, (t - 450) / 800));
		const columnas = t < 450 ? 0 : Math.ceil(progresoLogo * (anchoLogo + 2));
		const brillo = t > 1250 && t < 1450 ? Math.round(60 * (1 - (t - 1250) / 200)) : 0;
		for (const linea of lineasLogo) {
			lineas.push(columnas > 0 ? centrar(lineaDegradada(linea, progresoLogo >= 1 ? Infinity : columnas, brillo, this.oscuro), ancho) : "");
		}

		// Fase 1: el hilo que cruza la pantalla, debajo del logo.
		const largoHilo = Math.min(ancho - 4, anchoLogo + 8);
		const progresoHilo = Math.max(0, Math.min(1, t / 450));
		const tramo = Math.round(largoHilo * progresoHilo);
		let hilo = "";
		for (let i = 0; i < tramo; i++) {
			const ondula = (i + Math.floor(t / 60)) % 6 === 0 ? "╌" : "─";
			hilo += pintar(colorDegradado(i / Math.max(1, largoHilo - 1), this.oscuro), i === tramo - 1 && progresoHilo < 1 ? "●" : ondula);
		}
		lineas.push("");
		lineas.push(centrar(hilo + " ".repeat(Math.max(0, largoHilo - tramo)), ancho));

		// Fase 3: lema y version.
		const progresoLema = Math.max(0, Math.min(1, (t - 1250) / 350));
		const letras = Math.round(LEMA.length * progresoLema);
		lineas.push("");
		lineas.push(letras > 0 ? centrar(pintar([170, 180, 200], LEMA.slice(0, letras)), ancho) : "");
		if (this.version && progresoLema >= 1) lineas.push(centrar(pintar([110, 115, 130], `v${this.version}`), ancho));

		while (lineas.length < alto - 1) lineas.push("");
		lineas.push(centrar(pintar([90, 95, 110], "pulsa cualquier tecla o haz clic para saltar"), ancho));
		return lineas;
	}

	handleInput() {
		this.terminar();
	}

	handleMouse(evento) {
		if (evento.type === "press" || evento.type === "click") {
			this.terminar();
			return { handled: true };
		}
		return undefined;
	}
}
