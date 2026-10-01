// Opciones con sus explicaciones, compartidas por la pantalla de inicio y el chat.

import { guardarPreferencias, leerPreferencias } from "../core/preferencias.js";
import { elegirInstrucciones, nombreCorto } from "./explorar.js";

export const NIVELES = [
	{ id: "off", etiqueta: "Apagado", detalle: "Responde al instante, sin pensar antes" },
	{ id: "minimal", etiqueta: "Minimo", detalle: "Piensa un poquito" },
	{ id: "low", etiqueta: "Bajo", detalle: "Rapido, para tareas sencillas" },
	{ id: "medium", etiqueta: "Medio", detalle: "Equilibrado (recomendado)" },
	{ id: "high", etiqueta: "Alto", detalle: "Piensa mas, para problemas dificiles" },
	{ id: "xhigh", etiqueta: "Muy alto", detalle: "Piensa mucho; tarda mas" },
	{ id: "max", etiqueta: "Maximo", detalle: "Todo el razonamiento posible" },
];

export const nombreNivel = (id) => NIVELES.find((n) => n.id === id)?.etiqueta ?? id;

export const PERMISOS = [
	{ id: "preguntar", etiqueta: "Preguntarme antes", corto: "Preguntar", detalle: "La IA pide permiso antes de cambiar archivos o ejecutar comandos (recomendado)" },
	{ id: "libre", etiqueta: "Libre", corto: "Libre", detalle: "La IA trabaja sin interrumpirte, como Pi original" },
	{ id: "lectura", etiqueta: "Solo mirar", corto: "Solo mirar", detalle: "La IA puede leer tu proyecto pero no cambiar nada" },
];

export const permisoPorId = (id) => PERMISOS.find((p) => p.id === id) ?? PERMISOS[0];

/**
 * Elige el modo de permisos y lo guarda.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @returns {Promise<string | undefined>} El modo elegido.
 */
export async function elegirPermisos(ui) {
	const actual = leerPreferencias().permisos;
	const eleccion = await ui.elegir({
		titulo: "¿Que puede hacer la IA sin preguntarte?",
		elementos: PERMISOS.map((p) => ({ id: p.id, etiqueta: `${p.id === actual ? "● " : "  "}${p.etiqueta}`, detalle: p.detalle, valor: p.id })),
		inicial: actual,
	});
	if (typeof eleccion !== "string") return undefined;
	guardarPreferencias({ permisos: eleccion });
	return eleccion;
}

/**
 * Pantalla para elegir, activar o quitar el archivo de instrucciones.
 * @param {import("../ui/dialogos.js").Dialogos} ui
 * @param {{ carpeta?: string }} [opciones]
 * @returns {Promise<string | undefined>} Mensaje con el resultado, si hubo cambios.
 */
export async function gestionarInstrucciones(ui, opciones = {}) {
	const p = leerPreferencias();
	const botones = [
		{
			id: "elegir",
			etiqueta: p.instrucciones ? "Elegir otro archivo" : "Elegir archivo .md o .txt",
			tipo: "primario",
			ayuda: "La IA leera este archivo y seguira sus reglas en cada respuesta",
		},
	];
	if (p.instrucciones) {
		botones.push(
			p.instruccionesActivas
				? { id: "desactivar", etiqueta: "Desactivar por ahora", ayuda: "Se recuerda el archivo pero la IA no lo usa" }
				: { id: "activar", etiqueta: "Activar", ayuda: "La IA vuelve a seguir el archivo" },
			{ id: "quitar", etiqueta: "Quitar", tipo: "peligro", ayuda: "Olvida el archivo (no se borra del disco)" },
		);
	}
	botones.push({ id: "volver", etiqueta: "← Volver", tipo: "suave" });
	const estado = p.instrucciones
		? `Archivo actual: ${p.instrucciones}${p.instruccionesActivas ? "" : " (desactivado)"}`
		: "Todavia no elegiste ningun archivo.";
	const accion = await ui.botones({
		titulo: "Instrucciones para la IA",
		explicacion: `Puedes darle a la IA un archivo con reglas o contexto (por ejemplo: «responde siempre en español», «usa TypeScript», «este proyecto es una tienda online»). Sirve cualquier archivo .md o .txt.\n\n${estado}`,
		botones,
	});
	if (accion === "elegir") {
		const ruta = await elegirInstrucciones(ui, { inicio: opciones.carpeta, ventana: p.selectorGrafico });
		if (!ruta) return undefined;
		guardarPreferencias({ instrucciones: ruta, instruccionesActivas: true });
		return `La IA seguira las instrucciones de ${nombreCorto(ruta)}`;
	}
	if (accion === "desactivar") {
		guardarPreferencias({ instruccionesActivas: false });
		return "Instrucciones desactivadas";
	}
	if (accion === "activar") {
		guardarPreferencias({ instruccionesActivas: true });
		return "Instrucciones activadas";
	}
	if (accion === "quitar") {
		guardarPreferencias({ instrucciones: undefined });
		return "Archivo de instrucciones quitado";
	}
	return undefined;
}
