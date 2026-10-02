// Extension de hilosenda para Pi.
//
// Agrega dentro del chat:
//  - una barra de botones clicables (modelo, razonamiento, carpeta, permisos, ...)
//  - un menu con TODAS las funciones de Pi explicadas en español
//  - comandos en español (/menu, /modelo, /razonamiento, /carpeta, /historial, ...)
//  - permisos: preguntar antes de cambiar archivos o ejecutar comandos, o modo "solo mirar"
//  - un archivo de instrucciones .md o .txt elegido libremente
// Todos los comandos originales de Pi siguen funcionando igual.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CustomEditor, SessionManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { imagenEnTexto } from "../src/ui/vista-imagen.js";
import { leerPortapapeles, rutasDesdeTexto } from "../src/core/portapapeles.js";
import { guardarAjustesPi, leerAjustesPi, leerClaves, leerModelosJson, quitarClave, quitarProveedor } from "../src/core/pi-config.js";
import { guardarPreferencias as guardarPreferenciasDisco, leerPreferencias as leerPreferenciasDisco } from "../src/core/preferencias.js";
import { aIdentificador, conectarIA } from "../src/flujos/conectar.js";
import { elegirCarpeta, elegirImagen, nombreCorto } from "../src/flujos/explorar.js";
import { elegirPermisos, gestionarInstrucciones, NIVELES, nombreNivel, PERMISOS, permisoPorId } from "../src/flujos/opciones.js";
import { AYUDA_GENERAL } from "../src/textos.js";
import { logoDegradado } from "../src/ui/animacion.js";
import { crearDialogos } from "../src/ui/dialogos.js";
import { crearEstilo } from "../src/ui/style.js";
import { FilaBotones, Mosaico, recortar } from "../src/ui/widgets.js";
import { idioma, localeFechas, tr } from "../src/i18n.js";

const NOMBRE_IDIOMA_EN: Record<string, string> = { es: "Spanish", pt: "Portuguese", fr: "French", de: "German", it: "Italian" };

type Dialogos = ReturnType<typeof crearDialogos>;
type Estilo = ReturnType<typeof crearEstilo>;
type EventoRaton = Parameters<NonNullable<InstanceType<typeof CustomEditor>["handleMouse"]>>[0];
type ModeloPi = NonNullable<ExtensionContext["model"]>;

const HERRAMIENTAS_SOLO_LECTURA = new Set(["read", "grep", "find", "ls", "tool_search", "codemode"]);
const HERRAMIENTAS_QUE_CAMBIAN = new Set(["write", "edit", "bash", "powershell"]);
const MAX_INSTRUCCIONES = 256 * 1024;
const COMANDOS_HILOSENDA = ["menu", "modelo", "razonamiento", "carpeta", "permisos", "instrucciones", "historial", "conectar", "ajustes", "ayuda", "inicio", "nuevo"];

/** Explicacion en español de cada comando de Pi, agrupados para el menu. */
const COMANDOS_PI: Array<{ nombre: string; etiqueta: string; detalle: string; grupo: string }> = [
	{ nombre: tr("new"), etiqueta: tr("Nuevo chat"), detalle: tr("Empieza una conversacion desde cero"), grupo: tr("Conversacion") },
	{ nombre: tr("resume"), etiqueta: tr("Continuar otra conversacion (Pi)"), detalle: tr("Selector de sesiones original de Pi"), grupo: tr("Conversacion") },
	{ nombre: tr("tree"), etiqueta: tr("Volver a un punto anterior"), detalle: tr("Navega por el arbol de la conversacion y cambia de rama"), grupo: tr("Conversacion") },
	{ nombre: tr("fork"), etiqueta: tr("Bifurcar desde un mensaje"), detalle: tr("Crea una copia de la conversacion desde un mensaje anterior"), grupo: tr("Conversacion") },
	{ nombre: tr("clone"), etiqueta: tr("Duplicar conversacion"), detalle: tr("Copia la conversacion tal como esta ahora"), grupo: tr("Conversacion") },
	{ nombre: tr("name"), etiqueta: tr("Ponerle nombre al chat"), detalle: tr("Asi lo encuentras facil en el historial"), grupo: tr("Conversacion") },
	{ nombre: tr("compact"), etiqueta: tr("Resumir para ahorrar memoria"), detalle: tr("Resume lo anterior cuando la conversacion es muy larga"), grupo: tr("Conversacion") },
	{ nombre: tr("copy"), etiqueta: tr("Copiar ultima respuesta"), detalle: tr("Copia al portapapeles lo ultimo que dijo la IA"), grupo: tr("Conversacion") },
	{ nombre: tr("session"), etiqueta: tr("Informacion del chat"), detalle: tr("Mensajes, tokens usados y costo"), grupo: tr("Conversacion") },
	{ nombre: tr("export"), etiqueta: tr("Exportar a HTML"), detalle: tr("Guarda la conversacion como pagina web"), grupo: tr("Conversacion") },
	{ nombre: tr("import"), etiqueta: tr("Importar conversacion"), detalle: tr("Abre una conversacion desde un archivo .jsonl"), grupo: tr("Conversacion") },
	{ nombre: tr("share"), etiqueta: tr("Compartir (gist de GitHub)"), detalle: tr("Crea un enlace secreto para compartir"), grupo: tr("Conversacion") },
	{ nombre: tr("model"), etiqueta: tr("Selector de modelos de Pi"), detalle: tr("El selector original (Ctrl+S guarda como predeterminado)"), grupo: tr("Modelo e IA") },
	{ nombre: tr("thinking"), etiqueta: tr("Selector de razonamiento de Pi"), detalle: tr("El selector original de nivel de razonamiento"), grupo: tr("Modelo e IA") },
	{ nombre: tr("scoped-models"), etiqueta: tr("Modelos para Ctrl+P"), detalle: tr("Elige que modelos rotan con Ctrl+P"), grupo: tr("Modelo e IA") },
	{ nombre: tr("login"), etiqueta: tr("Iniciar sesion (suscripcion o clave)"), detalle: tr("Claude Pro/Max, ChatGPT, Copilot y mas"), grupo: tr("Modelo e IA") },
	{ nombre: tr("logout"), etiqueta: tr("Cerrar sesion de un proveedor"), detalle: tr("Borra la credencial guardada"), grupo: tr("Modelo e IA") },
	{ nombre: tr("trust"), etiqueta: tr("Confiar en esta carpeta"), detalle: tr("Guarda si confias en la configuracion del proyecto"), grupo: tr("Proyecto") },
	{ nombre: tr("reload"), etiqueta: tr("Recargar"), detalle: tr("Recarga extensiones, habilidades, temas y atajos"), grupo: tr("Proyecto") },
	{ nombre: tr("settings"), etiqueta: tr("Ajustes avanzados de Pi"), detalle: tr("Todos los ajustes originales de Pi"), grupo: tr("Ajustes") },
	{ nombre: tr("hotkeys"), etiqueta: tr("Atajos de teclado"), detalle: tr("Lista de todas las teclas rapidas"), grupo: tr("Ayuda") },
	{ nombre: tr("changelog"), etiqueta: tr("Novedades de Pi"), detalle: tr("Cambios de la ultima version"), grupo: tr("Ayuda") },
	{ nombre: tr("bug"), etiqueta: tr("Reportar un error a Pi"), detalle: tr("Envia un reporte a los desarrolladores de Pi"), grupo: tr("Ayuda") },
	{ nombre: tr("quit"), etiqueta: tr("Salir del chat"), detalle: tr("Cierra el chat (la conversacion queda guardada)"), grupo: tr("Ayuda") },
];

// Las preferencias se leen mucho (en cada cuadro de la barra): se guardan en memoria
// y se vuelven a leer del disco como mucho cada medio segundo.
let preferenciasCache: { valor: ReturnType<typeof leerPreferenciasDisco>; hora: number } | undefined;
function leerPreferencias() {
	if (!preferenciasCache || Date.now() - preferenciasCache.hora > 500) preferenciasCache = { valor: leerPreferenciasDisco(), hora: Date.now() };
	return preferenciasCache.valor;
}
function guardarPreferencias(cambios: Parameters<typeof guardarPreferenciasDisco>[0]) {
	const valor = guardarPreferenciasDisco(cambios);
	preferenciasCache = { valor, hora: Date.now() };
	return valor;
}

/** Ideas para empezar, que se envian con un clic. */
const SUGERENCIAS = [
	{ id: "explicar", icono: "❝", etiqueta: tr("Explícame este proyecto"), detalle: tr("Qué hay en esta carpeta"), texto: tr("Explícame qué hay en esta carpeta y para qué sirve, en pocas palabras.") },
	{ id: "errores", icono: "✓", etiqueta: tr("Busca errores"), detalle: tr("Revisa y dime qué falla"), texto: tr("Revisa el proyecto y dime si ves errores o problemas, ordenados por importancia.") },
	{ id: "readme", icono: "✎", etiqueta: tr("Crea un README"), detalle: tr("Documenta el proyecto"), texto: tr("Crea un archivo README.md claro que explique este proyecto y cómo usarlo.") },
	{ id: "ideas", icono: "✦", etiqueta: tr("¿Qué puedes hacer?"), detalle: tr("Ideas para empezar"), texto: tr("¿Qué cosas puedes hacer por mí en esta carpeta? Dame ejemplos concretos.") },
];

/** Boton de la columna lateral. */
type BotonLateral = { id: string; icono: string; etiqueta: string; peligro?: boolean };

const ANCHO_COLUMNA = 24;

