// Deteccion automatica de modelos.
//
// Dada una URL (y una clave si hace falta), averigua que protocolo habla el
// servicio y que modelos ofrece. Funciona con servicios compatibles con OpenAI
// (Ollama, LM Studio, OpenRouter, Groq...), con Anthropic y con Google Gemini.

import { PROVEEDORES } from "./proveedores.js";

/**
 * @typedef {object} ModeloDetectado
 * @property {string} id
 * @property {string} [nombre]
 * @property {number} [contexto] Tamano de contexto en tokens.
 * @property {boolean} [vision] Acepta imagenes.
 * @property {boolean} [razonamiento] Admite niveles de razonamiento.
 *
 * @typedef {object} Deteccion
 * @property {"openai-completions" | "anthropic-messages" | "google-generative-ai"} api
 * @property {string} baseUrl URL base lista para models.json.
 * @property {ModeloDetectado[]} modelos
 */

export class ErrorDeteccion extends Error {
	/** @param {string} mensaje @param {"red" | "clave" | "formato"} tipo */
	constructor(mensaje, tipo) {
		super(mensaje);
		this.tipo = tipo;
	}
}

const sinBarraFinal = (url) => url.replace(/\/+$/, "");

/** Acepta "localhost:11434", "http://x/v1/", etc. y devuelve una URL limpia. */
export function normalizarUrl(url) {
	let limpia = url.trim();
	if (!/^https?:\/\//i.test(limpia)) {
		limpia = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(limpia) ? `http://${limpia}` : `https://${limpia}`;
	}
	return sinBarraFinal(limpia);
}

async function pedir(url, { headers = {}, tiempo = 8000 } = {}) {
	let respuesta;
	try {
		respuesta = await fetch(url, { headers, signal: AbortSignal.timeout(tiempo) });
	} catch (error) {
		const causa = error?.cause?.code ?? error?.name ?? "";
		throw new ErrorDeteccion(
			causa === "TimeoutError" ? `No respondio a tiempo: ${url}` : `No se pudo conectar con ${url}`,
			"red",
		);
	}
	if (respuesta.status === 401 || respuesta.status === 403) {
		throw new ErrorDeteccion("La clave API no es valida o no tiene permiso.", "clave");
	}
	if (!respuesta.ok) throw new ErrorDeteccion(`El servicio respondio con error ${respuesta.status}.`, "formato");
	try {
		return await respuesta.json();
	} catch {
		throw new ErrorDeteccion("La respuesta no tiene el formato esperado.", "formato");
	}
}

const pareceEmbedding = (id) => /embed|rerank|whisper|tts|dall-e|moderation|text-embedding|bge-|nomic-embed/i.test(id);

/** Convierte la lista de modelos de un servicio estilo OpenAI. */
export function leerListaOpenAI(datos) {
	const lista = Array.isArray(datos) ? datos : Array.isArray(datos?.data) ? datos.data : Array.isArray(datos?.models) ? datos.models : undefined;
	if (!lista) throw new ErrorDeteccion("La respuesta no tiene una lista de modelos.", "formato");
	return lista
		.map((m) => {
			const id = typeof m === "string" ? m : (m.id ?? m.name ?? m.model);
			if (!id) return undefined;
			const entradas = m.architecture?.input_modalities ?? m.input_modalities;
			/** @type {ModeloDetectado} */
			const modelo = { id: String(id) };
			if (m.name && m.name !== id) modelo.nombre = m.name;
			const contexto = m.context_length ?? m.max_context_length ?? m.context_window ?? m.top_provider?.context_length;
			if (typeof contexto === "number" && contexto > 0) modelo.contexto = contexto;
			if (Array.isArray(entradas)) modelo.vision = entradas.includes("image");
			if (Array.isArray(m.supported_parameters)) modelo.razonamiento = m.supported_parameters.includes("reasoning");
			if (m.type === "vlm") modelo.vision = true;
			return modelo;
		})
		.filter((m) => m && !pareceEmbedding(m.id) && m.type !== "embeddings")
		.sort((a, b) => a.id.localeCompare(b.id));
}

async function detectarOpenAI(base, clave) {
	const headers = clave ? { Authorization: `Bearer ${clave}` } : {};
	const candidatas = /\/v\d+[a-z]*$/i.test(base) ? [base] : [base, `${base}/v1`];
	let ultimoError;
	for (const candidata of candidatas) {
		try {
			const datos = await pedir(`${candidata}/models`, { headers });
			return { api: "openai-completions", baseUrl: candidata, modelos: leerListaOpenAI(datos) };
		} catch (error) {
			ultimoError = error;
			if (error.tipo === "clave") throw error;
		}
	}
	throw ultimoError;
}

