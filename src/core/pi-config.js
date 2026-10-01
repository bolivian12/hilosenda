// Lectura y escritura de la configuracion de Pi: modelos, claves y ajustes.
//
// hilosenda usa la misma carpeta que Pi (~/.pi/agent), asi lo que configures aqui
// tambien funciona si un dia usas `pi` directamente, y viceversa.

import { escribirJson, leerJson } from "./archivos.js";
import { archivoAjustesPi, archivoClaves, archivoModelos } from "./rutas.js";

// --- models.json ------------------------------------------------------------

export function leerModelosJson() {
	const datos = leerJson(archivoModelos(), { providers: {} });
	if (!datos.providers || typeof datos.providers !== "object") datos.providers = {};
	return datos;
}

/**
 * Agrega o reemplaza un proveedor en models.json.
 * @param {string} id Nombre interno, por ejemplo "ollama".
 * @param {object} configuracion Bloque de proveedor con `baseUrl`, `api`, `apiKey` y `models`.
 */
export function guardarProveedor(id, configuracion) {
	const datos = leerModelosJson();
	datos.providers[id] = configuracion;
	escribirJson(archivoModelos(), datos, { privado: Boolean(configuracion.apiKey) });
}

/** Agrega modelos a un proveedor existente sin tocar el resto de su configuracion. */
export function agregarModelosAProveedor(id, modelos) {
	const datos = leerModelosJson();
	const proveedor = datos.providers[id] ?? {};
	const existentes = new Map((proveedor.models ?? []).map((m) => [m.id, m]));
	for (const modelo of modelos) existentes.set(modelo.id, { ...existentes.get(modelo.id), ...modelo });
	proveedor.models = [...existentes.values()];
	datos.providers[id] = proveedor;
	escribirJson(archivoModelos(), datos, { privado: Boolean(proveedor.apiKey) });
}

export function quitarProveedor(id) {
	const datos = leerModelosJson();
	delete datos.providers[id];
	escribirJson(archivoModelos(), datos, { privado: true });
}

// --- auth.json ---------------------------------------------------------------

export function leerClaves() {
	return leerJson(archivoClaves(), {});
}

/** Guarda una clave API para un proveedor que Pi ya conoce (openai, anthropic, google, ...). */
export function guardarClave(proveedor, clave) {
	const claves = leerClaves();
	claves[proveedor] = { type: "api_key", key: clave };
	escribirJson(archivoClaves(), claves, { privado: true });
}

export function quitarClave(proveedor) {
	const claves = leerClaves();
	delete claves[proveedor];
	escribirJson(archivoClaves(), claves, { privado: true });
}

// --- settings.json -----------------------------------------------------------

export function leerAjustesPi() {
	return leerJson(archivoAjustesPi(), {});
}

/** Combina cambios con los ajustes actuales de Pi. Un valor `undefined` borra la clave. */
export function guardarAjustesPi(cambios) {
	const ajustes = { ...leerAjustesPi(), ...cambios };
	for (const [clave, valor] of Object.entries(ajustes)) if (valor === undefined) delete ajustes[clave];
	escribirJson(archivoAjustesPi(), ajustes);
	return ajustes;
}

/** Modelo con el que Pi arranca, si hay uno guardado. */
export function modeloPorDefecto() {
	const { defaultProvider, defaultModel, defaultThinkingLevel } = leerAjustesPi();
	return defaultProvider && defaultModel
		? { proveedor: defaultProvider, modelo: defaultModel, razonamiento: defaultThinkingLevel }
		: undefined;
}
