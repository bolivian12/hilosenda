// Integracion con Pi: encontrar su programa, listar modelos y conversaciones, y arrancarlo.

import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Carpeta raiz del paquete hilosenda. */
export const RAIZ_HILOSENDA = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Archivo de la extension que agrega la interfaz de hilosenda dentro de Pi. */
export const EXTENSION_HILOSENDA = join(RAIZ_HILOSENDA, "extension", "hilosenda.ts");

/** Temas de colores de hilosenda para el chat. */
export const CARPETA_TEMAS = join(RAIZ_HILOSENDA, "temas");

/** Opciones de Pi para usar el tema elegido en las preferencias. */
export function argumentosTema(tema = "auto") {
	const usar = { auto: "hilosenda-claro/hilosenda-oscuro", oscuro: "hilosenda-oscuro", claro: "hilosenda-claro" }[tema];
	return ["--theme", CARPETA_TEMAS, ...(usar ? ["--use-theme", usar] : [])];
}

/** Ruta del programa de Pi instalado junto a hilosenda. */
export function rutaCliPi() {
	let carpeta = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
	while (!existsSync(join(carpeta, "package.json")) && dirname(carpeta) !== carpeta) carpeta = dirname(carpeta);
	const paquete = JSON.parse(readFileSync(join(carpeta, "package.json"), "utf8"));
	return { cli: join(carpeta, paquete.bin.pi), version: paquete.version };
}

/** Version de hilosenda. */
export function versionHilosenda() {
	return JSON.parse(readFileSync(join(RAIZ_HILOSENDA, "package.json"), "utf8")).version;
}

/**
 * @typedef {object} ModeloPi
 * @property {string} proveedor
 * @property {string} id
 * @property {string} contexto
 * @property {boolean} razona
 * @property {boolean} imagenes
 */

/** Convierte la tabla de `pi --list-models` en objetos. */
export function leerTablaModelos(texto) {
	const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
	const inicio = lineas.findIndex((l) => /^provider\s+model\s+/i.test(l.trim()));
	if (inicio < 0) return [];
	return lineas
		.slice(inicio + 1)
		.map((linea) => linea.trim().split(/\s{2,}/))
		.filter((c) => c.length >= 2)
		.map(([proveedor, id, contexto = "", , razona = "", imagenes = ""]) => ({
			proveedor,
			id,
			contexto,
			razona: razona === "yes",
			imagenes: imagenes === "yes",
		}));
}

/**
 * Modelos que Pi puede usar ahora mismo (con credenciales configuradas).
 * @returns {Promise<ModeloPi[]>}
 */
export function listarModelosPi() {
	const { cli } = rutaCliPi();
	return new Promise((resolver) => {
		execFile(process.execPath, [cli, "--list-models"], { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 60000 }, (_error, salida) => {
			resolver(leerTablaModelos(String(salida ?? "")));
		});
	});
}

/** Conversaciones guardadas por Pi, de la mas reciente a la mas antigua. */
export async function listarConversaciones() {
	const { SessionManager } = await import("@earendil-works/pi-coding-agent");
	try {
		return await SessionManager.listAll();
	} catch {
		return [];
	}
}

/**
 * @typedef {{ accion: "carpeta", ruta: string } | { accion: "inicio" } | { accion: "conversacion", ruta: string, carpeta: string }} Traspaso
 */

/**
 * Arranca Pi con la extension de hilosenda y espera a que termine.
 * @param {{ carpeta: string, argumentos?: string[], alIniciar?: string, tema?: string }} opciones
 * @returns {Promise<{ codigo: number, traspaso: Traspaso | undefined }>}
 */
export function abrirPi({ carpeta, argumentos = [], alIniciar, tema }) {
	const { cli } = rutaCliPi();
	const traspaso = join(tmpdir(), `hilosenda-${process.pid}-${Date.now()}.json`);
	const entorno = { ...process.env, HILOSENDA: "1", HILOSENDA_TRASPASO: traspaso };
	if (alIniciar) entorno.HILOSENDA_AL_INICIAR = alIniciar;
	else delete entorno.HILOSENDA_AL_INICIAR;

	return new Promise((resolver) => {
		// Pi maneja Ctrl+C por su cuenta; hilosenda no debe cerrarse por eso.
		const ignorar = () => {};
		process.on("SIGINT", ignorar);
		const hijo = spawn(process.execPath, [cli, "-e", EXTENSION_HILOSENDA, ...argumentosTema(tema), ...argumentos], {
			cwd: carpeta,
			env: entorno,
			stdio: "inherit",
		});
		const terminar = (codigo) => {
			process.off("SIGINT", ignorar);
			let datos;
			try {
				if (existsSync(traspaso)) datos = JSON.parse(readFileSync(traspaso, "utf8"));
			} catch {
				datos = undefined;
			}
			rmSync(traspaso, { force: true });
			resolver({ codigo: codigo ?? 0, traspaso: datos });
		};
		hijo.on("exit", terminar);
		hijo.on("error", () => terminar(1));
	});
}
