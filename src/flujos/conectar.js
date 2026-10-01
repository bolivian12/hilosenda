// Asistente "Conectar una IA": guia paso a paso para agregar cualquier modelo.
//
// 1. Busca IA ya instalada en la computadora (Ollama, LM Studio...).
// 2. Muestra los servicios disponibles agrupados (en tu PC, en la nube, con tu cuenta).
// 3. Pide solo lo necesario (una clave API o una URL), detecta los modelos
//    automaticamente y los guarda en la configuracion de Pi.
// 4. Devuelve el modelo elegido para empezar a usarlo.

import { aModelosPi, buscarServidoresLocales, describirModelo, detectarModelos, normalizarUrl } from "../core/deteccion.js";
import { agregarModelosAProveedor, guardarClave, guardarProveedor, leerModelosJson } from "../core/pi-config.js";
import { NOMBRES_CLASE, PROVEEDORES, proveedorPorId } from "../core/proveedores.js";

/**
 * @typedef {{ proveedor: string, modelo: string } | { accion: "login" } | undefined} ResultadoConexion
 *
 * @typedef {object} OpcionesConexion
 * @property {() => Promise<import("../core/pi.js").ModeloPi[]>} catalogoPi Modelos que Pi ya conoce.
 * @property {boolean} [buscarLocales] Buscar servidores locales antes de mostrar la lista.
 */

/** Convierte un texto en un identificador valido: "Mi Servidor!" → "mi-servidor". */
export function aIdentificador(texto) {
	const id = texto
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return id || "personalizado";
}

/** Texto con los datos de un modelo de Pi: "200K · razona · ve imagenes". */
function detallePi(m) {
	return [m.contexto && `${m.contexto} de contexto`, m.razona && "razona", m.imagenes && "ve imagenes"].filter(Boolean).join(" · ");
}

/**
 * Pide al usuario que elija uno de los modelos recien conectados.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 */
async function elegirModelo(ui, nombreProveedor, elementos) {
	if (elementos.length === 0) return undefined;
	if (elementos.length === 1) return elementos[0].valor;
	return ui.elegir({
		titulo: `¿Que modelo de ${nombreProveedor} quieres usar?`,
		explicacion: "Todos quedan guardados; podras cambiar de modelo cuando quieras con el boton «Modelo».",
		elementos,
		buscador: elementos.length > 8,
	});
}

/**
 * Detecta modelos mostrando una pantalla de espera y explicando los errores con claridad.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @returns {Promise<import("../core/deteccion.js").Deteccion | "reintentar" | undefined>}
 */
async function detectarConAyuda(ui, opciones, nombre, ayudaInstalacion) {
	try {
		const deteccion = await ui.esperar(`Conectando con ${nombre} y buscando modelos…`, detectarModelos(opciones));
		if (deteccion.modelos.length === 0) {
			await ui.informar({
				titulo: `${nombre} no tiene modelos`,
				texto: `${nombre} respondio, pero no tiene ningun modelo de chat disponible.${ayudaInstalacion ? `\n\n${ayudaInstalacion}` : ""}`,
			});
			return undefined;
		}
		return deteccion;
	} catch (error) {
		const motivo = error instanceof Error ? error.message : String(error);
		const extra = error?.tipo === "red" && ayudaInstalacion ? `\n\n${ayudaInstalacion}` : "";
		const eleccion = await ui.botones({
			titulo: "No se pudo conectar",
			explicacion: `${motivo}${extra}`,
			botones: [
				{ id: "reintentar", etiqueta: "Intentar de nuevo", tipo: "primario" },
				{ id: "volver", etiqueta: "← Volver", tipo: "suave" },
			],
			grande: false,
		});
		return eleccion === "reintentar" ? "reintentar" : undefined;
	}
}

