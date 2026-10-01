// Dialogos comunes (elegir, preguntar, confirmar, esperar) construidos con los widgets.
//
// La misma logica funciona en la pantalla de inicio y dentro de Pi: cada entorno solo
// aporta una funcion `mostrar` que pone una Pantalla en la consola y devuelve una
// promesa con el valor con el que se cerro.

import { Campo, FilaBotones, Lista, Pantalla, Parrafo, Tarjeta } from "./widgets.js";

/**
 * @typedef {(construir: (cerrar: (valor: any) => void) => Pantalla) => Promise<any>} Mostrar
 *
 * @typedef {object} Dialogos
 * @property {import("./style.js").Estilo} estilo
 * @property {(o: { titulo: string, explicacion?: string, elementos: import("./widgets.js").Elemento[], buscador?: boolean, alto?: number, vacio?: string, inicial?: string, extras?: import("./widgets.js").Boton[] }) => Promise<any>} elegir
 * @property {(o: { titulo: string, explicacion?: string, etiqueta: string, placeholder?: string, oculto?: boolean, valor?: string, validar?: (v: string) => string | undefined }) => Promise<string | undefined>} preguntar
 * @property {(o: { titulo: string, explicacion?: string, si?: string, no?: string, peligro?: boolean }) => Promise<boolean>} confirmar
 * @property {(o: { titulo: string, explicacion?: string, botones: import("./widgets.js").Boton[], grande?: boolean }) => Promise<string | undefined>} botones
 * @property {<T>(mensaje: string, trabajo: Promise<T>) => Promise<T>} esperar
 * @property {(o: { titulo: string, texto: string, boton?: string }) => Promise<void>} informar
 */

/**
 * @param {import("./style.js").Estilo} estilo
 * @param {Mostrar} mostrar
 * @param {{ altoLista?: () => number, altoPantalla?: () => number }} [opciones]
 *   `altoLista`: cuantas filas muestran las listas. `altoPantalla`: si se indica, cada dialogo
 *   ocupa toda la consola con su barra de estado abajo.
 * @returns {Dialogos}
 */
export function crearDialogos(estilo, mostrar, opciones = {}) {
	const altoPantalla = opciones.altoPantalla;
	const altoLista = opciones.altoLista ?? (() => Math.max(5, Math.min(16, (process.stdout.rows || 24) - 14)));
	const VOLVER = { id: "__volver", etiqueta: "← Volver", tipo: "suave" };

	return {
		estilo,

		elegir({ titulo, explicacion, elementos, buscador, alto, vacio, inicial, extras = [] }) {
			return mostrar((cerrar) => {
				const pantalla = new Pantalla(estilo, {
					titulo,
					alto: altoPantalla,
					alSalir: () => cerrar(undefined),
					pie: "Clic para elegir · rueda o flechas para moverte · escribe para buscar · Esc para volver",
				});
				if (explicacion) pantalla.agregar(new Parrafo(estilo.suave(explicacion)));
				pantalla.agregar(new Parrafo(""));
				const lista = new Lista(estilo, elementos, {
					alto: alto ?? altoLista(),
					buscador,
					vacio,
					inicial,
					alElegir: (e) => cerrar(e.valor ?? e.id),
				});
				pantalla.agregar(lista);
				pantalla.agregar(new Parrafo(""));
				pantalla.agregar(
					new FilaBotones(estilo, [...extras, VOLVER], {
						alPulsar: (id) => cerrar(id === VOLVER.id ? undefined : { boton: id }),
					}),
				);
				return pantalla;
			});
		},

		preguntar({ titulo, explicacion, etiqueta, placeholder, oculto, valor, validar }) {
			return mostrar((cerrar) => {
				const pantalla = new Pantalla(estilo, {
					titulo,
					alto: altoPantalla,
					alSalir: () => cerrar(undefined),
					pie: "Escribe o pega (clic derecho o Ctrl+V) y pulsa Enter · Esc para volver",
				});
				if (explicacion) pantalla.agregar(new Parrafo(estilo.suave(explicacion)));
				pantalla.agregar(new Parrafo(""));
				const enviar = (texto) => {
					const limpio = texto.trim();
					const problema = validar?.(limpio);
					if (problema) {
						pantalla.avisar(problema, "error");
						return;
					}
					cerrar(limpio);
				};
				const campo = pantalla.agregar(new Campo(estilo, { etiqueta, placeholder, oculto, valor, alEnviar: enviar }));
				pantalla.agregar(new Parrafo(""));
				pantalla.agregar(
					new FilaBotones(
						estilo,
						[
							{ id: "aceptar", etiqueta: "Aceptar", tipo: "primario" },
							{ id: "volver", etiqueta: "← Volver", tipo: "suave" },
						],
						{ alPulsar: (id) => (id === "aceptar" ? enviar(campo.valor) : cerrar(undefined)) },
					),
				);
				return pantalla;
			});
		},

		confirmar({ titulo, explicacion, si = "Si", no = "No", peligro = false }) {
			return mostrar((cerrar) => {
				const pantalla = new Pantalla(estilo, { titulo, alto: altoPantalla, alSalir: () => cerrar(false) });
				if (explicacion) pantalla.agregar(new Parrafo(explicacion));
				pantalla.agregar(new Parrafo(""));
				pantalla.agregar(
					new FilaBotones(
						estilo,
						[
							{ id: "si", etiqueta: si, tipo: peligro ? "peligro" : "primario" },
							{ id: "no", etiqueta: no, tipo: "normal" },
						],
						{ grande: true, alPulsar: (id) => cerrar(id === "si") },
					),
				);
				return pantalla;
			}).then(Boolean);
		},

		botones({ titulo, explicacion, botones, grande = true }) {
			return mostrar((cerrar) => {
				const pantalla = new Pantalla(estilo, { titulo, alto: altoPantalla, alSalir: () => cerrar(undefined) });
				if (explicacion) pantalla.agregar(new Parrafo(explicacion));
				pantalla.agregar(new Parrafo(""));
				pantalla.agregar(new FilaBotones(estilo, botones, { grande, mostrarAyuda: true, alPulsar: (id) => cerrar(id) }));
				return pantalla;
			});
		},

		esperar(mensaje, trabajo) {
			let resultado;
			let fallo;
			const terminado = trabajo.then(
				(valor) => {
					resultado = valor;
				},
				(error) => {
					fallo = error;
				},
			);
			return mostrar((cerrar) => {
				const pantalla = new Pantalla(estilo, { pie: "" });
				const marcos = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
				let paso = 0;
				pantalla.agregar(new Parrafo(""));
				pantalla.agregar(new Tarjeta(estilo, () => [[{ t: marcos[paso % marcos.length], fg: estilo.c.acento, negrita: true }, { t: `  ${mensaje}`, fg: estilo.c.texto }]]));
				const reloj = setInterval(() => {
					paso++;
					pantalla.pedirRender();
				}, 90);
				terminado.finally(() => {
					clearInterval(reloj);
					cerrar(undefined);
				});
				return pantalla;
			}).then(() => {
				if (fallo) throw fallo;
				return resultado;
			});
		},

		informar({ titulo, texto, boton = "Entendido" }) {
			return mostrar((cerrar) => {
				const pantalla = new Pantalla(estilo, { titulo, alto: altoPantalla, alSalir: () => cerrar(undefined) });
				pantalla.agregar(new Parrafo(texto));
				pantalla.agregar(new Parrafo(""));
				pantalla.agregar(new FilaBotones(estilo, [{ id: "ok", etiqueta: boton, tipo: "primario" }], { alPulsar: () => cerrar(undefined) }));
				return pantalla;
			});
		},
	};
}
