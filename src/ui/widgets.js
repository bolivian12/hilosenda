// Componentes de consola de hilosenda: botones, tarjetas, listas, campos y pantallas.
//
// Todos funcionan con el raton (clic, rueda y efecto al pasar por encima) y con el
// teclado (flechas, Tab, Enter, Esc). Se usan en la pantalla de inicio y dentro de Pi.

import { fuzzyFilter, Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { logoDegradado } from "./animacion.js";
import { leerPortapapeles } from "../core/portapapeles.js";
import { tr } from "../i18n.js";

/** Ctrl+V (o Alt+V en Windows), el atajo de pegar. */
const esAtajoPegar = (data) => matchesKey(data, "ctrl+v") || (process.platform === "win32" && matchesKey(data, "alt+v"));

/** Lee texto del portapapeles (o la ruta si se copio un archivo). */
async function textoDelPortapapeles() {
	const c = await leerPortapapeles().catch(() => undefined);
	if (!c) return "";
	if (c.tipo === "texto") return c.texto;
	if (c.tipo === "archivos") return c.rutas.join(" ");
	return "";
}

const espacios = (n) => " ".repeat(Math.max(0, n));

/** Rellena una linea con espacios hasta `ancho` columnas visibles. */
export function rellenar(linea, ancho) {
	const visible = visibleWidth(linea);
	if (visible > ancho) return truncateToWidth(linea, ancho, "…");
	return linea + espacios(ancho - visible);
}

/** Centra una linea dentro de `ancho` columnas. */
export function centrar(linea, ancho) {
	const visible = visibleWidth(linea);
	if (visible >= ancho) return truncateToWidth(linea, ancho, "…");
	return espacios(Math.floor((ancho - visible) / 2)) + linea;
}

/** Acorta una ruta por la izquierda: "…/proyectos/web". */
export function acortarRuta(ruta, ancho) {
	if (visibleWidth(ruta) <= ancho) return ruta;
	const partes = ruta.split(/[\\/]/);
	let salida = partes.pop() ?? ruta;
	while (partes.length > 0 && visibleWidth(`…/${partes[partes.length - 1]}/${salida}`) <= ancho) salida = `${partes.pop()}/${salida}`;
	return truncateToWidth(`…/${salida}`, ancho, "…");
}

/** Recorta texto a `ancho` columnas con "…". Para texto sin colores no agrega codigos de escape. */
export function recortar(texto, ancho) {
	if (ancho <= 0) return "";
	if (visibleWidth(texto) <= ancho) return texto;
	if (texto.includes("\x1b")) return truncateToWidth(texto, ancho, "…");
	let salida = "";
	let usado = 0;
	for (const caracter of texto) {
		const w = visibleWidth(caracter);
		if (usado + w > ancho - 1) break;
		salida += caracter;
		usado += w;
	}
	return `${salida}…`;
}
const esImprimible = (data) => data.length > 0 && !data.startsWith("\x1b") && !/[\x00-\x1f\x7f]/.test(data);
const esClicIzquierdo = (e) => e.button === "left" && (e.type === "press" || e.type === "release" || e.type === "click");

/** Estado visual de un elemento pulsable. */
function estadoDe(indice, { presionado, enfocado, foco, hover }) {
	if (presionado === indice) return "presionado";
	if (enfocado && foco === indice) return "foco";
	if (hover === indice) return "hover";
	return "normal";
}

/**
 * Logica comun de raton para elementos pulsables con zonas.
 * El componente debe tener `zonas`, `hover`, `presionado`, `indice` y `pulsar(indice)`.
 */
function ratonPulsable(componente, evento) {
	const zona = componente.zonas.find((z) => evento.y >= z.y0 && evento.y <= z.y1 && evento.x >= z.x0 && evento.x <= z.x1);
	if (evento.type === "move" || evento.type === "drag") {
		const nuevo = zona ? zona.indice : -1;
		if (nuevo !== componente.hover) {
			componente.hover = nuevo;
			return { handled: true, render: true };
		}
		return zona ? { handled: true, render: false } : undefined;
	}
	if (!esClicIzquierdo(evento)) return undefined;
	if (evento.type === "press") {
		componente.presionado = zona ? zona.indice : -1;
		if (zona) componente.indice = zona.indice;
		return zona ? { handled: true, capture: true } : undefined;
	}
	const presionado = componente.presionado;
	componente.presionado = -1;
	if (zona && zona.indice === presionado) {
		componente.pulsar(zona.indice);
		return { handled: true, render: true };
	}
	return presionado >= 0 ? { handled: true, render: true } : undefined;
}

// ---------------------------------------------------------------------------
// Texto y decoracion
// ---------------------------------------------------------------------------

/** Parrafo de texto que se ajusta al ancho disponible. */
export class Parrafo {
	/** @param {string | ((ancho: number) => string)} texto Texto fijo o funcion que lo genera segun el ancho. */
	constructor(texto, sangria = 0) {
		this.texto = texto;
		this.sangria = sangria;
	}

	render(ancho) {
		const util = Math.max(1, ancho - this.sangria);
		const texto = typeof this.texto === "function" ? this.texto(util) : this.texto;
		if (texto === "") return [""];
		return texto
			.split("\n")
			.flatMap((linea) => (linea === "" ? [""] : wrapTextWithAnsi(linea, util)))
			.map((linea) => espacios(this.sangria) + linea);
	}

	invalidate() {}
}

/** Titulo de seccion: "TITULO ─────". */
export class Seccion {
	constructor(estilo, titulo) {
		this.estilo = estilo;
		this.titulo = titulo;
	}

	render(ancho) {
		const etiqueta = this.titulo.toUpperCase();
		const resto = Math.max(0, ancho - visibleWidth(etiqueta) - 1);
		return ["", this.estilo.pintar(etiqueta, { fg: this.estilo.c.tenue, negrita: true }) + this.estilo.borde(` ${"─".repeat(resto)}`)];
	}

	invalidate() {}
}

/** Logo de hilosenda con degradado, centrado. */
export class Logo {
	constructor(estilo, subtitulo) {
		this.estilo = estilo;
		this.subtitulo = subtitulo;
	}

	render(ancho) {
		const lineas = [""];
		for (const fila of logoDegradado(ancho, this.estilo.oscuro)) lineas.push(centrar(fila, ancho));
		if (this.subtitulo) lineas.push(centrar(this.estilo.suave(this.subtitulo), ancho));
		return lineas;
	}

	invalidate() {}
}

/** Tarjeta redondeada con un titulo pequeño y lineas de contenido. */
export class Tarjeta {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {(anchoInterior: number) => Array<import("./style.js").Segmento[]>} contenido Filas de segmentos.
	 * @param {{ titulo?: string }} [opciones]
	 */
	constructor(estilo, contenido, opciones = {}) {
		this.estilo = estilo;
		this.contenido = contenido;
		this.titulo = opciones.titulo;
	}

	render(ancho) {
		const e = this.estilo;
		const fondo = e.c.tarjeta;
		const interior = Math.max(4, ancho - 4);
		const filas = [];
		if (this.titulo) filas.push([{ t: this.titulo.toUpperCase(), fg: e.c.tenue, negrita: true }]);
		filas.push(...this.contenido(interior));
		const lineas = filas.map((segmentos) => {
			const texto = e.segmentos([{ t: "  " }, ...segmentos], fondo);
			return visibleWidth(texto) > ancho ? truncateToWidth(texto, ancho - 1, "…") : texto;
		});
		return e.bloque(lineas, ancho, fondo);
	}

	invalidate() {}
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Boton
 * @property {string} id
 * @property {string} etiqueta
 * @property {string} [icono]
 * @property {import("./style.js").TipoBoton} [tipo]
 * @property {string} [ayuda] Explicacion que se muestra al enfocar o pasar el raton.
 */

/** Fila de botones con forma de pildora. Se reparte en varias lineas si no cabe. */
export class FilaBotones {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {Boton[]} botones
	 * @param {{ grande?: boolean, centrado?: boolean, mostrarAyuda?: boolean, derechaDesde?: number, alPulsar?: (id: string) => void }} [opciones]
	 */
	constructor(estilo, botones, opciones = {}) {
		this.estilo = estilo;
		this.botones = botones;
		this.grande = opciones.grande ?? false;
		this.centrado = opciones.centrado ?? false;
		this.mostrarAyuda = opciones.mostrarAyuda ?? false;
		this.derechaDesde = opciones.derechaDesde;
		this.alPulsar = opciones.alPulsar;
		this.interactivo = true;
		this.enfocado = false;
		this.indice = 0;
		this.presionado = -1;
		this.hover = -1;
		/** @type {Array<{ y0: number, y1: number, x0: number, x1: number, indice: number, banda: number }>} */
		this.zonas = [];
	}

	setBotones(botones) {
		this.botones = botones;
		this.indice = Math.min(this.indice, Math.max(0, botones.length - 1));
	}

	invalidate() {}

	quitarHover() {
		if (this.hover === -1) return false;
		this.hover = -1;
		return true;
	}

	textoDe(boton, ancho) {
		const relleno = this.grande ? "   " : " ";
		const texto = `${relleno}${boton.icono ? `${boton.icono}  ` : ""}${boton.etiqueta}${relleno}`;
		return recortar(texto, this.grande ? ancho : ancho - 2);
	}

	render(ancho) {
		const e = this.estilo;
		const separacion = this.grande ? 2 : 1;
		/** @type {Array<Array<{ indice: number, texto: string, ancho: number }>>} */
		const bandas = [[]];
		let usado = 0;
		this.botones.forEach((boton, indice) => {
			const texto = this.textoDe(boton, ancho);
			const w = visibleWidth(texto) + (this.grande ? 0 : 2);
			const banda = bandas[bandas.length - 1];
			const necesario = banda.length === 0 ? w : usado + separacion + w;
			if (banda.length > 0 && necesario > ancho) {
				bandas.push([{ indice, texto, ancho: w }]);
				usado = w;
			} else {
				banda.push({ indice, texto, ancho: w });
				usado = necesario;
			}
		});

		const lineas = [];
		this.zonas = [];
		const alto = this.grande ? 3 : 1;
		const estados = { presionado: this.presionado, enfocado: this.enfocado, foco: this.indice, hover: this.hover };
		bandas.forEach((banda, numeroBanda) => {
			if (banda.length === 0) return;
			const total = banda.reduce((s, b) => s + b.ancho, 0) + separacion * (banda.length - 1);
			// Posicion x de cada boton.
			const posiciones = [];
			let x = this.centrado ? Math.max(0, Math.floor((ancho - total) / 2)) : 0;
			const derecha = this.derechaDesde !== undefined && bandas.length === 1 ? banda.findIndex((b) => b.indice >= this.derechaDesde) : -1;
			banda.forEach((b, i) => {
				if (i === derecha && derecha > 0) {
					const restante = banda.slice(i).reduce((s, r) => s + r.ancho, 0) + separacion * (banda.length - i - 1);
					x = Math.max(x, ancho - restante);
				}
				posiciones.push(x);
				x += b.ancho + separacion;
			});

			const filas = Array.from({ length: alto }, () => "");
			const y0 = lineas.length;
			let cursor = 0;
			banda.forEach((b, i) => {
				const boton = this.botones[b.indice];
				const { fondo, frente } = e.colorBoton(boton.tipo ?? "normal", estadoDe(b.indice, estados));
				const hueco = espacios(posiciones[i] - cursor);
				if (this.grande) {
					const forma = e.bloque([e.pintar(b.texto, { fg: frente, bg: fondo, negrita: true })], b.ancho, fondo);
					for (let f = 0; f < alto; f++) filas[f] += hueco + forma[f];
				} else {
					filas[0] += hueco + e.pastilla(b.texto, fondo, frente, boton.tipo !== "suave");
				}
				cursor = posiciones[i] + b.ancho;
				this.zonas.push({ y0, y1: y0 + alto - 1, x0: posiciones[i], x1: posiciones[i] + b.ancho - 1, indice: b.indice, banda: numeroBanda });
			});
			lineas.push(...filas);
			if (this.grande && numeroBanda < bandas.length - 1) lineas.push("");
		});

		if (this.mostrarAyuda) {
			const visible = this.hover >= 0 ? this.hover : this.enfocado ? this.indice : -1;
			const ayuda = this.botones[visible]?.ayuda;
			lineas.push(ayuda ? e.suave(recortar(`  ${ayuda}`, ancho)) : "");
		}
		return lineas;
	}

	/** @returns {boolean} true si la tecla se uso. */
	handleInput(data) {
		if (this.botones.length === 0) return false;
		if (matchesKey(data, "left")) {
			if (this.indice === 0) return false;
			this.indice--;
			return true;
		}
		if (matchesKey(data, "right")) {
			if (this.indice >= this.botones.length - 1) return false;
			this.indice++;
			return true;
		}
		if (matchesKey(data, "up") || matchesKey(data, "down")) {
			const actual = this.zonas.find((z) => z.indice === this.indice);
			if (!actual) return false;
			const destino = matchesKey(data, "up") ? actual.banda - 1 : actual.banda + 1;
			const candidatos = this.zonas.filter((z) => z.banda === destino);
			if (candidatos.length === 0) return false;
			const centro = (actual.x0 + actual.x1) / 2;
			candidatos.sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - centro) - Math.abs((b.x0 + b.x1) / 2 - centro));
			this.indice = candidatos[0].indice;
			return true;
		}
		if (matchesKey(data, "enter") || data === " ") {
			this.pulsar(this.indice);
			return true;
		}
		return false;
	}

	pulsar(indice) {
		const boton = this.botones[indice];
		if (boton) this.alPulsar?.(boton.id);
	}

	handleMouse(evento) {
		return ratonPulsable(this, evento);
	}
}

