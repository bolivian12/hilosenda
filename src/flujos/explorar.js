// Elegir carpetas y archivos de instrucciones.
//
// Primero intenta la ventana del sistema. Si no hay (por ejemplo por SSH) o la
// persona prefiere no usarla, muestra un explorador dentro de la consola.

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { elegirConVentana, selectorGraficoDisponible } from "../core/selector-sistema.js";

const EXTENSIONES_INSTRUCCIONES = new Set([".md", ".markdown", ".txt"]);

export const esArchivoInstrucciones = (ruta) => EXTENSIONES_INSTRUCCIONES.has(extname(ruta).toLowerCase());
const EXTENSIONES_IMAGEN = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
export const esImagen = (ruta) => EXTENSIONES_IMAGEN.has(extname(ruta).toLowerCase());

const tamano = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function unidadesWindows() {
	if (process.platform !== "win32") return [];
	return "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `${l}:\\`).filter((u) => existsSync(u));
}

function leerCarpeta(ruta) {
	try {
		return readdirSync(ruta, { withFileTypes: true })
			.filter((e) => !e.name.startsWith(".") && !e.name.startsWith("$"))
			.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
	} catch {
		return undefined;
	}
}

/**
 * Explorador de carpetas dentro de la consola.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @param {"carpeta" | "instrucciones"} tipo
 * @param {string} [inicio]
 * @param {string} [aviso] Por que no se abrio la ventana del sistema.
 */
