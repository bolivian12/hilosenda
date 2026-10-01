// Componentes de consola de hilosenda: botones, listas, campos de texto y pantallas.
//
// Todos funcionan con el raton (clic y rueda) y con el teclado (flechas, Tab,
// Enter, Esc). Se usan tanto en la pantalla de inicio como dentro de Pi.

import { fuzzyFilter, Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { logoDegradado } from "./animacion.js";

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

const esImprimible = (data) => data.length > 0 && !data.startsWith("\x1b") && !/[\x00-\x1f\x7f]/.test(data);

// ---------------------------------------------------------------------------
// Texto
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

/** Titulo de seccion: "── Titulo ─────". */
export class Seccion {
	constructor(estilo, titulo) {
		this.estilo = estilo;
		this.titulo = titulo;
	}

	render(ancho) {
		const cabeza = `── ${this.titulo} `;
		const resto = Math.max(0, ancho - visibleWidth(cabeza));
		return ["", this.estilo.borde("── ") + this.estilo.titulo(this.titulo) + this.estilo.borde(` ${"─".repeat(resto)}`)];
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
		for (const fila of logoDegradado(ancho)) lineas.push(centrar(fila, ancho));
		if (this.subtitulo) lineas.push(centrar(this.estilo.suave(this.subtitulo), ancho));
		return lineas;
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
 * @property {import("./style.js").TipoBoton} [tipo]
 * @property {string} [ayuda] Explicacion que se muestra al enfocar el boton.
 */

/** Fila de botones clicables. Se reparte en varias lineas si no cabe. */
export class FilaBotones {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {Boton[]} botones
	 * @param {{ grande?: boolean, centrado?: boolean, mostrarAyuda?: boolean, alPulsar?: (id: string) => void }} [opciones]
	 */
	constructor(estilo, botones, opciones = {}) {
		this.estilo = estilo;
		this.botones = botones;
		this.grande = opciones.grande ?? false;
		this.centrado = opciones.centrado ?? false;
		this.mostrarAyuda = opciones.mostrarAyuda ?? false;
		this.alPulsar = opciones.alPulsar;
		this.interactivo = true;
		this.enfocado = false;
		this.indice = 0;
		this.presionado = -1;
		/** @type {Array<{ y0: number, y1: number, x0: number, x1: number, indice: number, banda: number }>} */
		this.zonas = [];
	}

	setBotones(botones) {
		this.botones = botones;
		this.indice = Math.min(this.indice, Math.max(0, botones.length - 1));
	}

	invalidate() {}

	render(ancho) {
		const relleno = this.grande ? 3 : 1;
		const separacion = 2;
		/** @type {Array<Array<{ indice: number, texto: string, ancho: number }>>} */
		const bandas = [[]];
		let usado = 0;
		this.botones.forEach((boton, indice) => {
			let texto = `${espacios(relleno)}${boton.etiqueta}${espacios(relleno)}`;
			if (visibleWidth(texto) > ancho) texto = truncateToWidth(texto, ancho, "…");
			const w = visibleWidth(texto);
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
		const altoBanda = this.grande ? 3 : 1;
		bandas.forEach((banda, numeroBanda) => {
			if (banda.length === 0) return;
			const total = banda.reduce((suma, b) => suma + b.ancho, 0) + separacion * (banda.length - 1);
			const inicio = this.centrado ? Math.max(0, Math.floor((ancho - total) / 2)) : 0;
			const filas = Array.from({ length: altoBanda }, () => espacios(inicio));
			const y0 = lineas.length;
			let x = inicio;
			banda.forEach((b, i) => {
				const boton = this.botones[b.indice];
				const enfocado = this.enfocado && this.indice === b.indice;
				const presionado = this.presionado === b.indice;
				const pintar = (t) => this.estilo.boton(t, boton.tipo ?? "normal", enfocado, presionado);
				for (let fila = 0; fila < altoBanda; fila++) {
					const contenido = altoBanda === 3 && fila !== 1 ? espacios(b.ancho) : b.texto;
					filas[fila] += pintar(contenido) + (i < banda.length - 1 ? espacios(separacion) : "");
				}
				this.zonas.push({ y0, y1: y0 + altoBanda - 1, x0: x, x1: x + b.ancho - 1, indice: b.indice, banda: numeroBanda });
				x += b.ancho + separacion;
			});
			lineas.push(...filas);
			if (this.grande && numeroBanda < bandas.length - 1) lineas.push("");
		});

		if (this.mostrarAyuda) {
			const ayuda = this.enfocado ? this.botones[this.indice]?.ayuda : undefined;
			lineas.push(ayuda ? this.estilo.suave(truncateToWidth(`  ${ayuda}`, ancho, "…")) : "");
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

	zonaEn(x, y) {
		return this.zonas.find((z) => y >= z.y0 && y <= z.y1 && x >= z.x0 && x <= z.x1);
	}

	handleMouse(evento) {
		if (evento.button !== "left") return undefined;
		const zona = this.zonaEn(evento.x, evento.y);
		if (evento.type === "press") {
			this.presionado = zona ? zona.indice : -1;
			if (zona) this.indice = zona.indice;
			return zona ? { handled: true, capture: true } : undefined;
		}
		if (evento.type === "release" || evento.type === "click") {
			const presionado = this.presionado;
			this.presionado = -1;
			if (zona && zona.indice === presionado) {
				this.pulsar(zona.indice);
				return { handled: true, render: true };
			}
			return presionado >= 0 ? { handled: true, render: true } : undefined;
		}
		return undefined;
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
		this.vacio = opciones.vacio ?? "No hay nada para mostrar.";
		this.alElegir = opciones.alElegir;
		this.alCambiar = opciones.alCambiar;
		this.interactivo = true;
		this.enfocado = false;
		this.consulta = "";
		this.seleccion = 0;
		this.desplazamiento = 0;
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
		const lineas = [];
		this.zonas = [];
		if (this.buscador) {
			const cursor = this.enfocado ? this.estilo.acento("▏") : "";
			const texto = this.consulta
				? this.estilo.texto(this.consulta) + cursor
				: cursor + this.estilo.tenue("escribe para buscar…");
			lineas.push(rellenar(`${this.estilo.acento(" Buscar: ")}${texto}`, ancho));
			this.zonas.push({ tipo: "buscador", y: 0 });
		}
		if (this.visibles.length === 0) {
			lineas.push(this.estilo.suave(`  ${this.consulta ? "Nada coincide con la busqueda." : this.vacio}`));
			return lineas;
		}

		const filas = this.filas();
		const filaSeleccion = filas.findIndex((f) => f.indice === this.seleccion);
		const alto = Math.max(3, this.alto);
		if (filaSeleccion < this.desplazamiento) this.desplazamiento = Math.max(0, filaSeleccion - (filaSeleccion > 0 && !filas[filaSeleccion - 1].elemento ? 1 : 0));
		if (filaSeleccion >= this.desplazamiento + alto) this.desplazamiento = filaSeleccion - alto + 1;
		this.desplazamiento = Math.max(0, Math.min(this.desplazamiento, Math.max(0, filas.length - alto)));

		const anchoEtiqueta = Math.min(
			Math.max(...this.visibles.map((e) => visibleWidth(e.etiqueta))) + 2,
			Math.max(12, Math.floor(ancho * 0.5)),
		);

		if (this.desplazamiento > 0) {
			lineas.push(this.estilo.acento(`  ▲ ${this.desplazamiento} mas arriba (clic o rueda)`));
			this.zonas.push({ tipo: "arriba", y: lineas.length - 1 });
		}
		for (const fila of filas.slice(this.desplazamiento, this.desplazamiento + alto)) {
			if (fila.grupo !== undefined) {
				lineas.push(this.estilo.negrita(this.estilo.suave(` ${fila.grupo}`)));
				continue;
			}
			const elegido = fila.indice === this.seleccion;
			const marca = elegido ? "▶ " : "  ";
			const etiqueta = rellenar(truncateToWidth(fila.elemento.etiqueta, anchoEtiqueta - 2, "…"), anchoEtiqueta);
			const resto = Math.max(0, ancho - 2 - anchoEtiqueta);
			const detalle = fila.elemento.detalle ? truncateToWidth(fila.elemento.detalle, resto, "…") : "";
			let linea;
			if (elegido) {
				linea = this.estilo.seleccion(rellenar(`${marca}${etiqueta}${detalle}`, ancho));
			} else {
				linea = `${marca}${this.estilo.texto(etiqueta)}${this.estilo.suave(detalle)}`;
			}
			lineas.push(linea);
			this.zonas.push({ tipo: "elemento", y: lineas.length - 1, indice: fila.indice });
		}
		const debajo = filas.length - (this.desplazamiento + alto);
		if (debajo > 0) {
			lineas.push(this.estilo.acento(`  ▼ ${debajo} mas abajo (clic o rueda)`));
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
		if (this.buscador && esImprimible(data) && !data.includes("\x1b[200~")) {
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
		if (evento.button !== "left" || (evento.type !== "click" && evento.type !== "press")) return undefined;
		const zona = this.zonas.find((z) => z.y === evento.y);
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
		const marco = this.enfocado ? this.estilo.acento : this.estilo.borde;
		const interior = Math.max(4, ancho - 4);
		const linea = this.input.render(interior)[0] ?? "";
		return [
			this.estilo.negrita(this.etiqueta),
			marco(`╭${"─".repeat(interior + 2)}╮`),
			`${marco("│")}${rellenar(linea, interior + 2)}${marco("│")}`,
			marco(`╰${"─".repeat(interior + 2)}╯`),
		];
	}

	handleInput(data) {
		if (matchesKey(data, "up") || matchesKey(data, "down") || matchesKey(data, "tab") || matchesKey(data, "escape")) {
			return false;
		}
		if (matchesKey(data, "enter")) {
			this.alEnviar?.(this.valor);
			return true;
		}
		this.input.handleInput(data);
		return true;
	}

	handleMouse(evento) {
		if (evento.button === "left" && (evento.type === "press" || evento.type === "click")) return { handled: true };
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

/**
 * Contenedor vertical que reparte el foco entre sus elementos interactivos.
 * Tab / Shift+Tab y las flechas pasan de un elemento a otro; Esc llama a `alSalir`.
 */
export class Pantalla {
	/**
	 * @param {import("./style.js").Estilo} estilo
	 * @param {{ titulo?: string, pie?: string, alSalir?: () => void }} [opciones]
	 */
	constructor(estilo, opciones = {}) {
		this.estilo = estilo;
		this.titulo = opciones.titulo;
		this.pie = opciones.pie ?? "Clic en un boton · Flechas y Enter · Esc para volver";
		this.alSalir = opciones.alSalir;
		/** @type {any[]} */
		this.hijos = [];
		this.foco = -1;
		this.alturas = [];
		this.mensaje = undefined;
		/** @type {{ requestRender(): void } | undefined} */
		this.tui = undefined;
		this.margen = 2;
	}

	agregar(componente) {
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

	render(anchoTotal) {
		const ancho = Math.max(10, anchoTotal - this.margen * 2);
		const sangria = espacios(this.margen);
		const lineas = [];
		if (this.titulo) {
			lineas.push("");
			lineas.push(sangria + this.estilo.titulo(this.titulo));
			lineas.push(sangria + this.estilo.borde("─".repeat(ancho)));
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
			const pintar =
				this.mensaje.tipo === "error" ? this.estilo.error : this.mensaje.tipo === "aviso" ? this.estilo.aviso : this.estilo.exito;
			for (const linea of wrapTextWithAnsi(this.mensaje.texto, ancho)) lineas.push(sangria + pintar(linea));
			lineas.push("");
		}
		if (this.pie) lineas.push(sangria + this.estilo.tenue(truncateToWidth(this.pie, ancho, "…")));
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

	handleMouse(evento) {
		const margenSuperior = this.inicioHijos ?? 0;
		let y = margenSuperior;
		for (let i = 0; i < this.hijos.length; i++) {
			const alto = this.alturas[i] ?? 0;
			if (evento.y >= y && evento.y < y + alto) {
				const hijo = this.hijos[i];
				const resultado = hijo.handleMouse?.({
					...evento,
					x: evento.x - this.margen,
					y: evento.y - y,
					width: Math.max(10, evento.width - this.margen * 2),
					height: alto,
				});
				if (resultado) {
					if (hijo.interactivo && evento.type === "press") this.enfocar(i);
					this.pedirRender();
					return { handled: true, capture: resultado.capture, render: true };
				}
				return undefined;
			}
			y += alto;
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