/**
 * @typedef {object} Mosaico
 * @property {string} id
 * @property {string} titulo
 * @property {string} [descripcion]
 * @property {string} [icono]
 * @property {number} [color] Indice en la paleta de acentos.
 */

/** Cuadricula de tarjetas pulsables, como los accesos de una aplicacion. */
export class Mosaico {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {Array<{ id: string, titulo: string, descripcion?: string, icono?: string, color?: number }>} elementos
	 * @param {{ alPulsar?: (id: string) => void, anchoMinimo?: number, columnasMax?: number }} [opciones]
	 */
	constructor(estilo, elementos, opciones = {}) {
		this.estilo = estilo;
		this.elementos = elementos;
		this.alPulsar = opciones.alPulsar;
		this.anchoMinimo = opciones.anchoMinimo ?? 26;
		this.columnasMax = opciones.columnasMax ?? 4;
		this.interactivo = true;
		this.enfocado = false;
		this.indice = 0;
		this.presionado = -1;
		this.hover = -1;
		this.columnas = 1;
		this.zonas = [];
	}

	invalidate() {}

	quitarHover() {
		if (this.hover === -1) return false;
		this.hover = -1;
		return true;
	}

	render(ancho) {
		const e = this.estilo;
		const separacion = 2;
		const columnas = Math.max(1, Math.min(this.columnasMax, this.elementos.length, Math.floor((ancho + separacion) / (this.anchoMinimo + separacion))));
		this.columnas = columnas;
		const w = Math.floor((ancho - separacion * (columnas - 1)) / columnas);
		const lineas = [];
		this.zonas = [];
		const estados = { presionado: this.presionado, enfocado: this.enfocado, foco: this.indice, hover: this.hover };
		for (let inicio = 0; inicio < this.elementos.length; inicio += columnas) {
			const fila = this.elementos.slice(inicio, inicio + columnas);
			const y0 = lineas.length;
			const formas = fila.map((el, i) => {
				const indice = inicio + i;
				const color = e.c.acentos[(el.color ?? indice) % e.c.acentos.length];
				const estado = estadoDe(indice, estados);
				const fondo =
					estado === "presionado" ? e.mezclar(e.c.tarjeta, color, 0.55) : estado === "foco" ? e.mezclar(e.c.tarjeta, color, 0.3) : estado === "hover" ? e.c.tarjetaHover : e.c.tarjeta;
				const destacado = estado !== "normal";
				const titulo = recortar(el.titulo, w - 7);
				const flecha = destacado ? "›" : " ";
				const linea1 = e.segmentos(
					[
						{ t: "  " },
						{ t: el.icono ?? "•", fg: color, negrita: true },
						{ t: "  " },
						{ t: titulo, fg: destacado && e.oscuro ? e.c.texto : e.c.texto, negrita: true },
						{ t: espacios(Math.max(0, w - 7 - visibleWidth(titulo))) },
						{ t: flecha, fg: color, negrita: true },
					],
					fondo,
				);
				const linea2 = e.segmentos([{ t: "     " }, { t: recortar(el.descripcion ?? "", w - 7), fg: destacado ? e.c.texto : e.c.suave }], fondo);
				this.zonas.push({ y0, y1: y0 + 3, x0: i * (w + separacion), x1: i * (w + separacion) + w - 1, indice, fila: inicio / columnas });
				return e.bloque([linea1, linea2], w, fondo);
			});
			for (let f = 0; f < 4; f++) lineas.push(formas.map((forma) => forma[f]).join(espacios(separacion)));
		}
		return lineas;
	}