async function detectarOllamaNativo(base) {
	const raiz = base.replace(/\/v1$/i, "");
	const datos = await pedir(`${raiz}/api/tags`, { tiempo: 3000 });
	if (!Array.isArray(datos?.models)) throw new ErrorDeteccion("No es Ollama.", "formato");
	const modelos = datos.models
		.map((m) => ({ id: m.model ?? m.name }))
		.filter((m) => m.id && !pareceEmbedding(m.id))
		.sort((a, b) => a.id.localeCompare(b.id));
	return { api: "openai-completions", baseUrl: `${raiz}/v1`, modelos };
}

async function detectarAnthropic(base, clave) {
	const raiz = base.replace(/\/v1$/i, "");
	const datos = await pedir(`${raiz}/v1/models?limit=1000`, {
		headers: { "x-api-key": clave ?? "", "anthropic-version": "2023-06-01" },
	});
	if (!Array.isArray(datos?.data)) throw new ErrorDeteccion("No es un servicio de Anthropic.", "formato");
	const modelos = datos.data.map((m) => ({ id: m.id, nombre: m.display_name, vision: true }));
	return { api: "anthropic-messages", baseUrl: raiz, modelos };
}

async function detectarGoogle(base, clave) {
	const raiz = base.replace(/\/v1(beta)?$/i, "");
	const datos = await pedir(`${raiz}/v1beta/models?pageSize=1000&key=${encodeURIComponent(clave ?? "")}`);
	if (!Array.isArray(datos?.models)) throw new ErrorDeteccion("No es un servicio de Google.", "formato");
	const modelos = datos.models
		.filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
		.map((m) => ({
			id: String(m.name).replace(/^models\//, ""),
			nombre: m.displayName,
			contexto: m.inputTokenLimit,
			razonamiento: Boolean(m.thinking),
			vision: true,
		}))
		.filter((m) => !pareceEmbedding(m.id));
	return { api: "google-generative-ai", baseUrl: `${raiz}/v1beta`, modelos };
}

/**
 * Detecta protocolo y modelos de un servicio.
 * @param {{ url: string, clave?: string, protocolo?: "openai" | "anthropic" | "google" }} opciones
 * @returns {Promise<Deteccion>}
 */
export async function detectarModelos({ url, clave, protocolo }) {
	const base = normalizarUrl(url);
	const pista = protocolo ?? (/anthropic/i.test(base) ? "anthropic" : /googleapis|generativelanguage/i.test(base) ? "google" : undefined);
	if (pista === "anthropic") return detectarAnthropic(base, clave);
	if (pista === "google") return detectarGoogle(base, clave);

	try {
		return await detectarOpenAI(base, clave);
	} catch (errorOpenAI) {
		if (errorOpenAI.tipo === "clave") throw errorOpenAI;
		// Intentar otros protocolos antes de rendirse.
		for (const intento of [() => detectarOllamaNativo(base), () => detectarAnthropic(base, clave), () => detectarGoogle(base, clave)]) {
			try {
				return await intento();
			} catch {
				// Seguir con el siguiente protocolo.
			}
		}
		throw errorOpenAI;
	}
}

/**
 * Busca programas de IA locales que esten funcionando ahora mismo.
 * @returns {Promise<Array<{ proveedor: import("./proveedores.js").Proveedor, deteccion: Deteccion }>>}
 */
export async function buscarServidoresLocales() {
	const locales = PROVEEDORES.filter((p) => p.clase === "local" && p.url);
	const resultados = await Promise.all(
		locales.map(async (proveedor) => {
			try {
				const deteccion =
					proveedor.id === "ollama"
						? await detectarOllamaNativo(proveedor.url)
						: await detectarOpenAIRapido(proveedor.url);
				return deteccion.modelos.length > 0 ? { proveedor, deteccion } : undefined;
			} catch {
				return undefined;
			}
		}),
	);
	return resultados.filter(Boolean);
}

async function detectarOpenAIRapido(base) {
	const datos = await pedir(`${base}/models`, { tiempo: 1500 });
	return { api: "openai-completions", baseUrl: base, modelos: leerListaOpenAI(datos) };
}

/** Convierte modelos detectados al formato de models.json de Pi. */
export function aModelosPi(modelos) {
	return modelos.map((m) => {
		const salida = { id: m.id };
		if (m.nombre) salida.name = m.nombre;
		if (m.contexto) salida.contextWindow = m.contexto;
		if (m.vision) salida.input = ["text", "image"];
		if (m.razonamiento) salida.reasoning = true;
		return salida;
	});
}

/** Texto corto para mostrar junto a un modelo: "128K · imagenes · razona". */
export function describirModelo(m) {
	const partes = [];
	if (m.contexto) partes.push(`${m.contexto >= 1e6 ? `${(m.contexto / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(m.contexto / 1000)}K`} de contexto`);
	if (m.vision) partes.push("ve imagenes");
	if (m.razonamiento) partes.push("razona");
	if (m.nombre && m.nombre !== m.id) partes.unshift(m.nombre);
	return partes.join(" · ");
}
