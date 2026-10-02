// Ubicaciones de archivos de hilosenda y de Pi.

import { homedir } from "node:os";
import { join, resolve } from "node:path";

const expandir = (ruta) => (ruta === "~" ? homedir() : ruta.startsWith("~/") ? join(homedir(), ruta.slice(2)) : ruta);

/** Carpeta propia de hilosenda: preferencias, carpetas recientes, etc. */
export function carpetaHilosenda() {
	return resolve(expandir(process.env.HILOSENDA_HOME || join(homedir(), ".hilosenda")));
}

/** Carpeta de configuracion de Pi (models.json, auth.json, settings.json, sesiones). */
export function carpetaPi() {
	return resolve(expandir(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")));
}

export const archivoPreferencias = () => join(carpetaHilosenda(), "preferencias.json");
export const archivoModelos = () => join(carpetaPi(), "models.json");
export const archivoClaves = () => join(carpetaPi(), "auth.json");
export const archivoAjustesPi = () => join(carpetaPi(), "settings.json");