	pulsar(indice) {
		const el = this.elementos[indice];
		if (el) this.alPulsar?.(el.id);
	}

	handleInput(data) {
		const total = this.elementos.length;
		const col = this.indice % this.columnas;
		if (matchesKey(data, "left")) {
			if (col === 0) return false;
			this.indice--;
			return true;
		}
		if (matchesKey(data, "right")) {
			if (col === this.columnas - 1 || this.indice >= total - 1) return false;
			this.indice++;
			return true;
		}
		if (matchesKey(data, "up")) {
			if (this.indice - this.columnas < 0) return false;
			this.indice -= this.columnas;
			return true;
		}
		if (matchesKey(data, "down")) {
			if (this.indice + this.columnas >= total) {
				// Ultima fila incompleta: bajar a la ultima tarjeta si hay otra fila.
				const filaActual = Math.floor(this.indice / this.columnas);
				const ultimaFila = Math.floor((total - 1) / this.columnas);
				if (filaActual === ultimaFila) return false;
				this.indice = total - 1;
				return true;
			}
			this.indice += this.columnas;
			return true;
		}
		if (matchesKey(data, "enter") || data === " ") {
			this.pulsar(this.indice);
			return true;
		}
		return false;
	}

	handleMouse(evento) {
		return ratonPulsable(this, evento);
	}
}