/**
 * Cuadro de texto con una columna de botones a su derecha:
 *
 *   ── ✎ Tu mensaje ───────────────┬──────────────────
 *   escribe aqui…                  │  ≡  Menú
 *                                  │  ◆  modelo
 *                                  │  ✚  Nuevo chat
 *                                  │  ⌂  Inicio
 *   ───────────────────────────────┴──  Enviar ▶
 *
 * Tambien permite que los botones ejecuten comandos (usa el onSubmit del editor).
 */
class EditorHilosenda extends CustomEditor {
	estilo: () => Estilo = () => crearEstilo();
	botones: () => BotonLateral[] = () => [];
	/** Texto extra en el borde superior: modelo en uso e imagenes adjuntas. */
	detalle: () => string = () => "";
	/** Hay algo para enviar aunque no haya texto (por ejemplo una imagen). */
	hayAdjuntos: () => boolean = () => false;
	/** Recibe archivos pegados o arrastrados; devuelve true si los adjunto. */
	alPegarArchivos: (rutas: string[]) => boolean = () => false;
	/** Pega desde el portapapeles (Ctrl+V o clic derecho). */
	alPegarPortapapeles?: () => void;
	private pegando = "";

	override handleInput(data: string): void {
		// Ctrl+V (Alt+V en Windows): archivos, imagenes o texto del portapapeles.
		const atajoPegar = matchesKey(data, "ctrl+v") || (process.platform === "win32" && matchesKey(data, "alt+v"));
		if (atajoPegar && this.alPegarPortapapeles) {
			this.alPegarPortapapeles();
			return;
		}
		// Texto pegado (o archivos arrastrados): si son rutas de archivos, se adjuntan.
		if (this.pegando || data.includes("\x1b[200~")) {
			this.pegando += data;
			if (!this.pegando.includes("\x1b[201~")) return;
			const completo = this.pegando;
			this.pegando = "";
			const contenido = completo.slice(completo.indexOf("\x1b[200~") + 6, completo.indexOf("\x1b[201~"));
			const rutas = rutasDesdeTexto(contenido);
			if (rutas.length && this.alPegarArchivos(rutas)) return;
			super.handleInput(completo);
			return;
		}
		super.handleInput(data);
	}
	alPulsar?: (id: string) => void;
	private hover = "";
	private presionado = "";
	private anchoEditor = 0;
	private filasContenido = 0;
	private filaEnviar = -1;

	protected override renderTopBorder(width: number, hiddenLineCount: number): string {
		if (hiddenLineCount > 0 || this.embedWorkingStatus) return super.renderTopBorder(width, hiddenLineCount);
		const e = this.estilo();
		const etiqueta = tr(" ✎ Tu mensaje ");
		const extra = recortar(this.detalle(), Math.max(0, width - visibleWidth(etiqueta) - 6));
		const texto = e.pintar(etiqueta, { fg: e.c.suave }) + (extra ? e.pintar(`${extra} `, { fg: e.c.texto, negrita: true }) : "");
		return this.borderColor("──") + texto + this.borderColor("─".repeat(Math.max(0, width - 2 - visibleWidth(texto))));
	}

	private conColumna(width: number): boolean {
		const autocompletando = Boolean((this as unknown as { autocompleteState?: unknown }).autocompleteState);
		return width >= 60 && !autocompletando;
	}

	override render(width: number): string[] {
		if (!this.conColumna(width)) {
			this.anchoEditor = 0;
			return super.render(width);
		}
		const e = this.estilo();
		const anchoEditor = width - ANCHO_COLUMNA - 1;
		this.anchoEditor = anchoEditor;
		const lineas = super.render(anchoEditor);
		const borde = (t: string) => this.borderColor(t);
		const botones = this.botones();
		const superior = lineas[0];
		const inferior = lineas[lineas.length - 1];
		const contenido = lineas.slice(1, -1);
		this.filasContenido = contenido.length;
		while (contenido.length < botones.length) contenido.push(" ".repeat(anchoEditor));

		const salida = [`${superior}${borde(`┬${"─".repeat(ANCHO_COLUMNA)}`)}`];
		contenido.forEach((linea, i) => {
			const b = botones[i];
			let celda = " ".repeat(ANCHO_COLUMNA);
			if (b) {
				const encima = this.hover === b.id || this.presionado === b.id;
				const texto = recortar(`  ${b.icono}  ${b.etiqueta}`, ANCHO_COLUMNA - 1);
				const relleno = " ".repeat(Math.max(0, ANCHO_COLUMNA - visibleWidth(texto)));
				const fg = b.peligro ? e.c.error : encima ? e.c.texto : e.c.suave;
				celda = e.pintar(texto + relleno, { fg, bg: encima ? e.c.tarjetaHover : undefined, negrita: encima || b.peligro });
			}
			salida.push(`${linea}${borde("│")}${celda}`);
		});
		const vacio = this.getText().trim() === "" && !this.hayAdjuntos();
		const fondo = vacio ? e.c.tarjeta : this.hover === "enviar" ? e.mezclar(e.c.acento, e.c.texto, 0.25) : e.c.acento;
		const enviar = e.pastilla(`  ${tr("Enviar ▶")}  `, fondo, vacio ? e.c.tenue : e.c.textoSobreAcento);
		const resto = Math.max(0, ANCHO_COLUMNA - visibleWidth(enviar) - 1);
		salida.push(`${inferior}${borde(`┴${"─".repeat(resto)}`)}${enviar} `);
		this.filaEnviar = salida.length - 1;
		return salida;
	}

	private objetivo(evento: EventoRaton): string {
		if (!this.anchoEditor || evento.x <= this.anchoEditor) return "";
		if (evento.y === this.filaEnviar) return "enviar";
		const b = this.botones()[evento.y - 1];
		return evento.y >= 1 && b ? b.id : "";
	}

	override handleMouse(evento: EventoRaton) {
		// Clic derecho sobre el cuadro de texto: pegar.
		if (evento.button === "right" && evento.type === "press" && (!this.anchoEditor || evento.x <= this.anchoEditor)) {
			this.alPegarPortapapeles?.();
			return { handled: true };
		}
		const id = this.objetivo(evento);
		if (evento.type === "move" || evento.type === "drag") {
			if (id !== this.hover) {
				this.hover = id;
				return { handled: true, render: true };
			}
			return id ? { handled: true, render: false } : super.handleMouse(evento);
		}
		if (this.anchoEditor && evento.x > this.anchoEditor) {
			if (evento.button !== "left") return { handled: true };
			if (evento.type === "press") {
				this.presionado = id;
				return { handled: true, render: true };
			}
			if (evento.type === "click" || evento.type === "release") {
				const pulsado = this.presionado;
				this.presionado = "";
				if (id && id === pulsado) {
					if (id === "enviar") {
						if (this.getText().trim() === "" && this.hayAdjuntos()) this.setText(tr("Revisa lo que te adjunto."));
						if (this.getText().trim() !== "") this.handleInput("\r");
					} else this.alPulsar?.(id);
				}
				return { handled: true, render: true };
			}
			return { handled: true };
		}
		// Filas de relleno debajo del texto: clic = enfocar el cuadro.
		if (this.anchoEditor && evento.y > this.filasContenido && evento.y < this.filaEnviar) return { handled: true, focus: true };
		if (this.anchoEditor && evento.y === this.filaEnviar) return super.handleMouse({ ...evento, y: this.filasContenido + 1 });
		return super.handleMouse({ ...evento, width: this.anchoEditor || evento.width });
	}
}

