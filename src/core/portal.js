// Selector de archivos nativo de Linux a traves del portal de escritorio
// (org.freedesktop.portal.FileChooser). Es el mismo que usan Firefox o las apps
// Flatpak: muestra la ventana de GNOME, KDE, etc. sin instalar nada extra.

import { fileURLToPath } from "node:url";
import { ConexionDBus, variante } from "./dbus.js";

const PORTAL = "org.freedesktop.portal.Desktop";
const RUTA_PORTAL = "/org/freedesktop/portal/desktop";

/**
 * Abre el selector del portal.
 * @param {"carpeta" | "instrucciones" | "imagen"} tipo
 * @param {{ titulo: string, inicio?: string }} opciones
 * @returns {Promise<import("./selector-sistema.js").Resultado>}
 */
export async function elegirConPortal(tipo, { titulo, inicio }) {
	let conexion;
	try {
		conexion = await ConexionDBus.conectar();
	} catch (error) {
		return { estado: "no-disponible", motivo: `sin bus D-Bus (${error.message})` };
	}
	try {
		const token = `hilosenda${process.pid}_${Date.now()}`;
		const remitente = conexion.nombre.slice(1).replace(/\./g, "_");
		let rutaRespuesta = `${RUTA_PORTAL}/request/${remitente}/${token}`;
		const esperada = rutaRespuesta;

		// Escuchar la respuesta antes de llamar, para no perderla.
		await conexion.agregarFiltro("type='signal',interface='org.freedesktop.portal.Request',member='Response'");
		const respuesta = new Promise((resolver) => {
			conexion.alSenal((m) => {
				if (m.miembro === "Response" && (m.ruta === rutaRespuesta || m.ruta === esperada)) resolver(m.cuerpo);
			});
		});

		const opciones = [
			["handle_token", variante("s", token)],
			["modal", variante("b", true)],
			["accept_label", variante("s", "Elegir")],
		];
		if (tipo === "carpeta") {
			opciones.push(["directory", variante("b", true)]);
		} else if (tipo === "imagen") {
			const patrones = ["*.png", "*.PNG", "*.jpg", "*.JPG", "*.jpeg", "*.gif", "*.webp"].map((p) => [0, p]);
			opciones.push(["filters", variante("a(sa(us))", [["Imágenes", patrones], ["Todos los archivos", [[0, "*"]]]])]);
		} else {
			const patrones = ["*.md", "*.MD", "*.markdown", "*.txt", "*.TXT"].map((p) => [0, p]);
			opciones.push(["filters", variante("a(sa(us))", [["Instrucciones (.md, .txt)", patrones], ["Todos los archivos", [[0, "*"]]]])]);
		}
		if (inicio) opciones.push(["current_folder", variante("ay", Buffer.from(`${inicio}\0`, "utf8"))]);
		const idVentana = process.env.WINDOWID;
		const ventanaPadre = idVentana && /^\d+$/.test(idVentana) && !process.env.WAYLAND_DISPLAY ? `x11:${Number(idVentana).toString(16)}` : "";

		let manejador;
		try {
			[manejador] = await conexion.llamar({
				destino: PORTAL,
				ruta: RUTA_PORTAL,
				interfaz: "org.freedesktop.portal.FileChooser",
				miembro: "OpenFile",
				firma: "ssa{sv}",
				cuerpo: [ventanaPadre, titulo, opciones],
			});
		} catch (error) {
			return { estado: "no-disponible", motivo: `el portal de escritorio no esta disponible (${error.nombre ?? error.message})` };
		}
		rutaRespuesta = manejador;

		const [codigo, resultados] = await respuesta;
		if (codigo === 1) return { estado: "cancelado" };
		if (codigo !== 0) return { estado: "no-disponible", motivo: "el portal de escritorio no pudo mostrar la ventana" };
		const uri = resultados?.uris?.valor?.[0];
		if (!uri) return { estado: "cancelado" };
		return { estado: "ok", ruta: uri.startsWith("file://") ? fileURLToPath(uri) : uri };
	} finally {
		conexion.cerrar();
	}
}