// ---------------------------------------------------------------------------
// Lista con buscador
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Elemento
 * @property {string} id
 * @property {string} etiqueta
 * @property {string} [detalle]
 * @property {string} [grupo]
 * @property {string} [buscarEn] Texto adicional para el buscador.
 * @property {any} [valor]
 */

/** Lista desplazable. Clic para elegir, rueda para moverse, escribir para buscar. */
export class Lista {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {Elemento[]} elementos
	 * @param {{ alto?: number, buscador?: boolean, vacio?: string, inicial?: string, alElegir?: (e: Elemento) => void, alCambiar?: (e: Elemento | undefined) => void }} [opciones]
	 */
	constructor(estilo, elementos, opciones = {}) {
		this.estilo = estilo;
		this.alto = opciones.alto ?? 10;
		this.buscador = opciones.buscador ?? elementos.length > 8;
		this.vacio = opciones.vacio ?? tr("No hay nada para mostrar.");
		this.alElegir = opciones.alElegir;
		this.alCambiar = opciones.alCambiar;
		this.interactivo = true;
		this.enfocado = false;
		this.consulta = "";
		this.seleccion = 0;
		this.desplazamiento = 0;
		this.hover = -1;
		this.zonas = [];
		this.setElementos(elementos);
		if (opciones.inicial !== undefined) this.seleccion = Math.max(0, this.visibles.findIndex((e) => e.id === opciones.inicial));
	}

	setElementos(elementos) {
		this.elementos = elementos;
		this.filtrar();
	}

