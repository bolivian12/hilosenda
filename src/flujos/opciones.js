// Opciones con sus explicaciones, compartidas por la pantalla de inicio y el chat.

import { guardarPreferencias, leerPreferencias } from "../core/preferencias.js";
import { elegirInstrucciones, nombreCorto } from "./explorar.js";
import { tr } from "../i18n.js";

export const NIVELES = [
	{ id: "off", etiqueta: tr("Apagado"), detalle: tr("Responde al instante, sin pensar antes") },
	{ id: "minimal", etiqueta: tr("Minimo"), detalle: tr("Piensa un poquito") },
	{ id: "low", etiqueta: tr("Bajo"), detalle: tr("Rapido, para tareas sencillas") },
	{ id: "medium", etiqueta: tr("Medio"), detalle: tr("Equilibrado (recomendado)") },
	{ id: "high", etiqueta: tr("Alto"), detalle: tr("Piensa mas, para problemas dificiles") },
	{ id: "xhigh", etiqueta: tr("Muy alto"), detalle: tr("Piensa mucho; tarda mas") },
	{ id: "max", etiqueta: tr("Maximo"), detalle: tr("Todo el razonamiento posible") },
];

export const nombreNivel = (id) => NIVELES.find((n) => n.id === id)?.etiqueta ?? id;

export const PERMISOS = [
	{ id: "preguntar", etiqueta: tr("Preguntarme antes"), corto: tr("Preguntar"), detalle: tr("La IA pide permiso antes de cambiar archivos o ejecutar comandos (recomendado)") },
	{ id: "libre", etiqueta: tr("Libre"), corto: tr("Libre"), detalle: tr("La IA trabaja sin interrumpirte, como Pi original") },
	{ id: "lectura", etiqueta: tr("Solo mirar"), corto: tr("Solo mirar"), detalle: tr("La IA puede leer tu proyecto pero no cambiar nada") },
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
		titulo: tr("¿Que puede hacer la IA sin preguntarte?"),
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
			etiqueta: p.instrucciones ? tr("Elegir otro archivo") : tr("Elegir archivo .md o .txt"),
			tipo: "primario",
			ayuda: tr("La IA leera este archivo y seguira sus reglas en cada respuesta"),
		},
	];
	if (p.instrucciones) {
		botones.push(
			p.instruccionesActivas
				? { id: "desactivar", etiqueta: tr("Desactivar por ahora"), ayuda: tr("Se recuerda el archivo pero la IA no lo usa") }
				: { id: "activar", etiqueta: tr("Activar"), ayuda: tr("La IA vuelve a seguir el archivo") },
			{ id: "quitar", etiqueta: tr("Quitar"), tipo: "peligro", ayuda: tr("Olvida el archivo (no se borra del disco)") },
		);
	}
	botones.push({ id: "volver", etiqueta: tr("← Volver"), tipo: "suave" });
	const estado = p.instrucciones
		? tr("Archivo actual: {0}{1}", [p.instrucciones, p.instruccionesActivas ? "" : " (desactivado)"])
		: tr("Todavia no elegiste ningun archivo.");
	const accion = await ui.botones({
		titulo: tr("Instrucciones para la IA"),
		explicacion: tr("Puedes darle a la IA un archivo con reglas o contexto (por ejemplo: «responde siempre en español», «usa TypeScript», «este proyecto es una tienda online»). Sirve cualquier archivo .md o .txt.\n\n{0}", [estado]),
		botones,
	});
	if (accion === "elegir") {
		const ruta = await elegirInstrucciones(ui, { inicio: opciones.carpeta, ventana: p.selectorGrafico });
		if (!ruta) return undefined;
		guardarPreferencias({ instrucciones: ruta, instruccionesActivas: true });
		return tr("La IA seguira las instrucciones de {0}", [nombreCorto(ruta)]);
	}
	if (accion === "desactivar") {
		guardarPreferencias({ instruccionesActivas: false });
		return tr("Instrucciones desactivadas");
	}
	if (accion === "activar") {
		guardarPreferencias({ instruccionesActivas: true });
		return tr("Instrucciones activadas");
	}
	if (accion === "quitar") {
		guardarPreferencias({ instrucciones: undefined });
		return tr("Archivo de instrucciones quitado");
	}
	return undefined;
}