/** Conecta un programa local (Ollama, LM Studio...). */
async function conectarLocal(ui, proveedor) {
	let url = proveedor.url;
	const ayuda = `Si todavia no tienes ${proveedor.nombre}, descargalo de ${proveedor.web}, abrelo y vuelve a intentar.`;
	while (true) {
		const deteccion = await detectarConAyuda(ui, { url, protocolo: "openai" }, proveedor.nombre, ayuda);
		if (deteccion === "reintentar") {
			const otra = await ui.botones({
				titulo: `¿${proveedor.nombre} usa otra direccion?`,
				explicacion: `Se intento con ${url}. Si cambiaste el puerto o esta en otra computadora, escribe la direccion.`,
				botones: [
					{ id: "igual", etiqueta: "Reintentar con la misma", tipo: "primario" },
					{ id: "otra", etiqueta: "Escribir otra direccion" },
					{ id: "volver", etiqueta: "← Volver", tipo: "suave" },
				],
				grande: false,
			});
			if (otra === "otra") {
				const nueva = await ui.preguntar({ titulo: "Direccion del servidor", etiqueta: "URL:", valor: url });
				if (nueva) url = normalizarUrl(nueva);
			} else if (otra !== "igual") return undefined;
			continue;
		}
		if (!deteccion) return undefined;
		guardarProveedor(proveedor.id, {
			name: proveedor.nombre,
			baseUrl: deteccion.baseUrl,
			api: deteccion.api,
			apiKey: proveedor.id,
			models: aModelosPi(deteccion.modelos),
		});
		const elegido = await elegirModelo(
			ui,
			proveedor.nombre,
			deteccion.modelos.map((m) => ({ id: m.id, etiqueta: m.id, detalle: describirModelo(m), valor: { proveedor: proveedor.id, modelo: m.id } })),
		);
		return elegido;
	}
}

/** Conecta un servicio en la nube que Pi ya conoce, con una clave API. */
async function conectarNube(ui, proveedor, catalogoPi) {
	while (true) {
		const clave = await ui.preguntar({
			titulo: `Conectar ${proveedor.nombre}`,
			explicacion: `1. Entra a ${proveedor.web}\n2. Crea una clave API y copiala.\n3. Pegala aqui abajo (se guarda solo en tu computadora).`,
			etiqueta: "Clave API:",
			placeholder: "pega aqui tu clave",
			oculto: true,
			validar: (v) => (v ? undefined : "Pega la clave para continuar."),
		});
		if (!clave) return undefined;
		const deteccion = await detectarConAyuda(ui, { url: proveedor.url, clave, protocolo: proveedor.protocolo }, proveedor.nombre);
		if (deteccion === "reintentar") continue;
		if (!deteccion) return undefined;

		guardarClave(proveedor.id, clave);
		const conocidos = (await catalogoPi().catch(() => [])).filter((m) => m.proveedor === proveedor.id);
		const idsConocidos = new Set(conocidos.map((m) => m.id));
		const nuevos = deteccion.modelos.filter((m) => !idsConocidos.has(m.id));
		if (nuevos.length > 0) {
			// Modelos que el servicio ofrece pero el catalogo de Pi aun no trae.
			agregarModelosAProveedor(
				proveedor.id,
				aModelosPi(nuevos).map((m) => ({ ...m, api: deteccion.api, baseUrl: deteccion.baseUrl })),
			);
		}
		const disponibles = new Set(deteccion.modelos.map((m) => m.id));
		const elementos = [
			...conocidos
				.filter((m) => disponibles.size === 0 || disponibles.has(m.id))
				.map((m) => ({ id: m.id, etiqueta: m.id, detalle: detallePi(m), grupo: "Recomendados (Pi los conoce bien)", valor: { proveedor: proveedor.id, modelo: m.id } })),
			...nuevos.map((m) => ({ id: m.id, etiqueta: m.id, detalle: describirModelo(m), grupo: "Otros modelos de tu cuenta", valor: { proveedor: proveedor.id, modelo: m.id } })),
		];
		return elegirModelo(ui, proveedor.nombre, elementos);
	}
}