	filtrar() {
		this.visibles = this.consulta
			? fuzzyFilter(this.elementos, this.consulta, (e) => `${e.etiqueta} ${e.detalle ?? ""} ${e.grupo ?? ""} ${e.buscarEn ?? ""}`)
			: this.elementos;
		this.seleccion = Math.min(this.seleccion, Math.max(0, this.visibles.length - 1));
		if (this.consulta) this.seleccion = 0;
		this.desplazamiento = 0;
	}

	actual() {
		return this.visibles[this.seleccion];
	}

	invalidate() {}

	quitarHover() {
		if (this.hover === -1) return false;
		this.hover = -1;
		return true;
	}

	/** Filas a dibujar: titulos de grupo y elementos. */
	filas() {
		const filas = [];
		let grupo;
		this.visibles.forEach((elemento, indice) => {
			if (!this.consulta && elemento.grupo && elemento.grupo !== grupo) {
				grupo = elemento.grupo;
				filas.push({ grupo });
			}
			filas.push({ elemento, indice });
		});
		return filas;
	}

	render(ancho) {
		const e = this.estilo;
		const lineas = [];
		this.zonas = [];
		if (this.buscador) {
			const fondo = this.enfocado ? e.mezclar(e.c.tarjeta, e.c.acento, 0.12) : e.c.tarjeta;
			const cursor = this.enfocado ? { t: "▏", fg: e.c.acento } : { t: "" };
			const contenido = this.consulta ? [{ t: this.consulta, fg: e.c.texto }, cursor] : [cursor, { t: tr("escribe para buscar…"), fg: e.c.tenue }];
			const interior = e.segmentos([{ t: " ⌕ ", fg: e.c.acento, negrita: true }, ...contenido], fondo);
			const relleno = e.pintar(espacios(Math.max(0, ancho - 2 - visibleWidth(interior))), { bg: fondo });
			lineas.push(e.pintar("▐", { fg: fondo }) + interior + relleno + e.pintar("▌", { fg: fondo }));
			lineas.push("");
			this.zonas.push({ tipo: "buscador", y: 0 });
		}
		if (this.visibles.length === 0) {
			lineas.push(e.suave(`  ${this.consulta ? tr("Nada coincide con la busqueda.") : this.vacio}`));
			return lineas;
		}

		const filas = this.filas();
		const filaSeleccion = filas.findIndex((f) => f.indice === this.seleccion);
		const alto = Math.max(3, this.alto);
		if (filaSeleccion < this.desplazamiento) this.desplazamiento = Math.max(0, filaSeleccion - (filaSeleccion > 0 && !filas[filaSeleccion - 1].elemento ? 1 : 0));
		if (filaSeleccion >= this.desplazamiento + alto) this.desplazamiento = filaSeleccion - alto + 1;
		this.desplazamiento = Math.max(0, Math.min(this.desplazamiento, Math.max(0, filas.length - alto)));

		const anchoEtiqueta = Math.min(Math.max(...this.visibles.map((x) => visibleWidth(x.etiqueta))) + 3, Math.max(12, Math.floor(ancho * 0.5)));

		if (this.desplazamiento > 0) {
			lineas.push(e.acento(tr("   ▲ {0} mas arriba", [this.desplazamiento])));
			this.zonas.push({ tipo: "arriba", y: lineas.length - 1 });
		}
		for (const fila of filas.slice(this.desplazamiento, this.desplazamiento + alto)) {
			if (fila.grupo !== undefined) {
				const etiqueta = ` ${fila.grupo.toUpperCase()} `;
				lineas.push(e.pintar(etiqueta, { fg: e.c.tenue, negrita: true }) + e.borde("─".repeat(Math.max(0, ancho - visibleWidth(etiqueta)))));
				continue;
			}
			const elegido = fila.indice === this.seleccion;
			const encima = fila.indice === this.hover;
			const fondo = elegido ? e.c.seleccion : encima ? e.c.tarjetaHover : undefined;
			const etiqueta = rellenar(recortar(fila.elemento.etiqueta, anchoEtiqueta - 2), anchoEtiqueta);
			const resto = Math.max(0, ancho - 3 - anchoEtiqueta);
			const detalle = fila.elemento.detalle ? recortar(fila.elemento.detalle, resto) : "";
			const partes = [
				{ t: elegido ? "▌" : " ", fg: e.c.acento },
				{ t: "  " },
				{ t: etiqueta, fg: e.c.texto, negrita: elegido },
				{ t: detalle, fg: elegido ? e.c.texto : e.c.suave },
			];
			let linea = fondo ? e.segmentos(partes, fondo) : e.segmentos(partes, undefined);
			if (fondo) linea += e.pintar(espacios(Math.max(0, ancho - visibleWidth(linea))), { bg: fondo });
			lineas.push(linea);
			this.zonas.push({ tipo: "elemento", y: lineas.length - 1, indice: fila.indice });
		}
		const debajo = filas.length - (this.desplazamiento + alto);
		if (debajo > 0) {
			lineas.push(e.acento(tr("   ▼ {0} mas abajo", [debajo])));
			this.zonas.push({ tipo: "abajo", y: lineas.length - 1 });
		}
		return lineas;
	}