export async function explorar(ui, tipo, inicio, aviso) {
	let actual = inicio && existsSync(inicio) ? resolve(inicio) : homedir();
	while (true) {
		const entradas = leerCarpeta(actual);
		const elementos = [];
		if (tipo === "carpeta") {
			elementos.push({ id: "usar", etiqueta: "✔ Usar esta carpeta", detalle: actual, grupo: "Acciones", valor: { accion: "usar" } });
		}
		const padre = dirname(actual);
		if (padre !== actual) elementos.push({ id: "subir", etiqueta: "⬆ Subir un nivel", detalle: padre, grupo: "Acciones", valor: { accion: "ir", ruta: padre } });
		elementos.push({ id: "casa", etiqueta: "⌂ Mi carpeta personal", detalle: homedir(), grupo: "Acciones", valor: { accion: "ir", ruta: homedir() } });
		for (const unidad of unidadesWindows()) {
			if (parse(actual).root.toUpperCase() !== unidad.toUpperCase()) {
				elementos.push({ id: `unidad-${unidad}`, etiqueta: `▣ Unidad ${unidad}`, grupo: "Acciones", valor: { accion: "ir", ruta: unidad } });
			}
		}
		if (!entradas) {
			elementos.push({ id: "sin-permiso", etiqueta: "(no se puede leer esta carpeta)", grupo: "Contenido", valor: { accion: "nada" } });
		} else {
			for (const entrada of entradas) {
				const ruta = join(actual, entrada.name);
				let esCarpeta = entrada.isDirectory();
				if (entrada.isSymbolicLink()) {
					try {
						esCarpeta = statSync(ruta).isDirectory();
					} catch {
						continue;
					}
				}
				if (esCarpeta) {
					elementos.push({ id: `d:${entrada.name}`, etiqueta: `▸ ${entrada.name}/`, grupo: "Carpetas", valor: { accion: "ir", ruta } });
				} else if ((tipo === "instrucciones" && esArchivoInstrucciones(entrada.name)) || tipo === "imagen") {
					let detalle = "";
					try {
						detalle = tamano(statSync(ruta).size);
					} catch {
						// Sin tamano.
					}
					elementos.push({ id: `f:${entrada.name}`, etiqueta: `≡ ${entrada.name}`, detalle, grupo: "Archivos de instrucciones", valor: { accion: "archivo", ruta } });
				}
			}
		}

		const extras = [{ id: "escribir", etiqueta: "Escribir una ruta" }];
		if (tipo === "carpeta") extras.unshift({ id: "nueva", etiqueta: "+ Nueva carpeta aqui" });
		const eleccion = await ui.elegir({
			titulo: tipo === "carpeta" ? "Elige la carpeta de tu proyecto" : tipo === "imagen" ? "Elige una imagen" : "Elige el archivo de instrucciones (.md o .txt)",
			explicacion: `${aviso ? `No se pudo abrir la ventana del sistema (${aviso}). Puedes elegir aqui mismo.\n` : ""}Estas en: ${actual}\n${tipo === "carpeta" ? "Haz clic en una carpeta para entrar y luego en «Usar esta carpeta»." : "Haz clic en una carpeta para entrar y luego en el archivo."}`,
			elementos,
			buscador: true,
			extras,
		});
		if (eleccion === undefined) return undefined;
		if (eleccion.boton === "nueva") {
			const nombre = await ui.preguntar({ titulo: "Nueva carpeta", etiqueta: "Nombre de la carpeta:", validar: (v) => (v && !/[\\/:*?"<>|]/.test(v) ? undefined : "Escribe un nombre sin \\ / : * ? \" < > |") });
			if (nombre) {
				try {
					mkdirSync(join(actual, nombre), { recursive: true });
					actual = join(actual, nombre);
				} catch (error) {
					await ui.informar({ titulo: "No se pudo crear la carpeta", texto: String(error?.message ?? error) });
				}
			}
			continue;
		}
		if (eleccion.boton === "escribir") {
			const ruta = await ui.preguntar({ titulo: "Escribir una ruta", etiqueta: "Ruta:", valor: actual });
			if (!ruta) continue;
			const completa = resolve(actual, ruta.replace(/^~(?=$|[\\/])/, homedir()));
			if (!existsSync(completa)) {
				await ui.informar({ titulo: "No existe", texto: `No se encontro: ${completa}` });
				continue;
			}
			if (statSync(completa).isDirectory()) actual = completa;
			else if (tipo !== "carpeta") return completa;
			continue;
		}
		if (eleccion.accion === "usar") return actual;
		if (eleccion.accion === "ir") actual = eleccion.ruta;
		if (eleccion.accion === "archivo") return eleccion.ruta;
	}
}

/**
 * Elige una carpeta: ventana del sistema si se puede, si no el explorador en consola.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @param {{ inicio?: string, ventana?: boolean }} [opciones]
 */
export async function elegirCarpeta(ui, opciones = {}) {
	let aviso;
	if (opciones.ventana !== false && selectorGraficoDisponible()) {
		const r = await ui.esperar("Abriendo la ventana para elegir la carpeta… (si no la ves, mira detras de esta ventana)", elegirConVentana("carpeta", { inicio: opciones.inicio }));
		if (r.estado === "ok") return r.ruta;
		if (r.estado === "cancelado") return undefined;
		aviso = r.motivo;
	}
	return explorar(ui, "carpeta", opciones.inicio, aviso);
}

/**
 * Elige un archivo de instrucciones .md o .txt.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @param {{ inicio?: string, ventana?: boolean }} [opciones]
 */
export async function elegirInstrucciones(ui, opciones = {}) {
	let aviso;
	if (opciones.ventana !== false && selectorGraficoDisponible()) {
		const r = await ui.esperar("Abriendo la ventana para elegir el archivo… (si no la ves, mira detras de esta ventana)", elegirConVentana("instrucciones", { inicio: opciones.inicio }));
		if (r.estado === "ok") return r.ruta;
		if (r.estado === "cancelado") return undefined;
		aviso = r.motivo;
	}
	return explorar(ui, "instrucciones", opciones.inicio, aviso);
}

/**
 * Elige una imagen (.png, .jpg, .gif, .webp).
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @param {{ inicio?: string, ventana?: boolean }} [opciones]
 */
export async function elegirImagen(ui, opciones = {}) {
	let aviso;
	if (opciones.ventana !== false && selectorGraficoDisponible()) {
		const r = await ui.esperar("Abriendo la ventana para elegir la imagen… (si no la ves, mira detras de esta ventana)", elegirConVentana("imagen", { inicio: opciones.inicio }));
		if (r.estado === "ok") return r.ruta;
		if (r.estado === "cancelado") return undefined;
		aviso = r.motivo;
	}
	return explorar(ui, "imagen", opciones.inicio, aviso);
}

export const nombreCorto = (ruta) => basename(ruta) || ruta;