/** Conecta cualquier servicio escribiendo su direccion. */
async function conectarPersonalizado(ui, urlInicial) {
	const url = urlInicial ?? (await ui.preguntar({
		titulo: "Conectar otro servicio",
		explicacion:
			"Escribe la direccion del servicio. Sirve cualquiera compatible con OpenAI, Anthropic o Google.\nEjemplos: localhost:11434   ·   https://api.ejemplo.com/v1",
		etiqueta: "Direccion (URL):",
		placeholder: "https://…",
		validar: (v) => (v ? undefined : "Escribe una direccion."),
	}));
	if (!url) return undefined;
	const clave = await ui.preguntar({
		titulo: "Clave API (opcional)",
		explicacion: "Si el servicio pide una clave, pegala aqui. Si no, deja el campo vacio y pulsa Aceptar.",
		etiqueta: "Clave API:",
		placeholder: "vacio si no hace falta",
		oculto: true,
	});
	if (clave === undefined) return undefined;
	const deteccion = await detectarConAyuda(ui, { url, clave: clave || undefined }, normalizarUrl(url));
	if (deteccion === "reintentar") return conectarPersonalizado(ui, url);
	if (!deteccion) return undefined;

	let sugerido = "mi-servicio";
	try {
		sugerido = aIdentificador(new URL(deteccion.baseUrl).hostname.replace(/^(api|www)\./, "").split(".")[0]);
	} catch {
		// Mantener el nombre sugerido por defecto.
	}
	const nombre = await ui.preguntar({
		titulo: "Ponle un nombre",
		explicacion: `Se encontraron ${deteccion.modelos.length} modelos. ¿Como quieres llamar a este servicio?`,
		etiqueta: "Nombre:",
		valor: sugerido,
		validar: (v) => (v ? undefined : "Escribe un nombre."),
	});
	if (!nombre) return undefined;
	// Nunca pisar un servicio que Pi ya trae ni otro que ya este guardado.
	const ocupados = new Set([...Object.keys(leerModelosJson().providers), ...PROVEEDORES.map((p) => p.id), "amazon-bedrock", "google-vertex", "github-copilot", "openai-codex"]);
	const base = aIdentificador(nombre);
	let idFinal = base;
	for (let n = 2; ocupados.has(idFinal); n++) idFinal = `${base}-${n}`;
	guardarProveedor(idFinal, {
		name: nombre,
		baseUrl: deteccion.baseUrl,
		api: deteccion.api,
		apiKey: clave || "sin-clave",
		models: aModelosPi(deteccion.modelos),
	});
	return elegirModelo(
		ui,
		nombre,
		deteccion.modelos.map((m) => ({ id: m.id, etiqueta: m.id, detalle: describirModelo(m), valor: { proveedor: idFinal, modelo: m.id } })),
	);
}

/**
 * Asistente completo para conectar una IA.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @param {OpcionesConexion} opciones
 * @returns {Promise<ResultadoConexion>}
 */
export async function conectarIA(ui, opciones) {
	const encontrados = opciones.buscarLocales === false ? [] : await ui.esperar("Buscando IA instalada en tu computadora…", buscarServidoresLocales());
	const funcionando = new Map(encontrados.map((e) => [e.proveedor.id, e.deteccion.modelos.length]));

	const elementos = PROVEEDORES.map((p) => {
		const activos = funcionando.get(p.id);
		return {
			id: p.id,
			etiqueta: activos ? `${p.nombre}  ✓ funcionando` : p.nombre,
			detalle: activos ? `${activos} modelos listos · ${p.descripcion}` : p.descripcion,
			grupo: NOMBRES_CLASE[p.clase],
			valor: p.id,
		};
	});
	elementos.push({
		id: "personalizado",
		etiqueta: "Otro servicio (escribir direccion)",
		detalle: "Cualquier servidor compatible con OpenAI, Anthropic o Google",
		grupo: "Otro",
		valor: "personalizado",
	});
	// Lo que ya funciona va primero.
	elementos.sort((a, b) => Number(funcionando.has(b.id)) - Number(funcionando.has(a.id)));
	if (funcionando.size > 0) for (const e of elementos) if (funcionando.has(e.id)) e.grupo = "Detectado en tu computadora";

	while (true) {
		const eleccion = await ui.elegir({
			titulo: "Conectar una IA",
			explicacion:
				"Elige donde esta la IA que quieres usar. Si no sabes cual elegir: Ollama es gratis y funciona sin internet; Anthropic, OpenAI o Google dan los mejores resultados.",
			elementos,
			buscador: true,
		});
		if (eleccion === undefined || typeof eleccion === "object") return undefined;
		if (eleccion === "personalizado") {
			const r = await conectarPersonalizado(ui);
			if (r) return r;
			continue;
		}
		const proveedor = proveedorPorId(eleccion);
		if (!proveedor) continue;
		if (proveedor.clase === "suscripcion") return { accion: "login" };
		const r = proveedor.clase === "local" ? await conectarLocal(ui, proveedor) : await conectarNube(ui, proveedor, opciones.catalogoPi);
		if (r) return r;
	}
}