	mover(delta) {
		if (this.visibles.length === 0) return;
		this.seleccion = Math.max(0, Math.min(this.visibles.length - 1, this.seleccion + delta));
		this.alCambiar?.(this.actual());
	}

	handleInput(data) {
		if (matchesKey(data, "up")) {
			if (this.seleccion === 0) return false;
			this.mover(-1);
			return true;
		}
		if (matchesKey(data, "down")) {
			if (this.seleccion >= this.visibles.length - 1) return false;
			this.mover(1);
			return true;
		}
		if (matchesKey(data, "pageUp")) {
			this.mover(-this.alto);
			return true;
		}
		if (matchesKey(data, "pageDown")) {
			this.mover(this.alto);
			return true;
		}
		if (matchesKey(data, "home")) {
			this.mover(-this.visibles.length);
			return true;
		}
		if (matchesKey(data, "end")) {
			this.mover(this.visibles.length);
			return true;
		}
		if (matchesKey(data, "enter")) {
			const elemento = this.actual();
			if (elemento) this.alElegir?.(elemento);
			return true;
		}
		if (this.buscador && (matchesKey(data, "backspace") || data === "\x7f" || data === "\b")) {
			if (!this.consulta) return false;
			this.consulta = [...this.consulta].slice(0, -1).join("");
			this.filtrar();
			return true;
		}
		if (this.buscador && esAtajoPegar(data)) {
			void textoDelPortapapeles().then((t) => {
				if (!t) return;
				this.consulta += t.replace(/\s+/g, " ").trim();
				this.filtrar();
				this.pantalla?.pedirRender();
			});
			return true;
		}
		if (this.buscador && data.includes("\x1b[200~")) {
			this.consulta += data.replace(/\x1b\[20[01]~/g, "").replace(/\s+/g, " ").trim();
			this.filtrar();
			return true;
		}
		if (this.buscador && esImprimible(data)) {
			this.consulta += data;
			this.filtrar();
			return true;
		}
		return false;
	}

	handleMouse(evento) {
		if (evento.type === "wheel" && evento.wheelDelta) {
			this.mover(evento.wheelDelta < 0 ? -1 : 1);
			return { handled: true, render: true };
		}
		const zona = this.zonas.find((z) => z.y === evento.y);
		if (evento.type === "move" || evento.type === "drag") {
			const nuevo = zona?.tipo === "elemento" ? zona.indice : -1;
			if (nuevo === this.hover) return zona ? { handled: true, render: false } : undefined;
			this.hover = nuevo;
			return { handled: true, render: true };
		}
		if (evento.button !== "left" || (evento.type !== "click" && evento.type !== "press")) return undefined;
		if (!zona) return undefined;
		if (evento.type === "press") return { handled: true };
		if (zona.tipo === "arriba") this.mover(-Math.max(1, this.alto - 1));
		else if (zona.tipo === "abajo") this.mover(Math.max(1, this.alto - 1));
		else if (zona.tipo === "elemento") {
			this.seleccion = zona.indice;
			this.alCambiar?.(this.actual());
			const elemento = this.actual();
			if (elemento) this.alElegir?.(elemento);
		}
		return { handled: true, render: true };
	}
}

// ---------------------------------------------------------------------------
// Campo de texto
// ---------------------------------------------------------------------------

/** Input de Pi que muestra puntos en lugar del texto (para claves API). */
class InputOculto extends Input {
	render(ancho) {
		const real = this.value;
		this.value = "•".repeat([...real].length);
		try {
			return super.render(ancho);
		} finally {
			this.value = real;
		}
	}
}

/** Campo de texto de una linea con etiqueta. */
export class Campo {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {{ etiqueta: string, placeholder?: string, oculto?: boolean, valor?: string, alEnviar?: (valor: string) => void }} opciones
	 */
	constructor(estilo, opciones) {
		this.estilo = estilo;
		this.etiqueta = opciones.etiqueta;
		this.alEnviar = opciones.alEnviar;
		this.interactivo = true;
		this._enfocado = false;
		const placeholderStyle = (t) => estilo.tenue(t);
		this.input = opciones.oculto
			? new InputOculto({ prompt: " ", placeholder: opciones.placeholder ?? "", placeholderStyle })
			: new Input({ prompt: " ", placeholder: opciones.placeholder ?? "", placeholderStyle });
		if (opciones.valor) {
			this.input.setValue(opciones.valor);
			this.input.handleInput("\x05"); // Ctrl+E: cursor al final.
		}
	}

	get enfocado() {
		return this._enfocado;
	}

	set enfocado(valor) {
		this._enfocado = valor;
		this.input.focused = valor;
	}

	get valor() {
		return this.input.getValue();
	}

	invalidate() {
		this.input.invalidate?.();
	}