export default function hilosenda(pi: ExtensionAPI) {
	let ctxActual: ExtensionContext | undefined;
	let editor: EditorHilosenda | undefined;
	let pedirRenderBarra: (() => void) | undefined;
	let filaBarra: FilaBotones | undefined;
	let filaSugerencias: Mosaico | undefined;
	let costoCache = { entradas: -1, total: 0 };
	let trabajando = false;
	type Adjunto = { nombre: string; ruta?: string; bytes: number; imagen?: { type: "image"; data: string; mimeType: string } };
	const adjuntos: Adjunto[] = [];
	let pedirRenderAdjuntos: (() => void) | undefined;
	const TIPOS_IMAGEN: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
	const tamano = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
	let dialogoAbierto = false;
	let herramientasAntesDeLectura: string[] | undefined;
	const permitidosEnSesion = new Set<string>();
	let colaPermisos: Promise<unknown> = Promise.resolve();

	// --- Utilidades ---------------------------------------------------------------

	/** Estilo de hilosenda que sigue al tema de Pi (claro u oscuro), aunque cambie durante el chat. */
	let estiloCache: { oscuro: boolean; estilo: Estilo } | undefined;
	function estiloActual(): Estilo {
		const oscuro = (ctxActual?.ui.theme as { appearance?: string } | undefined)?.appearance !== "light";
		if (!estiloCache || estiloCache.oscuro !== oscuro) estiloCache = { oscuro, estilo: crearEstilo({ oscuro }) };
		return estiloCache.estilo;
	}

	/** Quita el efecto de raton de la barra y las sugerencias (al mover el raton fuera de ellas). */
	function limpiarHovers() {
		const cambio = Boolean(filaBarra?.quitarHover()) || Boolean(filaSugerencias?.quitarHover());
		if (cambio) pedirRenderBarra?.();
	}

	function dialogos(ctx: ExtensionContext): Dialogos {
		return crearDialogos(
			estiloActual(),
			(construir) =>
				ctx.ui.custom((tui, _tema, _teclas, done) => {
					const pantalla = construir(done);
					pantalla.tui = tui;
					return pantalla;
				}),
			{ altoLista: () => Math.max(5, Math.min(14, Math.floor((process.stdout.rows || 24) / 2) - 4)) },
		);
	}

	/** Ejecuta una accion que abre dialogos, evitando abrir dos a la vez. */
	async function conDialogo(ctx: ExtensionContext, accion: (ui: Dialogos) => Promise<void>) {
		if (dialogoAbierto) return;
		dialogoAbierto = true;
		try {
			await accion(dialogos(ctx));
		} catch (error) {
			ctx.ui.notify(`hilosenda: ${error instanceof Error ? error.message : String(error)}`, "error");
		} finally {
			dialogoAbierto = false;
			pedirRenderBarra?.();
		}
	}

	/** Envia un comando como si se escribiera en el cuadro de texto, sin perder el borrador. */
	function ejecutarComando(ctx: ExtensionContext, texto: string) {
		if (!editor?.onSubmit) {
			ctx.ui.setEditorText(texto);
			ctx.ui.notify(tr("Pulsa Enter para ejecutar el comando."), "info");
			return;
		}
		const borrador = editor.getText();
		editor.onSubmit(texto);
		if (borrador) {
			setTimeout(() => {
				if (editor && editor.getText() === "") editor.setText(borrador);
			}, 0);
		}
	}

	/** Pide a la pantalla de inicio de hilosenda que haga algo al cerrarse el chat. */
	function pedirAlInicio(ctx: ExtensionContext, datos: Record<string, string>): boolean {
		const archivo = process.env.HILOSENDA_TRASPASO;
		if (!archivo) return false;
		writeFileSync(archivo, JSON.stringify(datos), "utf8");
		ctx.shutdown();
		return true;
	}

	const nombreModelo = (m: ModeloPi | undefined) => (m ? (m.name ?? m.id) : tr("sin modelo"));
	const contextoCorto = (n?: number) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(n / 1000)}K`);

	function nivelesDe(modelo: ModeloPi | undefined): string[] {
		if (!modelo?.reasoning) return ["off"];
		const mapa = (modelo as { thinkingLevelMap?: Record<string, string | null> }).thinkingLevelMap;
		return NIVELES.map((n) => n.id).filter((nivel) => {
			const valor = mapa?.[nivel];
			if (valor === null) return false;
			if (nivel === "xhigh" || nivel === "max") return valor !== undefined;
			return true;
		});
	}

	// --- Acciones ----------------------------------------------------------------

	/** Quita un proveedor: su clave guardada y/o su configuracion en models.json. */
	async function quitarProveedorChat(ctx: ExtensionContext, ui: Dialogos, proveedor: string): Promise<boolean> {
		const nombre = ctx.modelRegistry.getProviderDisplayName(proveedor) ?? proveedor;
		const enModelos = Boolean(leerModelosJson().providers[proveedor]);
		const clave = leerClaves()[proveedor] as { type?: string } | undefined;
		if (!enModelos && !clave) {
			await ui.informar({
				titulo: tr("No se puede quitar {0} desde aquí", [nombre]),
				texto: tr("{0} está conectado con una variable de entorno o con credenciales del sistema (por ejemplo {1}_API_KEY). Quítala de tu configuración del sistema y vuelve a abrir el chat.", [nombre, proveedor.toUpperCase().replace(/-/g, "_")]),
			});
			return false;
		}
		const si = await ui.confirmar({
			titulo: tr("¿Quitar {0}?", [nombre]),
			explicacion: (clave?.type === "oauth" ? tr("Se borrará la sesión iniciada de {0} en esta computadora. Podrás volver a conectarlo cuando quieras.", [nombre]) : clave ? tr("Se borrará la clave API guardada de {0} en esta computadora. Podrás volver a conectarlo cuando quieras.", [nombre]) : tr("Se borrará la configuración de {0} en esta computadora. Podrás volver a conectarlo cuando quieras.", [nombre])),
			si: tr("Sí, quitar"),
			no: tr("Cancelar"),
			peligro: true,
		});
		if (!si) return false;
		if (clave) quitarClave(proveedor);
		if (enModelos) quitarProveedor(proveedor);
		if (leerAjustesPi().defaultProvider === proveedor) guardarAjustesPi({ defaultProvider: undefined, defaultModel: undefined });
		await ctx.modelRegistry.refresh().catch(() => undefined);
		ctx.ui.notify(`${tr("{0} quitado.", [nombre])}${ctx.model?.provider === proveedor ? ` ${tr("Elige otro modelo para seguir chateando.")}` : ""}`, "info");
		return true;
	}

	async function elegirModelo(ctx: ExtensionContext, busqueda?: string) {
		await conDialogo(ctx, async (ui) => {
			const actual = ctx.model;
			const describir = (m: ModeloPi) =>
				[m.name && m.name !== m.id ? m.id : "", contextoCorto(m.contextWindow) && tr("{0} de contexto", [contextoCorto(m.contextWindow)]), m.reasoning && tr("razona"), m.input?.includes("image") && tr("ve imagenes")]
					.filter(Boolean)
					.join(" · ");
			const nombreProveedor = (id: string) => ctx.modelRegistry.getProviderDisplayName(id) ?? id;
			const usar = async (m: ModeloPi) => {
				if (await pi.setModel(m)) {
					guardarAjustesPi({ defaultProvider: m.provider, defaultModel: m.id });
					ctx.ui.notify(`Modelo: ${nombreModelo(m)}`, "info");
				} else {
					ctx.ui.notify(tr("Ese modelo no tiene credenciales. Conéctalo primero."), "warning");
				}
			};
			let proveedor: string | undefined = busqueda ? "__todos" : undefined;
			while (true) {
				const disponibles = ctx.modelRegistry.getAvailable();
				if (!proveedor) {
					// Paso 1: elegir proveedor.
					const porProveedor = new Map<string, number>();
					for (const m of disponibles) porProveedor.set(m.provider, (porProveedor.get(m.provider) ?? 0) + 1);
					const eleccion = await ui.elegir({
						titulo: tr("Elegir modelo · proveedor"),
						explicacion: tr("Primero elige el proveedor (la empresa o programa de la IA). Escribe para buscar."),
						elementos: [
							{ id: "__todos", etiqueta: tr("Todos los modelos"), detalle: tr("{0} modelos · buscar en todos", [disponibles.length]), valor: "__todos" },
							...[...porProveedor.entries()]
								.sort((a, b) => nombreProveedor(a[0]).localeCompare(nombreProveedor(b[0])))
								.map(([id, n]) => ({
									id,
									etiqueta: `${actual?.provider === id ? "● " : "  "}${nombreProveedor(id)}`,
									detalle: `${n === 1 ? tr("1 modelo") : tr("{0} modelos", [n])}${actual?.provider === id ? ` · ${tr("en uso: {0}", [nombreModelo(actual)])}` : ""}`,
									buscarEn: id,
									valor: id,
								})),
						],
						buscador: true,
						inicial: actual?.provider,
						vacio: tr("No hay ninguna IA conectada. Pulsa «Conectar otra IA»."),
						extras: [
							{ id: "conectar", etiqueta: tr("+ Conectar otra IA"), tipo: "primario" },
							{ id: "quitar", etiqueta: tr("Quitar un proveedor"), tipo: "peligro" },
						],
					});
					if (eleccion?.boton === "conectar") return flujoConectar(ctx, ui);
					if (eleccion?.boton === "quitar") {
						const cual = await ui.elegir({
							titulo: tr("¿Qué proveedor quieres quitar?"),
							elementos: [...porProveedor.keys()].map((id) => ({ id, etiqueta: nombreProveedor(id), detalle: id, valor: id })),
							buscador: true,
						});
						if (typeof cual === "string") await quitarProveedorChat(ctx, ui, cual);
						continue;
					}
					if (typeof eleccion !== "string") return;
					proveedor = eleccion;
					continue;
				}
				// Paso 2: modelos del proveedor elegido (o de todos).
				const filtro = busqueda?.toLowerCase();
				busqueda = undefined;
				const lista = disponibles
					.filter((m) => proveedor === "__todos" || m.provider === proveedor)
					.filter((m) => !filtro || `${m.provider}/${m.id} ${m.name ?? ""}`.toLowerCase().includes(filtro));
				const extras = [{ id: "proveedores", etiqueta: tr("← Proveedores"), tipo: "suave" as const }];
				if (proveedor !== "__todos") extras.push({ id: "quitar", etiqueta: tr("Quitar este proveedor"), tipo: "peligro" as never });
				const eleccion = await ui.elegir({
					titulo: proveedor === "__todos" ? tr("Elegir modelo · todos") : tr("Elegir modelo · {0}", [nombreProveedor(proveedor)]),
					explicacion: tr("Haz clic en un modelo para usarlo (queda guardado para la próxima vez). Escribe para buscar."),
					elementos: lista.map((m) => ({
						id: `${m.provider}/${m.id}`,
						etiqueta: `${actual && actual.provider === m.provider && actual.id === m.id ? "● " : "  "}${m.name ?? m.id}`,
						detalle: describir(m),
						grupo: proveedor === "__todos" ? nombreProveedor(m.provider) : undefined,
						buscarEn: m.provider,
						valor: m,
					})),
					buscador: true,
					inicial: actual ? `${actual.provider}/${actual.id}` : undefined,
					extras,
				});
				if (eleccion?.boton === "proveedores") {
					proveedor = undefined;
					continue;
				}
				if (eleccion?.boton === "quitar") {
					if (await quitarProveedorChat(ctx, ui, proveedor)) proveedor = undefined;
					continue;
				}
				if (!eleccion || eleccion.boton) return;
				return usar(eleccion);
			}
		});
	}

	async function flujoConectar(ctx: ExtensionContext, ui: Dialogos) {
		const resultado = await conectarIA(ui, {
			catalogoPi: async () =>
				ctx.modelRegistry.getAll().map((m) => ({
					proveedor: m.provider,
					id: m.id,
					contexto: contextoCorto(m.contextWindow),
					razona: Boolean(m.reasoning),
					imagenes: Boolean(m.input?.includes("image")),
				})),
			buscarLocales: leerPreferencias().buscarModelosLocales,
		});
		if (!resultado) return;
		if ("accion" in resultado) {
			setTimeout(() => ejecutarComando(ctx, "/login"), 0);
			return;
		}
		await ctx.modelRegistry.refresh();
		const modelo = ctx.modelRegistry.find(resultado.proveedor, resultado.modelo);
		if (modelo && (await pi.setModel(modelo))) {
			guardarAjustesPi({ defaultProvider: resultado.proveedor, defaultModel: resultado.modelo });
			ctx.ui.notify(tr("Conectado. Ahora usas {0}", [nombreModelo(modelo)]), "info");
		} else {
			ctx.ui.notify(tr("Conexion guardada. Elige el modelo con el boton «Modelo»."), "info");
		}
	}

	async function elegirRazonamiento(ctx: ExtensionContext, directo?: string) {
		const permitidos = nivelesDe(ctx.model);
		const aplicar = (nivel: string) => {
			pi.setThinkingLevel(nivel as Parameters<typeof pi.setThinkingLevel>[0]);
			guardarAjustesPi({ defaultThinkingLevel: nivel });
			ctx.ui.notify(`Razonamiento: ${nombreNivel(pi.getThinkingLevel())}`, "info");
		};
		if (directo) {
			const buscado = directo.toLowerCase();
			const nivel = NIVELES.find((n) => n.id === buscado || n.etiqueta.toLowerCase() === buscado);
			if (nivel) aplicar(nivel.id);
			else ctx.ui.notify(tr("Nivel desconocido. Usa: {0}", [NIVELES.map((n) => n.etiqueta.toLowerCase()).join(", ")]), "warning");
			return;
		}
		await conDialogo(ctx, async (ui) => {
			const actual = pi.getThinkingLevel();
			const eleccion = await ui.elegir({
				titulo: tr("¿Cuanto debe pensar la IA antes de responder?"),
				explicacion: ctx.model?.reasoning
					? tr("Mas razonamiento da mejores respuestas en problemas dificiles, pero tarda mas y gasta mas.")
					: tr("El modelo {0} no admite razonamiento. Elige otro modelo para usar esta opcion.", [nombreModelo(ctx.model)]),
				elementos: NIVELES.filter((n) => permitidos.includes(n.id)).map((n) => ({
					id: n.id,
					etiqueta: `${n.id === actual ? "● " : "  "}${n.etiqueta}`,
					detalle: n.detalle,
					valor: n.id,
				})),
				inicial: actual,
			});
			if (typeof eleccion === "string") aplicar(eleccion);
		});
	}

	async function cambiarCarpeta(ctx: ExtensionContext, ruta?: string) {
		await conDialogo(ctx, async (ui) => {
			const destino = ruta ?? (await elegirCarpeta(ui, { inicio: ctx.cwd, ventana: leerPreferencias().selectorGrafico }));
			if (!destino) return;
			if (!existsSync(destino) || !statSync(destino).isDirectory()) {
				ctx.ui.notify(tr("No existe la carpeta: {0}", [destino]), "error");
				return;
			}
			if (destino === ctx.cwd) return;
			const seguir = await ui.confirmar({
				titulo: tr("¿Abrir el chat en {0}?", [basename(destino) || destino]),
				explicacion: tr("La conversacion actual queda guardada; puedes volver a ella desde «Historial»."),
				si: tr("Si, cambiar de carpeta"),
				no: tr("Cancelar"),
			});
			if (!seguir) return;
			if (!pedirAlInicio(ctx, { accion: "carpeta", ruta: destino })) {
				ctx.ui.notify(tr("Cierra el chat y ejecuta: hilosenda \"{0}\"", [destino]), "info");
			}
		});
	}

	async function abrirHistorial(ctx: ExtensionCommandContext) {
		await conDialogo(ctx, async (ui) => {
			const sesiones = await ui.esperar(tr("Cargando tus conversaciones…"), SessionManager.listAll());
			const actual = ctx.sessionManager.getSessionFile?.();
			const ahora = Date.now();
			const grupo = (fecha: Date) => {
				const dias = (ahora - new Date(fecha).getTime()) / 86400000;
				return dias < 1 ? "Hoy" : dias < 2 ? "Ayer" : dias < 7 ? tr("Esta semana") : dias < 31 ? tr("Este mes") : tr("Mas antiguas");
			};
			const elementos = sesiones
				.filter((s) => s.path !== actual)
				.map((s) => {
					const titulo = (s.name || s.firstMessage || tr("(conversacion vacia)")).replace(/\s+/g, " ").trim();
					const misma = s.cwd === ctx.cwd;
					return {
						id: s.path,
						etiqueta: titulo.length > 60 ? `${titulo.slice(0, 59)}…` : titulo,
						detalle: `${new Date(s.modified).toLocaleString(localeFechas, { dateStyle: "short", timeStyle: "short" })} · ${tr("{0} mensajes", [s.messageCount])}${misma ? "" : ` · ${tr("en {0}", [basename(s.cwd) || s.cwd])}`}`,
						grupo: grupo(s.modified),
						buscarEn: s.allMessagesText?.slice(0, 4000),
						valor: s,
					};
				});
			const elegida = await ui.elegir({
				titulo: tr("Conversaciones anteriores"),
				explicacion: tr("Haz clic para continuar una conversacion. Escribe para buscar cualquier palabra que se haya dicho."),
				elementos,
				buscador: true,
				vacio: tr("No hay otras conversaciones todavia."),
			});
			if (!elegida || elegida.boton) return;
			if (!elegida.cwd || elegida.cwd === ctx.cwd) {
				await ctx.switchSession(elegida.path);
				return;
			}
			if (!pedirAlInicio(ctx, { accion: "conversacion", ruta: elegida.path, carpeta: elegida.cwd })) {
				await ctx.switchSession(elegida.path);
			}
		});
	}

	async function mostrarMenu(ctx: ExtensionContext) {
		await conDialogo(ctx, async (ui) => {
			const propios = [
				{ id: "h:conectar", etiqueta: tr("Conectar una IA"), detalle: tr("Agrega Ollama, Claude, GPT, Gemini o cualquier otra; detecta sus modelos solo"), grupo: tr("hilosenda") },
				{ id: "h:imagen", etiqueta: tr("Adjuntar archivo o imagen"), detalle: tr("Envía fotos o documentos junto a tu mensaje (también: Ctrl+V, clic derecho o arrastrar)"), grupo: tr("hilosenda") },
				{ id: "h:modelo", etiqueta: tr("Elegir modelo"), detalle: tr("Cambia la IA que responde"), grupo: tr("hilosenda") },
				{ id: "h:razonamiento", etiqueta: tr("Razonamiento"), detalle: tr("Cuanto piensa la IA antes de responder"), grupo: tr("hilosenda") },
				{ id: "h:historial", etiqueta: tr("Conversaciones anteriores"), detalle: tr("Busca y continua cualquier chat anterior"), grupo: tr("hilosenda") },
				{ id: "h:carpeta", etiqueta: tr("Cambiar de carpeta"), detalle: tr("Abre el chat en otro proyecto"), grupo: tr("hilosenda") },
				{ id: "h:instrucciones", etiqueta: tr("Instrucciones (.md / .txt)"), detalle: tr("Elige un archivo con reglas que la IA siempre sigue"), grupo: tr("hilosenda") },
				{ id: "h:permisos", etiqueta: tr("Permisos"), detalle: tr("Preguntar antes de cambiar cosas, libre o solo mirar"), grupo: tr("hilosenda") },
				{ id: "h:ajustes", etiqueta: tr("Ajustes de hilosenda"), detalle: tr("Barra de botones, consejos, tema..."), grupo: tr("hilosenda") },
				{ id: "h:inicio", etiqueta: tr("Volver a la pantalla de inicio"), detalle: tr("Cierra el chat y vuelve al menu principal"), grupo: tr("hilosenda") },
				{ id: "h:ayuda", etiqueta: tr("Ayuda"), detalle: tr("Como usar hilosenda paso a paso"), grupo: tr("hilosenda") },
			];
			const integrados = COMANDOS_PI.map((c) => ({ id: `p:${c.nombre}`, etiqueta: c.etiqueta, detalle: `${c.detalle}  (/${c.nombre})`, grupo: c.grupo, buscarEn: c.nombre }));
			const conocidos = new Set([...COMANDOS_PI.map((c) => c.nombre), ...COMANDOS_HILOSENDA]);
			const otros = pi
				.getCommands()
				.filter((c) => !conocidos.has(c.name))
				.map((c) => ({
					id: `p:${c.name}`,
					etiqueta: `/${c.name}`,
					detalle: c.description ?? "",
					grupo: c.source === "skill" ? tr("Habilidades") : c.source === "prompt" ? tr("Plantillas de mensajes") : tr("Comandos de extensiones"),
				}));
			const eleccion = await ui.elegir({
				titulo: tr("Menu: todas las funciones"),
				explicacion: tr("Haz clic en lo que quieras hacer. Escribe para buscar. Entre parentesis esta el comando equivalente."),
				elementos: [...propios, ...integrados, ...otros],
				buscador: true,
			});
			if (typeof eleccion !== "string") return;
			if (eleccion.startsWith("p:")) {
				const nombre = eleccion.slice(2);
				setTimeout(() => ejecutarComando(ctx, `/${nombre}`), 0);
				return;
			}
			// Las acciones propias abren sus dialogos al terminar este.
			setTimeout(() => void ejecutarAccion(ctx, eleccion.slice(2)), 0);
		});
	}

	async function ajustes(ctx: ExtensionContext) {
		await conDialogo(ctx, async (ui) => {
			while (true) {
				const p = leerPreferencias();
				const siNo = (v: boolean) => (v ? tr("Si") : tr("No"));
				const eleccion = await ui.elegir({
					titulo: tr("Ajustes de hilosenda"),
					explicacion: tr("Haz clic en un ajuste para cambiarlo."),
					elementos: [
						{ id: "tema", etiqueta: tr("Tema de colores"), detalle: { auto: tr("hilosenda automático"), oscuro: tr("hilosenda oscuro"), claro: tr("hilosenda claro"), pi: tr("el de Pi") }[p.tema ?? "auto"] ?? "hilosenda", valor: "tema" },
						{ id: "barra", etiqueta: tr("Barra de botones"), detalle: !p.barraBotones ? "Oculta" : p.barraCompleta ? "Completa" : "Sencilla", valor: "barra" },
						{ id: "principiante", etiqueta: tr("Consejos para principiantes"), detalle: siNo(p.modoPrincipiante), valor: "principiante" },
						{ id: "permisos", etiqueta: tr("Permisos de la IA"), detalle: permisoPorId(p.permisos).etiqueta, valor: "permisos" },
						{ id: "ventana", etiqueta: tr("Ventana del sistema para elegir carpetas"), detalle: siNo(p.selectorGrafico), valor: "ventana" },
						{ id: "pi", etiqueta: tr("Ajustes avanzados de Pi"), detalle: tr("Todos los ajustes originales (/settings)"), valor: "pi" },
					],
				});
				if (typeof eleccion !== "string") return;
				if (eleccion === "tema") {
					const tema = await ui.elegir({
						titulo: tr("Tema de colores"),
						elementos: [
							{ id: "auto", etiqueta: tr("hilosenda automático"), detalle: tr("Claro u oscuro según tu consola"), valor: "auto" },
							{ id: "oscuro", etiqueta: tr("hilosenda oscuro"), valor: "oscuro" },
							{ id: "claro", etiqueta: tr("hilosenda claro"), valor: "claro" },
							{ id: "pi", etiqueta: tr("El tema de Pi"), detalle: tr("El que elijas en los ajustes avanzados de Pi"), valor: "pi" },
						],
						inicial: p.tema ?? "auto",
					});
					if (typeof tema === "string") {
						guardarPreferencias({ tema: tema as "auto" | "oscuro" | "claro" | "pi" });
						const nombre = tema === "oscuro" ? "hilosenda-oscuro" : tema === "claro" ? "hilosenda-claro" : undefined;
						if (nombre) ctx.ui.setTheme(nombre);
						else ctx.ui.notify(tr("El tema se aplicará la próxima vez que abras el chat."), "info");
					}
				} else if (eleccion === "barra") {
					const modo = await ui.elegir({
						titulo: tr("Barra de botones del chat"),
						elementos: [
							{ id: "sencilla", etiqueta: tr("Sencilla"), detalle: tr("Menú, modelo, nuevo chat e inicio (recomendada)"), valor: "sencilla" },
							{ id: "completa", etiqueta: tr("Completa"), detalle: tr("Además razonamiento, permisos, instrucciones, carpeta e historial"), valor: "completa" },
							{ id: "oculta", etiqueta: tr("Oculta"), detalle: tr("Solo comandos (escribe /menu)"), valor: "oculta" },
						],
						inicial: !p.barraBotones ? "oculta" : p.barraCompleta ? "completa" : "sencilla",
					});
					if (typeof modo === "string") {
						guardarPreferencias({ barraBotones: modo !== "oculta", barraCompleta: modo === "completa" });
						instalarBarra(ctx);
					}
				} else if (eleccion === "principiante") {
					guardarPreferencias({ modoPrincipiante: !p.modoPrincipiante });
					instalarCabecera(ctx);
				} else if (eleccion === "permisos") {
					await elegirPermisos(ui);
					aplicarModoPermisos(ctx);
				} else if (eleccion === "ventana") {
					guardarPreferencias({ selectorGrafico: !p.selectorGrafico });
				} else if (eleccion === "pi") {
					setTimeout(() => ejecutarComando(ctx, "/settings"), 0);
					return;
				}
			}
		});
	}

	async function ejecutarAccion(ctx: ExtensionContext, accion: string) {
		switch (accion) {
			case "menu":
				return mostrarMenu(ctx);
			case "modelo":
				return elegirModelo(ctx);
			case "razonamiento":
				return elegirRazonamiento(ctx);
			case "carpeta":
				return cambiarCarpeta(ctx);
			case "permisos":
				return conDialogo(ctx, async (ui) => {
					await elegirPermisos(ui);
					aplicarModoPermisos(ctx);
				});
			case "instrucciones":
				return conDialogo(ctx, async (ui) => {
					const mensaje = await gestionarInstrucciones(ui, { carpeta: ctx.cwd });
					if (mensaje) ctx.ui.notify(mensaje, "info");
				});
			case "conectar":
				return conDialogo(ctx, (ui) => flujoConectar(ctx, ui));
			case "ajustes":
				return ajustes(ctx);
			case "ayuda":
				return conDialogo(ctx, (ui) => ui.informar({ titulo: tr("Como usar hilosenda"), texto: AYUDA_GENERAL }));
			case "inicio":
				if (!pedirAlInicio(ctx, { accion: "inicio" })) ctx.shutdown();
				return;
			case "imagen":
				return conDialogo(ctx, async (ui) => {
					const ruta = await elegirImagen(ui, { inicio: ctx.cwd, ventana: leerPreferencias().selectorGrafico });
					if (ruta) adjuntarArchivos(ctx, [ruta]);
				});
			case "detener":
				ctx.abort();
				return;
			// Estas necesitan un contexto de comando: se envian como comandos.
			case "historial":
				return ejecutarComando(ctx, "/historial");
			case "nuevo":
				return ejecutarComando(ctx, "/new");
		}
	}

	// --- Barra de botones ----------------------------------------------------------

	/** Adjunta archivos: las imagenes se envian como imagen y el resto como documento. */
	function adjuntarArchivos(ctx: ExtensionContext, rutas: string[]): boolean {
		let alguno = false;
		for (const ruta of rutas) {
			let info;
			try {
				info = statSync(ruta);
			} catch {
				continue;
			}
			if (info.isDirectory()) {
				adjuntos.push({ nombre: `${basename(ruta)}/`, ruta, bytes: 0 });
				alguno = true;
				continue;
			}
			const mime = TIPOS_IMAGEN[extname(ruta).toLowerCase()];
			if (mime && info.size <= 20 * 1024 * 1024) {
				adjuntos.push({ nombre: basename(ruta), ruta, bytes: info.size, imagen: { type: "image", data: readFileSync(ruta).toString("base64"), mimeType: mime } });
			} else {
				adjuntos.push({ nombre: basename(ruta), ruta, bytes: info.size });
			}
			alguno = true;
		}
		if (!alguno) return false;
		if (adjuntos.some((a) => a.imagen) && !ctx.model?.input?.includes("image")) {
			ctx.ui.notify(tr("Ojo: {0} no puede ver imágenes. Cambia a un modelo que sí pueda (por ejemplo Claude, GPT o Gemini).", [nombreModelo(ctx.model)]), "warning");
		}
		instalarAdjuntos(ctx);
		return true;
	}

	function adjuntarImagenPegada(ctx: ExtensionContext, datos: Buffer, mime: string) {
		const n = adjuntos.filter((a) => a.imagen).length + 1;
		adjuntos.push({ nombre: tr("imagen pegada {0}", [n]), bytes: datos.length, imagen: { type: "image", data: datos.toString("base64"), mimeType: mime } });
		instalarAdjuntos(ctx);
	}

	let pegandoAhora = false;
	async function pegarPortapapeles(ctx: ExtensionContext) {
		if (pegandoAhora) return;
		pegandoAhora = true;
		ctx.ui.setWorkingMessage(tr("Pegando…"));
		try {
			await pegarPortapapelesAhora(ctx);
		} finally {
			pegandoAhora = false;
			ctx.ui.setWorkingMessage(tr("Trabajando… (Esc para detener)"));
		}
	}

	async function pegarPortapapelesAhora(ctx: ExtensionContext) {
		const contenido = await leerPortapapeles().catch(() => undefined);
		if (!contenido) {
			ctx.ui.notify(tr("El portapapeles está vacío o no se pudo leer (en Linux instala wl-clipboard o xclip)."), "warning");
			return;
		}
		if (contenido.tipo === "archivos") adjuntarArchivos(ctx, contenido.rutas);
		else if (contenido.tipo === "imagen") adjuntarImagenPegada(ctx, contenido.datos, contenido.mime);
		else {
			const rutas = rutasDesdeTexto(contenido.texto);
			if (!(rutas.length && adjuntarArchivos(ctx, rutas))) ctx.ui.pasteToEditor(contenido.texto);
		}
	}

	/** Vista previa de lo que se va a enviar, encima del cuadro de texto. */
	function instalarAdjuntos(ctx: ExtensionContext) {
		if (adjuntos.length === 0) {
			ctx.ui.setWidget("hilosenda-adjuntos", undefined);
			pedirRenderAdjuntos = undefined;
			return;
		}
		ctx.ui.setWidget(
			"hilosenda-adjuntos",
			(tui) => {
				pedirRenderAdjuntos = () => tui.requestRender();
				// Las vistas previas se calculan una vez por adjunto y ancho (no en cada cuadro).
				const cache = new Map<Adjunto, { ancho: number; lineas: string[] }>();
				const vistaDe = (a: Adjunto, ancho: number): string[] => {
					const guardada = cache.get(a);
					if (guardada && guardada.ancho === ancho) return guardada.lineas;
					let lineas: string[] = [];
					if (a.imagen) {
						lineas = imagenEnTexto(a.imagen.data, Math.min(ancho - 6, 48), 12) ?? [];
					} else if (a.ruta && a.bytes > 0 && a.bytes <= 2 * 1024 * 1024) {
						try {
							const inicio = readFileSync(a.ruta).subarray(0, 4096);
							if (!inicio.includes(0)) {
								const e = estiloActual();
								lineas = inicio
									.toString("utf8")
									.split(/\r?\n/)
									.filter((l) => l.trim()).slice(0, 4)
									.map((l) => e.pintar(`│ ${recortar(l.replace(/\t/g, "  "), ancho - 10)}`, { fg: e.c.tenue }));
							}
						} catch {
							lineas = [];
						}
					}
					cache.set(a, { ancho, lineas });
					return lineas;
				};
				let zonas: Array<{ y: number; x0: number; x1: number; indice: number }> = [];
				let hover = -1;
				return {
					render(ancho: number) {
						const e = estiloActual();
						const lineas = ["", e.pintar(tr("  Se enviará con tu mensaje ({0}):", [adjuntos.length]), { fg: e.c.suave })];
						zonas = [];
						adjuntos.forEach((a, i) => {
							for (const l of vistaDe(a, ancho)) lineas.push(`    ${l}`);
							const icono = a.imagen ? "▣" : a.nombre.endsWith("/") ? "▤" : "≡";
							const texto = `  ${icono}  ${a.nombre}${a.bytes ? `  ·  ${tamano(a.bytes)}` : ""}   `;
							const quitar = " ✕ quitar ";
							zonas.push({ y: lineas.length, x0: visibleWidth(texto), x1: visibleWidth(texto) + visibleWidth(quitar) - 1, indice: i });
							lineas.push(e.pintar(texto, { fg: e.c.texto }) + e.pintar(quitar, { fg: hover === i ? e.c.error : e.c.tenue, bg: hover === i ? e.c.tarjetaHover : undefined }));
						});
						return lineas;
					},
					invalidate() {
						cache.clear();
					},
					handleMouse(evento: EventoRaton) {
						const zona = zonas.find((z) => z.y === evento.y && evento.x >= z.x0 && evento.x <= z.x1);
						if (evento.type === "move" || evento.type === "drag") {
							const nuevo = zona ? zona.indice : -1;
							if (nuevo === hover) return undefined;
							hover = nuevo;
							return { handled: true, render: true };
						}
						if (!zona || evento.button !== "left") return undefined;
						if (evento.type === "click" && ctxActual) {
							adjuntos.splice(zona.indice, 1);
							hover = -1;
							instalarAdjuntos(ctxActual);
						}
						return { handled: true };
					},
				};
			},
			{ placement: "aboveEditor" },
		);
	}

	/** Texto que acompaña a los documentos adjuntos (no imagenes). */
	function textoDocumentos(lista: Adjunto[]): string {
		const partes: string[] = [];
		for (const a of lista) {
			if (!a.ruta) continue;
			const esTexto = a.bytes > 0 && a.bytes <= 200 * 1024 && !readFileSync(a.ruta).subarray(0, 4096).includes(0);
			if (esTexto) {
				partes.push(tr("Archivo adjunto «{0}» ({1}):\n\`\`\`\n{2}\n\`\`\`", [a.nombre, a.ruta, readFileSync(a.ruta, "utf8")]));
			} else {
				partes.push(tr("Archivo adjunto «{0}»: {1}\n(Ábrelo o conviértelo con tus herramientas para leer su contenido.)", [a.nombre, a.ruta]));
			}
		}
		return partes.join("\n\n");
	}

	function botonesLaterales(): BotonLateral[] {
		const lista: BotonLateral[] = [];
		if (trabajando) lista.push({ id: "detener", icono: "■", etiqueta: tr("Detener"), peligro: true });
		lista.push(
			{ id: "imagen", icono: "▣", etiqueta: tr("Adjuntar archivo") },
			{ id: "modelo", icono: "◆", etiqueta: tr("Cambiar modelo") },
			{ id: "razonamiento", icono: "◑", etiqueta: tr("Razonamiento") },
			{ id: "historial", icono: "❝", etiqueta: tr("Chats anteriores") },
			{ id: "nuevo", icono: "✚", etiqueta: tr("Nuevo chat") },
			{ id: "menu", icono: "≡", etiqueta: tr("Más opciones") },
			{ id: "inicio", icono: "⌂", etiqueta: tr("Inicio") },
		);
		return lista;
	}

	function botonesBarra(compacta = false) {
		const ctx = ctxActual;
		const p = leerPreferencias();
		type BotonBarra = { id: string; etiqueta: string; icono?: string; tipo?: "primario" | "normal" | "peligro" | "suave" };
		const botones: BotonBarra[] = [];
		if (trabajando) botones.push({ id: "detener", icono: "■", etiqueta: tr("Detener"), tipo: "peligro" });
		botones.push({ id: "menu", icono: "≡", etiqueta: tr("Menú") }, { id: "modelo", icono: "◆", etiqueta: `${recortar(nombreModelo(ctx?.model), 26)} ▾` });
		if (p.barraCompleta) {
			botones.push(
				{ id: "razonamiento", icono: "◑", etiqueta: `${ctx?.model?.reasoning ? nombreNivel(pi.getThinkingLevel()) : tr("Sin razonar")} ▾` },
				{ id: "permisos", icono: "◈", etiqueta: `${permisoPorId(p.permisos).corto} ▾` },
				{ id: "instrucciones", icono: "✎", etiqueta: `${p.instrucciones && p.instruccionesActivas ? recortar(nombreCorto(p.instrucciones), 16) : tr("Sin instrucciones")} ▾` },
				{ id: "carpeta", icono: "▤", etiqueta: `${recortar(basename(ctx?.cwd ?? "") || "/", 16)} ▾` },
			);
		}
		const derechaDesde = botones.length;
		const derecha: BotonBarra[] = p.barraCompleta
			? [
					{ id: "nuevo", icono: "✚", etiqueta: tr("Nuevo") },
					{ id: "historial", icono: "❝", etiqueta: tr("Historial") },
					{ id: "inicio", icono: "⌂", etiqueta: tr("Inicio") },
					{ id: "ayuda", icono: "?", etiqueta: tr("Ayuda") },
				]
			: [
					{ id: "nuevo", icono: "✚", etiqueta: tr("Nuevo chat") },
					{ id: "inicio", icono: "⌂", etiqueta: tr("Inicio") },
				];
		// En ventanas estrechas, los accesos de la derecha quedan solo con su icono.
		for (const b of derecha) botones.push(compacta ? { id: b.id, etiqueta: b.icono ?? b.etiqueta, tipo: "suave" } : { ...b, tipo: "suave" });
		return { botones, derechaDesde };
	}

	function instalarBarra(ctx: ExtensionContext) {
		if (!leerPreferencias().barraBotones) {
			ctx.ui.setWidget("hilosenda-barra", undefined);
			pedirRenderBarra = undefined;
			filaBarra = undefined;
			return;
		}
		ctx.ui.setWidget(
			"hilosenda-barra",
			(tui) => {
				const fila = new FilaBotones(estiloActual(), [], {
					alPulsar: (id: string) => {
						if (ctxActual) void ejecutarAccion(ctxActual, id);
					},
				});
				filaBarra = fila;
				pedirRenderBarra = () => tui.requestRender();
				return {
					render(ancho: number) {
						const anchoDe = (lista: ReturnType<typeof botonesBarra>["botones"]) =>
							lista.reduce((total, b) => total + visibleWidth(` ${b.icono ? `${b.icono}  ` : ""}${b.etiqueta} `) + 3, 0);
						let { botones, derechaDesde } = botonesBarra();
						if (anchoDe(botones) > ancho) ({ botones, derechaDesde } = botonesBarra(true));
						fila.estilo = estiloActual();
						fila.setBotones(botones);
						fila.derechaDesde = derechaDesde;
						// Una linea libre arriba: separa del chat y detecta cuando el raton se va.
						return ["", ...fila.render(ancho)];
					},
					invalidate() {},
					handleMouse(evento: EventoRaton) {
						if (evento.y === 0) {
							if ((evento.type === "move" || evento.type === "drag") && (fila.quitarHover() || filaSugerencias?.quitarHover())) return { handled: true, render: true };
							return undefined;
						}
						if (evento.type === "move") filaSugerencias?.quitarHover();
						return fila.handleMouse({ ...evento, y: evento.y - 1, height: evento.height - 1 });
					},
				};
			},
			{ placement: "aboveEditor" },
		);
	}

	/** Tarjetas con ideas para empezar, sobre el cuadro de texto. Desaparecen al escribir. */
	function instalarSugerencias(ctx: ExtensionContext) {
		ctx.ui.setWidget(
			"hilosenda-consejo",
			(tui) => {
				const mosaico = new Mosaico(
					estiloActual(),
					SUGERENCIAS.map((s) => ({ id: s.id, icono: s.icono, titulo: s.etiqueta, descripcion: s.detalle, color: 0 })),
					{
						anchoMinimo: 30,
						columnasMax: 2,
						alPulsar: (id: string) => {
							const sugerencia = SUGERENCIAS.find((s) => s.id === id);
							if (!sugerencia || !ctxActual) return;
							ctxActual.ui.setWidget("hilosenda-consejo", undefined);
							filaSugerencias = undefined;
							ejecutarComando(ctxActual, sugerencia.texto);
						},
					},
				);
				filaSugerencias = mosaico;
				let margen = 0;
				return {
					render(ancho: number) {
						mosaico.estilo = estiloActual();
						const anchoMosaico = Math.min(ancho - 4, 84);
						margen = Math.max(0, Math.floor((ancho - anchoMosaico) / 2));
						const relleno = " ".repeat(margen);
						return [...mosaico.render(anchoMosaico).map((l) => relleno + l), ""];
					},
					invalidate() {},
					handleMouse(evento: EventoRaton) {
						if (evento.type === "move") filaBarra?.quitarHover();
						const r = mosaico.handleMouse({ ...evento, x: evento.x - margen });
						if (!r && (evento.type === "move" || evento.type === "drag") && mosaico.quitarHover()) {
							tui.requestRender();
							return { handled: true, render: true };
						}
						if (r) tui.requestRender();
						return r;
					},
				};
			},
			{ placement: "aboveEditor" },
		);
	}

	/** Costo acumulado de la conversacion, segun lo que informa cada respuesta. */
	function costoSesion(ctx: ExtensionContext): number {
		const entradas = ctx.sessionManager.getEntries();
		if (entradas.length === costoCache.entradas) return costoCache.total;
		let total = 0;
		for (const entrada of entradas as Array<{ type: string; message?: { role?: string; usage?: { cost?: { total?: number } } } }>) {
			if (entrada.type === "message" && entrada.message?.role === "assistant") total += entrada.message.usage?.cost?.total ?? 0;
		}
		costoCache = { entradas: entradas.length, total };
		return total;
	}

	/** Barra de estado inferior, como en un editor de codigo. Sus partes son clicables. */
	function instalarPie(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, _tema, datos) => {
			let zonas: Array<{ id: string; x0: number; x1: number }> = [];
			let hover = "";
			let cachePie: { ancho: number; hora: number; hover: string; lineas: string[] } | undefined;
			return {
				render(ancho: number) {
					// Calcular la barra cuesta en chats largos: se reutiliza durante medio segundo.
					if (cachePie && cachePie.ancho === ancho && Date.now() - cachePie.hora < 500 && cachePie.hover === hover) return cachePie.lineas;
					const lineas = dibujarPie(ancho);
					cachePie = { ancho, hora: Date.now(), hover, lineas };
					return lineas;
				},
				invalidate() {
					cachePie = undefined;
				},
				handleMouse(evento: EventoRaton) {
					return ratonPie(evento);
				},
			};
			function dibujarPie(ancho: number) {
					const e = estiloActual();
					const c = ctxActual;
					const fondo = e.c.barra;
					const uso = c?.getContextUsage();
					const porcentaje = uso?.percent ?? (uso?.tokens && uso.contextWindow ? (uso.tokens / uso.contextWindow) * 100 : 0);
					const llenos = Math.round(Math.min(100, porcentaje ?? 0) / 12.5);
					const colorUso = (porcentaje ?? 0) > 85 ? e.c.error : (porcentaje ?? 0) > 60 ? e.c.aviso : e.c.acento;
					const rama = datos.getGitBranch();
					const carpeta = (c?.cwd ?? "").replace(homedir(), "~");
					const costo = c ? costoSesion(c) : 0;
					const p = leerPreferencias();
					const gris = e.c.suave;
					const partes: Array<{ id?: string; segmentos: Array<{ t: string; fg?: unknown; negrita?: boolean }> }> = [
						{ id: "carpeta", segmentos: [{ t: "▤ ", fg: e.c.tenue }, { t: recortar(carpeta, 40), fg: gris }, ...(rama ? [{ t: ` (${rama})`, fg: e.c.tenue }] : [])] },
						{ id: "razonamiento", segmentos: [{ t: "◑ ", fg: e.c.tenue }, { t: c?.model?.reasoning ? tr("razona: {0}", [nombreNivel(pi.getThinkingLevel()).toLowerCase()]) : tr("sin razonar"), fg: gris }] },
						{ id: "permisos", segmentos: [{ t: "◈ ", fg: e.c.tenue }, { t: permisoPorId(p.permisos).etiqueta.toLowerCase(), fg: gris }] },
						{ segmentos: [{ t: `${tr("memoria")} `, fg: e.c.tenue }, { t: "▰".repeat(llenos), fg: colorUso }, { t: "▱".repeat(8 - llenos), fg: e.c.borde }, { t: ` ${Math.round(porcentaje ?? 0)}%`, fg: gris }] },
					];
					if (costo > 0) partes.push({ segmentos: [{ t: `$${costo < 0.01 ? costo.toFixed(4) : costo.toFixed(2)}`, fg: e.c.suave }] });
					const estados = [...datos.getExtensionStatuses().entries()].filter(([clave]) => clave !== "hilosenda").map(([, valor]) => valor);
					if (estados.length) partes.push({ segmentos: [{ t: estados.join("  "), fg: e.c.suave }] });

					let linea = e.pintar(" ", { bg: fondo });
					let x = 1;
					zonas = [];
					partes.forEach((parte, i) => {
						if (i > 0) {
							linea += e.segmentos([{ t: " │ ", fg: e.c.borde }], fondo);
							x += 3;
						}
						const encima = parte.id && parte.id === hover;
						const texto = e.segmentos([{ t: " " }, ...(parte.segmentos as never[]), { t: " " }], encima ? e.c.tarjetaHover : fondo);
						const w = visibleWidth(texto);
						if (x + w > ancho - 1) return;
						if (parte.id) zonas.push({ id: parte.id, x0: x, x1: x + w - 1 });
						linea += texto;
						x += w;
					});
					const marca = e.segmentos([{ t: "hilosenda ", fg: e.c.tenue }], fondo);
					const hueco = ancho - x - visibleWidth(marca);
					linea += hueco > 0 ? e.pintar(" ".repeat(hueco), { bg: fondo }) + marca : e.pintar(" ".repeat(Math.max(0, ancho - x)), { bg: fondo });
					return [linea];
			}
			function ratonPie(evento: EventoRaton) {
					const zona = zonas.find((z) => evento.x >= z.x0 && evento.x <= z.x1);
					if (evento.type === "move" || evento.type === "drag") {
						limpiarHovers();
						const nuevo = zona?.id ?? "";
						if (nuevo === hover) return zona ? { handled: true, render: false } : undefined;
						hover = nuevo;
						tui.requestRender();
						return { handled: true, render: true };
					}
					if (!zona || evento.button !== "left") return undefined;
					if (evento.type === "click" && ctxActual) void ejecutarAccion(ctxActual, zona.id);
					return { handled: true };
			}
		});
	}

	/** Saludo sencillo arriba del chat, sin distracciones. */
	function instalarCabecera(ctx: ExtensionContext) {
		ctx.ui.setHeader(() => ({
			render(ancho: number) {
				const e = estiloActual();
				const centrar = (linea: string) => " ".repeat(Math.max(0, Math.floor((ancho - visibleWidth(linea)) / 2))) + linea;
				const marca = e.pintar("◆ ", { fg: e.c.acento }) + e.pintar("hilosenda", { fg: e.c.suave, negrita: true });
				const lineas = ["", "", centrar(marca), ""];
				if (leerPreferencias().modoPrincipiante) {
					lineas.push(
						centrar(e.pintar(tr("¿En qué te ayudo hoy?"), { fg: e.c.texto, negrita: true })),
						centrar(e.pintar(tr("Escribe abajo lo que necesitas, como si hablaras con una persona."), { fg: e.c.suave })),
					);
				}
				lineas.push("");
				return lineas;
			},
			invalidate() {},
		}));
	}

	// --- Permisos ----------------------------------------------------------------------

	function aplicarModoPermisos(ctx: ExtensionContext) {
		const modo = leerPreferencias().permisos;
		if (modo === "lectura") {
			if (!herramientasAntesDeLectura) herramientasAntesDeLectura = pi.getActiveTools();
			const existentes = new Set(pi.getAllTools().map((t) => t.name));
			pi.setActiveTools(["read", "grep", "find", "ls"].filter((t) => existentes.has(t)));
		} else if (herramientasAntesDeLectura) {
			pi.setActiveTools(herramientasAntesDeLectura);
			herramientasAntesDeLectura = undefined;
		}
		if (!leerPreferencias().barraBotones) ctx.ui.setStatus("hilosenda", `Permisos: ${permisoPorId(modo).corto}`);
		pedirRenderBarra?.();
	}

	function necesitaPermiso(nombre: string): boolean {
		if (HERRAMIENTAS_QUE_CAMBIAN.has(nombre)) return true;
		if (HERRAMIENTAS_SOLO_LECTURA.has(nombre)) return false;
		const info = pi.getAllTools().find((t) => t.name === nombre);
		return info?.annotations?.readOnlyHint !== true;
	}

	function describirLlamada(nombre: string, entrada: Record<string, unknown>): { titulo: string; detalle: string } {
		const texto = (v: unknown, max = 600) => {
			const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
			return s.length > max ? `${s.slice(0, max)}…` : s;
		};
		if (nombre === "bash" || nombre === "powershell") return { titulo: tr("La IA quiere ejecutar un comando"), detalle: `${tr("Comando:")}\n  ${texto(entrada.command)}` };
		if (nombre === "write") return { titulo: tr("La IA quiere crear o reemplazar un archivo"), detalle: `${tr("Archivo:")} ${entrada.path}\n\n${texto(entrada.content, 400)}` };
		if (nombre === "edit") return { titulo: tr("La IA quiere modificar un archivo"), detalle: `${tr("Archivo:")} ${entrada.path}` };
		return { titulo: tr("La IA quiere usar la herramienta «{0}»", [nombre]), detalle: texto(entrada) };
	}

	// --- Eventos ------------------------------------------------------------------------

	pi.on("session_start", async (_evento, ctx) => {
		ctxActual = ctx;
		if (ctx.mode !== "tui") return;
		if (!ctx.ui.getEditorComponent()) {
			ctx.ui.setEditorComponent((tui, tema, teclas) => {
				editor = new EditorHilosenda(tui, tema, teclas);
				editor.estilo = estiloActual;
				editor.botones = botonesLaterales;
				editor.detalle = () => {
					const partes = [`· ◆ ${nombreModelo(ctxActual?.model)}`];
					if (adjuntos.length) partes.push(`· ${adjuntos.length} adjunto${adjuntos.length > 1 ? "s" : ""}`);
					return partes.join(" ");
				};
				editor.hayAdjuntos = () => adjuntos.length > 0;
				editor.alPegarArchivos = (rutas) => (ctxActual ? adjuntarArchivos(ctxActual, rutas) : false);
				editor.alPegarPortapapeles = () => {
					if (ctxActual) void pegarPortapapeles(ctxActual);
				};
				editor.alPulsar = (id) => {
					if (ctxActual) void ejecutarAccion(ctxActual, id);
				};
				return editor;
			});
		}
		// La columna lateral reemplaza a la barra; si otra extension cambio el editor, se usa la barra.
		if (!editor || leerPreferencias().barraCompleta) instalarBarra(ctx);
		instalarCabecera(ctx);
		instalarPie(ctx);
		aplicarModoPermisos(ctx);
		ctx.ui.setTitle(`hilosenda · ${basename(ctx.cwd) || ctx.cwd}`);
		ctx.ui.setWorkingMessage(tr("Trabajando… (Esc para detener)"));
		const alIniciar = process.env.HILOSENDA_AL_INICIAR;
		if (alIniciar) {
			delete process.env.HILOSENDA_AL_INICIAR;
			setTimeout(() => ejecutarComando(ctx, alIniciar), 300);
		}
	});

	const recordar = (_e: unknown, ctx: ExtensionContext) => {
		ctxActual = ctx;
		editor?.invalidate();
		pedirRenderBarra?.();
	};
	pi.on("model_select", recordar);
	pi.on("thinking_level_select", recordar);
	pi.on("agent_start", (_e, ctx) => {
		trabajando = true;
		recordar(_e, ctx);
	});
	pi.on("agent_settled", (_e, ctx) => {
		trabajando = false;
		recordar(_e, ctx);
	});
	pi.on("input", (evento, ctx) => {
		ctx.ui.setWidget("hilosenda-consejo", undefined);
		filaSugerencias = undefined;
		// Adjunta las imagenes elegidas con el boton al mensaje que se envia.
		if (adjuntos.length && !evento.text.trim().startsWith("/")) {
			const lista = adjuntos.splice(0);
			instalarAdjuntos(ctx);
			const imagenes = [...(evento.images ?? []), ...lista.flatMap((a) => (a.imagen ? [a.imagen] : []))];
			const documentos = textoDocumentos(lista.filter((a) => !a.imagen));
			const texto = documentos ? `${evento.text}\n\n${documentos}` : evento.text;
			return { action: "transform" as const, text: texto, images: imagenes };
		}
		return undefined;
	});

	// Instrucciones del archivo elegido y aviso del modo "solo mirar".
	pi.on("before_agent_start", (evento) => {
		const p = leerPreferencias();
		const opciones = evento.systemPromptOptions;
		if (p.instrucciones && p.instruccionesActivas && existsSync(p.instrucciones)) {
			try {
				let contenido = readFileSync(p.instrucciones, "utf8");
				if (contenido.length > MAX_INSTRUCCIONES) contenido = tr("{0}\n…(archivo recortado)", [contenido.slice(0, MAX_INSTRUCCIONES)]);
				opciones.contextFiles = [...opciones.contextFiles, { path: p.instrucciones, content: contenido }];
			} catch {
				// Si no se puede leer, se sigue sin instrucciones.
			}
		}
		if (idioma !== "en") {
			opciones.appendSystemPrompt = `${opciones.appendSystemPrompt ?? ""}\n\nThe user's interface language is ${NOMBRE_IDIOMA_EN[idioma] ?? idioma}. Reply in that language unless the user writes in another one.`.trim();
		}
		if (p.permisos === "lectura") {
			opciones.appendSystemPrompt = `${opciones.appendSystemPrompt ?? ""}\n\nThe user enabled read-only mode: you can read and search files, but you must not modify files or run commands. If a change is needed, explain exactly what you would do.`.trim();
		}
		return undefined;
	});

	pi.on("tool_call", async (evento, ctx) => {
		const modo = leerPreferencias().permisos;
		if (modo === "libre" || !necesitaPermiso(evento.toolName)) return undefined;
		if (modo === "lectura") {
			return { block: true, reason: ("Read-only mode is on (hilosenda «Solo mirar»). Do not modify files or run commands; describe the change instead.") };
		}
		if (permitidosEnSesion.has(evento.toolName) || !ctx.hasUI) return undefined;

		// Un permiso a la vez, aunque la IA pida varias herramientas en paralelo.
		const turno = colaPermisos.then(async () => {
			if (permitidosEnSesion.has(evento.toolName)) return undefined;
			const { titulo, detalle } = describirLlamada(evento.toolName, evento.input as Record<string, unknown>);
			const ui = dialogos(ctx);
			const respuesta = await ui.botones({
				titulo,
				explicacion: detalle,
				grande: false,
				botones: [
					{ id: "si", etiqueta: tr("Permitir"), tipo: "primario", ayuda: tr("Solo esta vez") },
					{ id: "siempre", etiqueta: tr("Permitir siempre en este chat"), ayuda: tr("No volver a preguntar por «{0}» en esta conversacion", [evento.toolName]) },
					{ id: "no", etiqueta: tr("No permitir"), tipo: "peligro", ayuda: tr("La IA buscara otra forma") },
					{ id: "explicar", etiqueta: tr("No, y decirle por que"), ayuda: tr("Escribe que prefieres que haga") },
				],
			});
			if (respuesta === "si") return undefined;
			if (respuesta === "siempre") {
				permitidosEnSesion.add(evento.toolName);
				return undefined;
			}
			if (respuesta === "explicar") {
				const motivo = await ui.preguntar({ titulo: tr("¿Por que no?"), etiqueta: tr("Explicale a la IA que prefieres:") });
				return { block: true, reason: `The user did not allow this.${motivo ? ` User says: ${motivo}` : ""}` };
			}
			return { block: true, reason: "The user did not allow this action." };
		});
		colaPermisos = turno.catch(() => undefined);
		return turno;
	});

	// --- Comandos en español (tambien los usan los botones) ----------------------------

	pi.registerCommand("menu", { description: tr("Muestra todas las funciones con explicaciones (hilosenda)"), handler: async (_a, ctx) => mostrarMenu(ctx) });
	pi.registerCommand("modelo", {
		description: tr("Elige el modelo de IA; acepta texto para buscar (hilosenda)"),
		handler: async (args, ctx) => elegirModelo(ctx, args?.trim() || undefined),
	});
	pi.registerCommand("razonamiento", {
		description: tr("Cuanto piensa la IA: apagado, bajo, medio, alto... (hilosenda)"),
		handler: async (args, ctx) => elegirRazonamiento(ctx, args?.trim() || undefined),
	});
	pi.registerCommand("carpeta", {
		description: tr("Abre el chat en otra carpeta; acepta una ruta (hilosenda)"),
		handler: async (args, ctx) => cambiarCarpeta(ctx, args?.trim() || undefined),
	});
	pi.registerCommand("permisos", {
		description: tr("Preguntar antes, libre o solo mirar (hilosenda)"),
		handler: async (args, ctx) => {
			const pedido = args?.trim().toLowerCase();
			const modo = PERMISOS.find((p) => p.id === pedido || p.corto.toLowerCase() === pedido || aIdentificador(p.etiqueta) === aIdentificador(pedido ?? ""));
			if (modo) {
				guardarPreferencias({ permisos: modo.id as "preguntar" | "libre" | "lectura" });
				aplicarModoPermisos(ctx);
				ctx.ui.notify(`Permisos: ${modo.etiqueta}`, "info");
				return;
			}
			await ejecutarAccion(ctx, "permisos");
		},
	});
	pi.registerCommand("instrucciones", {
		description: tr("Elige un archivo .md o .txt con reglas para la IA (hilosenda)"),
		handler: async (args, ctx) => {
			const ruta = args?.trim();
			if (ruta) {
				if (!existsSync(ruta)) return ctx.ui.notify(tr("No existe: {0}", [ruta]), "error");
				guardarPreferencias({ instrucciones: ruta, instruccionesActivas: true });
				pedirRenderBarra?.();
				return ctx.ui.notify(tr("La IA seguira las instrucciones de {0}", [nombreCorto(ruta)]), "info");
			}
			await ejecutarAccion(ctx, "instrucciones");
		},
	});
	pi.registerCommand("historial", { description: tr("Busca y continua conversaciones anteriores (hilosenda)"), handler: async (_a, ctx) => abrirHistorial(ctx) });
	pi.registerCommand("conectar", { description: tr("Conecta una IA nueva y detecta sus modelos (hilosenda)"), handler: async (_a, ctx) => ejecutarAccion(ctx, "conectar") });
	pi.registerCommand("ajustes", { description: tr("Ajustes de hilosenda (hilosenda)"), handler: async (_a, ctx) => ajustes(ctx) });
	pi.registerCommand("ayuda", { description: tr("Como usar hilosenda (hilosenda)"), handler: async (_a, ctx) => ejecutarAccion(ctx, "ayuda") });
	pi.registerCommand("inicio", { description: tr("Vuelve a la pantalla de inicio de hilosenda"), handler: async (_a, ctx) => ejecutarAccion(ctx, "inicio") });
	pi.registerCommand("nuevo", {
		description: tr("Empieza una conversacion nueva (hilosenda)"),
		handler: async (_a, ctx) => {
			await ctx.newSession();
		},
	});

	pi.registerShortcut("f1", {
		description: tr("Abrir el menu de hilosenda"),
		handler: (ctx) => mostrarMenu(ctx),
	});
}