	render(ancho) {
		const e = this.estilo;
		const marco = (t) => e.pintar(t, { fg: this.enfocado ? e.c.acento : e.c.borde });
		const interior = Math.max(4, ancho - 4);
		const linea = this.input.render(interior)[0] ?? "";
		return [
			e.pintar(this.etiqueta, { fg: e.c.texto, negrita: true }),
			marco(`╭${"─".repeat(interior + 2)}╮`),
			`${marco("│")}${rellenar(linea, interior + 2)}${marco("│")}`,
			marco(`╰${"─".repeat(interior + 2)}╯`),
		];
	}

	/** Pega texto como si se hubiera pegado desde la terminal. */
	pegarTexto(texto) {
		if (!texto) return;
		this.input.handleInput(`\x1b[200~${texto.replace(/\r?\n/g, " ").trim()}\x1b[201~`);
		this.pantalla?.pedirRender();
	}

	pegarPortapapeles() {
		void textoDelPortapapeles().then((t) => this.pegarTexto(t));
	}

	handleInput(data) {
		if (matchesKey(data, "up") || matchesKey(data, "down") || matchesKey(data, "tab") || matchesKey(data, "escape")) {
			return false;
		}
		if (esAtajoPegar(data)) {
			this.pegarPortapapeles();
			return true;
		}
		if (matchesKey(data, "enter")) {
			this.alEnviar?.(this.valor);
			return true;
		}
		this.input.handleInput(data);
		return true;
	}

	handleMouse(evento) {
		if (evento.button === "right" && evento.type === "press") {
			this.pegarPortapapeles();
			return { handled: true };
		}
		if (evento.button === "left" && (evento.type === "press" || evento.type === "click")) return { handled: true };
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

/**
 * Contenedor vertical con barra de titulo, como una ventana. Reparte el foco entre
 * sus elementos interactivos: Tab / Shift+Tab y flechas pasan de uno a otro; Esc o
 * el boton ✕ llaman a `alSalir`.
 */
export class Pantalla {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {{ titulo?: string, pie?: string, alSalir?: () => void, alto?: () => number }} [opciones]
	 *   `alto`: si se indica, la pantalla ocupa toda esa altura y el pie queda abajo como barra de estado.
	 */
	constructor(estilo, opciones = {}) {
		this.estilo = estilo;
		this.titulo = opciones.titulo;
		this.pie = opciones.pie ?? tr("Clic en un boton · Flechas y Enter · Esc para volver");
		this.alSalir = opciones.alSalir;
		this.alto = opciones.alto;
		/** @type {any[]} */
		this.hijos = [];
		this.foco = -1;
		this.alturas = [];
		this.mensaje = undefined;
		/** @type {{ requestRender(): void } | undefined} */
		this.tui = undefined;
		this.margen = 2;
		this.hoverCerrar = false;
		this.zonaCerrar = undefined;
		this.inicioHijos = 0;
	}

	agregar(componente) {
		componente.pantalla = this;
		this.hijos.push(componente);
		if (this.foco < 0 && componente.interactivo) this.enfocar(this.hijos.length - 1);
		return componente;
	}

	enfocar(indice) {
		if (this.foco >= 0 && this.hijos[this.foco]) this.hijos[this.foco].enfocado = false;
		this.foco = indice;
		if (indice >= 0 && this.hijos[indice]) this.hijos[indice].enfocado = true;
	}

	avisar(texto, tipo = "info") {
		this.mensaje = texto ? { texto, tipo } : undefined;
		this.pedirRender();
	}

	pedirRender() {
		this.tui?.requestRender();
	}

	invalidate() {
		for (const hijo of this.hijos) hijo.invalidate?.();
	}

	barraTitulo(ancho) {
		const e = this.estilo;
		const fondo = e.c.barra;
		const izquierda = e.segmentos([{ t: "  ◆ ", fg: e.c.acento, negrita: true }, { t: recortar(this.titulo, ancho - 10), fg: e.c.texto, negrita: true }], fondo);
		const cerrar = e.segmentos([{ t: " ✕ ", fg: this.hoverCerrar ? e.c.error : e.c.suave, negrita: this.hoverCerrar }, { t: " " }], fondo);
		const hueco = Math.max(0, ancho - visibleWidth(izquierda) - visibleWidth(cerrar));
		this.zonaCerrar = { x0: ancho - 4, x1: ancho - 2 };
		return izquierda + e.pintar(espacios(hueco), { bg: fondo }) + cerrar;
	}

	render(anchoTotal) {
		const e = this.estilo;
		const ancho = Math.max(10, anchoTotal - this.margen * 2);
		const sangria = espacios(this.margen);
		const lineas = [];
		if (this.titulo) {
			lineas.push(this.barraTitulo(anchoTotal));
			lineas.push("");
		}
		this.inicioHijos = lineas.length;
		this.alturas = [];
		for (const hijo of this.hijos) {
			const propias = hijo.render(ancho);
			this.alturas.push(propias.length);
			for (const linea of propias) lineas.push(sangria + linea);
		}
		lineas.push("");
		if (this.mensaje) {
			const color = this.mensaje.tipo === "error" ? e.c.error : this.mensaje.tipo === "aviso" ? e.c.aviso : e.c.exito;
			const icono = this.mensaje.tipo === "error" ? "✕" : this.mensaje.tipo === "aviso" ? "!" : "✓";
			for (const linea of wrapTextWithAnsi(`${icono}  ${this.mensaje.texto}`, ancho)) lineas.push(sangria + e.pintar(linea, { fg: color }));
			lineas.push("");
		}
		if (!this.pie) return lineas;
		if (this.alto) {
			const total = this.alto();
			while (lineas.length < total - 1) lineas.push("");
			const barra = e.segmentos([{ t: `  ${recortar(this.pie, anchoTotal - 4)}`, fg: e.c.suave }], e.c.barra);
			lineas.push(barra + e.pintar(espacios(Math.max(0, anchoTotal - visibleWidth(barra))), { bg: e.c.barra }));
		} else {
			lineas.push(sangria + e.tenue(recortar(this.pie, ancho)));
		}
		return lineas;
	}

	/** Pasa el foco al elemento interactivo anterior o siguiente. Tab da la vuelta; las flechas no. */
	moverFoco(delta, darVuelta) {
		const interactivos = this.hijos.map((h, i) => (h.interactivo ? i : -1)).filter((i) => i >= 0);
		if (interactivos.length === 0) return false;
		const siguiente = interactivos.indexOf(this.foco) + delta;
		if (!darVuelta && (siguiente < 0 || siguiente >= interactivos.length)) return false;
		this.enfocar(interactivos[(siguiente + interactivos.length) % interactivos.length]);
		return true;
	}

	handleInput(data) {
		const hijo = this.hijos[this.foco];
		let usado = false;
		if (matchesKey(data, "tab")) usado = this.moverFoco(1, true);
		else if (matchesKey(data, "shift+tab")) usado = this.moverFoco(-1, true);
		else if (hijo?.handleInput?.(data)) usado = true;
		else if (matchesKey(data, "down") || matchesKey(data, "right")) usado = this.moverFoco(1, false);
		else if (matchesKey(data, "up") || matchesKey(data, "left")) usado = this.moverFoco(-1, false);
		else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.alSalir?.();
			usado = true;
		}
		if (usado) this.pedirRender();
	}

	/** Quita el efecto de raton de todos los hijos excepto `excepto`. */
	limpiarHover(excepto) {
		let cambio = false;
		for (const hijo of this.hijos) if (hijo !== excepto && hijo.quitarHover?.()) cambio = true;
		return cambio;
	}

	handleMouse(evento) {
		const esMovimiento = evento.type === "move" || evento.type === "drag";

		// Clic derecho en cualquier parte del dialogo: pegar en el campo de texto.
		if (evento.button === "right" && evento.type === "press") {
			const campo = this.hijos[this.foco]?.pegarPortapapeles ? this.hijos[this.foco] : this.hijos.find((h) => h.pegarPortapapeles);
			if (campo) {
				campo.pegarPortapapeles();
				return { handled: true };
			}
		}

		// Boton ✕ de la barra de titulo.
		if (this.titulo && evento.y === 0 && this.zonaCerrar) {
			const sobreCerrar = evento.x >= this.zonaCerrar.x0 && evento.x <= this.zonaCerrar.x1;
			if (esMovimiento) {
				const cambio = this.hoverCerrar !== sobreCerrar || this.limpiarHover();
				this.hoverCerrar = sobreCerrar;
				if (cambio) this.pedirRender();
				return { handled: true, render: cambio };
			}
			if (sobreCerrar && evento.button === "left") {
				if (evento.type === "click") this.alSalir?.();
				return { handled: true };
			}
		}
		if (esMovimiento && this.hoverCerrar) {
			this.hoverCerrar = false;
			this.pedirRender();
		}

		let y = this.inicioHijos;
		for (let i = 0; i < this.hijos.length; i++) {
			const alto = this.alturas[i] ?? 0;
			if (evento.y >= y && evento.y < y + alto) {
				const hijo = this.hijos[i];
				const limpiado = esMovimiento ? this.limpiarHover(hijo) : false;
				const resultado = hijo.handleMouse?.({
					...evento,
					x: evento.x - this.margen,
					y: evento.y - y,
					width: Math.max(10, evento.width - this.margen * 2),
					height: alto,
				});
				if (resultado) {
					if (hijo.interactivo && evento.type === "press") this.enfocar(i);
					if (!esMovimiento || resultado.render || limpiado) this.pedirRender();
					return { handled: true, capture: resultado.capture, render: !esMovimiento || resultado.render || limpiado };
				}
				if (limpiado) this.pedirRender();
				return limpiado ? { handled: true, render: true } : undefined;
			}
			y += alto;
		}
		if (esMovimiento) {
			const cambio = this.limpiarHover();
			if (cambio) this.pedirRender();
			return cambio ? { handled: true, render: true } : undefined;
		}
		if (evento.type === "wheel") {
			const hijo = this.hijos[this.foco];
			const resultado = hijo?.handleMouse?.({ ...evento, x: -1, y: -1 });
			if (resultado) {
				this.pedirRender();
				return { handled: true, render: true };
			}
		}
		return undefined;
	}
}
