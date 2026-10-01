// Pantalla de inicio de hilosenda.
//
// Es el "centro de control": desde aqui se elige carpeta, se conecta una IA, se
// abre el historial y se entra al chat. Al salir del chat se vuelve aqui.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { ProcessTerminal, TuiAltScreen } from "@earendil-works/pi-tui";
import { buscarServidoresLocales, describirModelo } from "../core/deteccion.js";
import { leerAjustesPi, guardarAjustesPi, leerClaves, leerModelosJson, modeloPorDefecto, quitarClave, quitarProveedor } from "../core/pi-config.js";
import { abrirPi, listarConversaciones, listarModelosPi, rutaCliPi, versionHilosenda } from "../core/pi.js";
import { agregarReciente, guardarPreferencias, leerPreferencias, quitarReciente, recientesExistentes } from "../core/preferencias.js";
import { proveedorPorId } from "../core/proveedores.js";
import { archivoPreferencias, carpetaPi } from "../core/rutas.js";
import { conectarIA } from "../flujos/conectar.js";
import { elegirCarpeta, nombreCorto } from "../flujos/explorar.js";
import { elegirPermisos, gestionarInstrucciones, NIVELES, PERMISOS } from "../flujos/opciones.js";
import { AnimacionInicio } from "../ui/animacion.js";
import { crearDialogos } from "../ui/dialogos.js";
import { estiloBase } from "../ui/style.js";
import { acortarRuta, FilaBotones, Logo, Pantalla, Parrafo, Seccion } from "../ui/widgets.js";
import { AYUDA_GENERAL } from "../textos.js";

/** "hace 5 min", "ayer", "12/03/2026". */
export function cuando(fecha) {
	const ms = Date.now() - new Date(fecha).getTime();
	const min = Math.round(ms / 60000);
	if (min < 1) return "ahora mismo";
	if (min < 60) return `hace ${min} min`;
	const horas = Math.round(min / 60);
	if (horas < 24) return `hace ${horas} h`;
	const dias = Math.round(horas / 24);
	if (dias === 1) return "ayer";
	if (dias < 7) return `hace ${dias} dias`;
	return new Date(fecha).toLocaleDateString("es");
}

function grupoFecha(fecha) {
	const dias = (Date.now() - new Date(fecha).getTime()) / 86400000;
	if (dias < 1) return "Hoy";
	if (dias < 2) return "Ayer";
	if (dias < 7) return "Esta semana";
	if (dias < 31) return "Este mes";
	return "Mas antiguas";
}

const rutaBonita = (ruta) => (ruta.startsWith(homedir()) ? `~${ruta.slice(homedir().length)}` : ruta);

export class App {
	/** @param {{ carpeta?: string, animacion?: boolean }} opciones */
	constructor(opciones = {}) {
		this.estilo = estiloBase;
		this.preferencias = leerPreferencias();
		const desdeConsola = process.cwd() !== homedir() ? process.cwd() : undefined;
		this.carpeta = opciones.carpeta ?? desdeConsola ?? recientesExistentes()[0]?.ruta;
		this.animacion = opciones.animacion ?? this.preferencias.animacion !== false;
		this.modelos = [];
		this.locales = [];
		this.mensaje = undefined;
		this.tui = undefined;
		this.terminal = undefined;
		this.dialogos = crearDialogos(this.estilo, (construir) => this.mostrar(construir));
		this.terminado = undefined;
	}

	// --- Consola ------------------------------------------------------------------

	encender() {
		this.terminal = new ProcessTerminal();
		this.tui = new TuiAltScreen(this.terminal, false, undefined, { mouse: true, copyOnSelect: false });
		this.tui.start();
		this.terminal.setTitle?.("hilosenda");
	}

	apagar() {
		if (!this.tui) return;
		this.tui.clear();
		this.tui.stop();
		this.tui = undefined;
	}

	poner(componente) {
		componente.tui = this.tui;
		this.tui.clear();
		this.tui.addChild(componente);
		this.tui.setFocus(componente);
		this.tui.requestRender(true);
	}

	/** @type {import("../ui/dialogos.js").Mostrar} */
	mostrar(construir) {
		return new Promise((resolver) => {
			let cerrado = false;
			const pantalla = construir((valor) => {
				if (cerrado) return;
				cerrado = true;
				resolver(valor);
			});
			this.poner(pantalla);
		});
	}

	// --- Ciclo principal --------------------------------------------------------------

	/** @param {{ entrarDirecto?: boolean, argumentos?: string[] }} [opciones] */
	async ejecutar({ entrarDirecto = false, argumentos = [] } = {}) {
		this.encender();
		if (this.animacion && !entrarDirecto) await this.reproducirAnimacion();
		this.refrescarDatos();
		if (entrarDirecto && this.carpeta) await this.entrarAlChat({ argumentos });
		while (true) {
			const accion = await this.pantallaInicio();
			if (accion === "salir") break;
			await this.atender(accion);
		}
		this.apagar();
	}

	reproducirAnimacion() {
		return new Promise((resolver) => {
			const animacion = new AnimacionInicio({ alTerminar: resolver, alto: () => this.terminal.rows, version: versionHilosenda() });
			this.poner(animacion);
			animacion.empezar(this.tui);
		});
	}

	/** Actualiza en segundo plano la lista de modelos y la IA local detectada. */
	refrescarDatos() {
		listarModelosPi()
			.then((modelos) => {
				this.modelos = modelos;
				this.tui?.requestRender();
			})
			.catch(() => {});
		if (this.preferencias.buscarModelosLocales) {
			buscarServidoresLocales()
				.then((locales) => {
					const conectados = leerModelosJson().providers;
					this.locales = locales.filter((l) => !conectados[l.proveedor.id]);
					this.tui?.requestRender();
				})
				.catch(() => {});
		}
	}

	resumenModelo() {
		const porDefecto = modeloPorDefecto();
		if (porDefecto) {
			const nivel = NIVELES.find((n) => n.id === porDefecto.razonamiento)?.etiqueta ?? "Medio";
			return `${this.estilo.texto(`${porDefecto.proveedor} / ${porDefecto.modelo}`)}  ${this.estilo.tenue(`razonamiento: ${nivel}`)}`;
		}
		if (this.modelos.length > 0) return this.estilo.suave(`Automatico (${this.modelos.length} modelos disponibles)`);
		return this.estilo.aviso("Ninguna IA conectada todavia. Pulsa «Conectar una IA».");
	}

	pantallaInicio() {
		return this.mostrar((cerrar) => {
			const e = this.estilo;
			const pantalla = new Pantalla(e, {
				alSalir: () => cerrar("salir"),
				pie: "Haz clic en un boton · o usa Flechas/Tab y Enter · Esc para salir",
			});
			pantalla.margen = 3;
			pantalla.agregar(new Logo(e, "tu senda con la IA, hilo a hilo"));
			pantalla.agregar(new Seccion(e, "Tu trabajo"));
			pantalla.agregar(
				new Parrafo((ancho) => {
					const p = this.preferencias;
					const carpeta = this.carpeta ? e.texto(acortarRuta(rutaBonita(this.carpeta), ancho - 15)) : e.aviso("Sin elegir. Pulsa «Elegir carpeta».");
					const instrucciones = p.instrucciones
						? `${e.texto(nombreCorto(p.instrucciones))}${p.instruccionesActivas ? "" : e.tenue(" (desactivadas)")}`
						: e.tenue("ninguna (opcional)");
					const permisos = PERMISOS.find((x) => x.id === p.permisos)?.etiqueta ?? "Preguntarme antes";
					const lineas = [
						`${e.suave("Carpeta:       ")}${carpeta}`,
						`${e.suave("IA / modelo:   ")}${this.resumenModelo()}`,
						`${e.suave("Instrucciones: ")}${instrucciones}`,
						`${e.suave("Permisos:      ")}${e.texto(permisos)}`,
					];
					for (const local of this.locales) {
						lineas.push(
							"",
							e.exito(`✓ Encontre ${local.proveedor.nombre} en tu computadora con ${local.deteccion.modelos.length} modelos. Pulsa «Conectar una IA» para usarlo.`),
						);
					}
					if (this.mensaje) lineas.push("", this.mensaje);
					return lineas.join("\n");
				}),
			);
			pantalla.agregar(new Parrafo(""));
			pantalla.agregar(
				new FilaBotones(e, [{ id: "chat", etiqueta: "▶  Empezar a chatear", tipo: "primario", ayuda: "Abre el chat con la IA en la carpeta elegida" }], {
					grande: true,
					centrado: true,
					mostrarAyuda: false,
					alPulsar: cerrar,
				}),
			);
			pantalla.agregar(new Parrafo(""));
			pantalla.agregar(
				new FilaBotones(
					e,
					[
						{ id: "carpeta", etiqueta: "Elegir carpeta", ayuda: "Elige en que carpeta (proyecto) va a trabajar la IA" },
						{ id: "recientes", etiqueta: "Carpetas recientes", ayuda: "Vuelve a una carpeta que usaste antes" },
						{ id: "historial", etiqueta: "Conversaciones anteriores", ayuda: "Retoma un chat anterior justo donde lo dejaste" },
						{ id: "conectar", etiqueta: "Conectar una IA", ayuda: "Agrega Ollama, Claude, GPT, Gemini o cualquier otra IA; sus modelos se detectan solos" },
						{ id: "modelo", etiqueta: "Elegir modelo", ayuda: "Elige con que modelo de IA empezar" },
						{ id: "razonamiento", etiqueta: "Razonamiento", ayuda: "Cuanto piensa la IA antes de responder" },
						{ id: "instrucciones", etiqueta: "Instrucciones", ayuda: "Elige un archivo .md o .txt con reglas que la IA siempre seguira" },
						{ id: "permisos", etiqueta: "Permisos", ayuda: "Decide si la IA te pide permiso antes de cambiar cosas" },
						{ id: "ajustes", etiqueta: "Ajustes", ayuda: "Tema, barra de botones, conexiones y mas" },
						{ id: "ayuda", etiqueta: "Ayuda", ayuda: "Explicacion paso a paso para empezar" },
						{ id: "salir", etiqueta: "Salir", tipo: "suave", ayuda: "Cierra hilosenda" },
					],
					{ mostrarAyuda: true, alPulsar: cerrar },
				),
			);
			// El foco empieza en el boton grande.
			return pantalla;
		});
	}

	async atender(accion) {
		this.mensaje = undefined;
		const ui = this.dialogos;
		switch (accion) {
			case "chat":
				await this.entrarAlChat();
				break;
			case "carpeta": {
				const ruta = await elegirCarpeta(ui, { inicio: this.carpeta, ventana: this.preferencias.selectorGrafico });
				if (ruta) this.usarCarpeta(ruta);
				break;
			}
			case "recientes":
				await this.elegirReciente();
				break;
			case "historial":
				await this.abrirHistorial();
				break;
			case "conectar":
				await this.conectar();
				break;
			case "modelo":
				await this.elegirModelo();
				break;
			case "razonamiento":
				await this.elegirRazonamiento();
				break;
			case "instrucciones":
				await this.gestionarInstrucciones();
				break;
			case "permisos":
				await this.elegirPermisos();
				break;
			case "ajustes":
				await this.ajustes();
				break;
			case "ayuda":
				await ui.informar({ titulo: "Como usar hilosenda", texto: AYUDA_GENERAL });
				break;
		}
	}

	usarCarpeta(ruta) {
		this.carpeta = ruta;
		this.preferencias = agregarReciente(ruta);
		this.mensaje = this.estilo.exito(`✓ Carpeta elegida: ${rutaBonita(ruta)}`);
	}

	// --- Chat ---------------------------------------------------------------------------

	/**
	 * Abre Pi. Al terminar, atiende los pedidos de la extension (cambiar de carpeta,
	 * abrir otra conversacion) y vuelve a la pantalla de inicio.
	 * @param {{ argumentos?: string[], alIniciar?: string, carpeta?: string }} [opciones]
	 */
	async entrarAlChat(opciones = {}) {
		if (!opciones.carpeta && !this.carpeta) {
			const ruta = await elegirCarpeta(this.dialogos, { ventana: this.preferencias.selectorGrafico });
			if (!ruta) return;
			this.usarCarpeta(ruta);
		}
		if (!modeloPorDefecto() && this.modelos.length === 0 && !opciones.alIniciar) {
			const modelos = await this.dialogos.esperar("Revisando que IA tienes conectada…", listarModelosPi());
			this.modelos = modelos;
			if (modelos.length === 0) {
				const quiere = await this.dialogos.confirmar({
					titulo: "Primero conecta una IA",
					explicacion: "Para chatear hace falta al menos una IA. Es un paso de un minuto. ¿Lo hacemos ahora?",
					si: "Si, conectar una IA",
					no: "Ahora no",
				});
				if (!quiere) return;
				if (!(await this.conectar())) return;
			}
		}

		let carpeta = opciones.carpeta ?? this.carpeta;
		let argumentos = opciones.argumentos ?? [];
		let alIniciar = opciones.alIniciar;
		while (true) {
			if (!existsSync(carpeta)) {
				await this.dialogos.informar({ titulo: "La carpeta ya no existe", texto: carpeta });
				return;
			}
			agregarReciente(carpeta);
			this.apagar();
			const { traspaso } = await abrirPi({ carpeta, argumentos, alIniciar });
			this.encender();
			this.preferencias = leerPreferencias();
			if (traspaso?.accion === "carpeta") {
				carpeta = traspaso.ruta;
				this.usarCarpeta(carpeta);
				argumentos = [];
				alIniciar = undefined;
				continue;
			}
			if (traspaso?.accion === "conversacion") {
				carpeta = traspaso.carpeta && existsSync(traspaso.carpeta) ? traspaso.carpeta : carpeta;
				argumentos = ["--session", traspaso.ruta];
				alIniciar = undefined;
				continue;
			}
			break;
		}
		this.refrescarDatos();
	}

	async elegirReciente() {
		const recientes = recientesExistentes();
		const eleccion = await this.dialogos.elegir({
			titulo: "Carpetas recientes",
			elementos: recientes.map((r) => ({ id: r.ruta, etiqueta: basename(r.ruta) || r.ruta, detalle: `${rutaBonita(r.ruta)} · ${cuando(r.fecha)}`, valor: r.ruta })),
			vacio: "Todavia no abriste ninguna carpeta.",
			extras: recientes.length ? [{ id: "olvidar", etiqueta: "Olvidar una carpeta" }] : [],
		});
		if (typeof eleccion === "string") this.usarCarpeta(eleccion);
		else if (eleccion?.boton === "olvidar") {
			const olvidar = await this.dialogos.elegir({
				titulo: "¿Que carpeta quitar de la lista?",
				explicacion: "Solo se quita de la lista; la carpeta y sus archivos no se tocan.",
				elementos: recientes.map((r) => ({ id: r.ruta, etiqueta: rutaBonita(r.ruta), valor: r.ruta })),
			});
			if (typeof olvidar === "string") this.preferencias = quitarReciente(olvidar);
		}
	}

	async abrirHistorial() {
		const sesiones = await this.dialogos.esperar("Cargando tus conversaciones…", listarConversaciones());
		const elementos = sesiones.map((s) => {
			const titulo = (s.name || s.firstMessage || "(conversacion vacia)").replace(/\s+/g, " ").trim();
			return {
				id: s.path,
				etiqueta: titulo.length > 60 ? `${titulo.slice(0, 59)}…` : titulo,
				detalle: `${cuando(s.modified)} · ${s.messageCount} mensajes${s.cwd ? ` · en ${basename(s.cwd) || s.cwd}` : ""}`,
				grupo: grupoFecha(s.modified),
				buscarEn: s.allMessagesText?.slice(0, 4000),
				valor: s,
			};
		});
		const elegida = await this.dialogos.elegir({
			titulo: "Conversaciones anteriores",
			explicacion: "Haz clic en una conversacion para continuarla. Escribe para buscar por cualquier palabra que se haya dicho.",
			elementos,
			buscador: true,
			vacio: "Todavia no hay conversaciones. ¡Empieza una con «Empezar a chatear»!",
		});
		if (!elegida || elegida.boton) return;
		const carpeta = elegida.cwd && existsSync(elegida.cwd) ? elegida.cwd : this.carpeta;
		if (carpeta) this.usarCarpeta(carpeta);
		await this.entrarAlChat({ carpeta, argumentos: ["--session", elegida.path] });
	}

	// --- Modelos ------------------------------------------------------------------------

	/** @returns {Promise<boolean>} true si quedo una IA conectada. */
	async conectar() {
		const resultado = await conectarIA(this.dialogos, {
			catalogoPi: listarModelosPi,
			buscarLocales: this.preferencias.buscarModelosLocales,
		});
		if (!resultado) return false;
		if ("accion" in resultado) {
			if (!this.carpeta) this.usarCarpeta(homedir());
			await this.entrarAlChat({ alIniciar: "/login" });
			return true;
		}
		guardarAjustesPi({ defaultProvider: resultado.proveedor, defaultModel: resultado.modelo });
		this.locales = this.locales.filter((l) => l.proveedor.id !== resultado.proveedor);
		this.mensaje = this.estilo.exito(`✓ Listo: usaras ${resultado.proveedor} / ${resultado.modelo}`);
		this.refrescarDatos();
		return true;
	}

	async elegirModelo() {
		const modelos = await this.dialogos.esperar("Cargando modelos disponibles…", listarModelosPi());
		this.modelos = modelos;
		const actual = modeloPorDefecto();
		const personalizados = leerModelosJson().providers;
		const elementos = modelos.map((m) => {
			const elegido = actual && actual.proveedor === m.proveedor && actual.modelo === m.id;
			const extra = personalizados[m.proveedor]?.models?.find((x) => x.id === m.id);
			const detalle = [m.contexto && `${m.contexto} de contexto`, m.razona && "razona", m.imagenes && "ve imagenes"].filter(Boolean).join(" · ") || (extra ? describirModelo({ id: m.id }) : "");
			return {
				id: `${m.proveedor}/${m.id}`,
				etiqueta: `${elegido ? "● " : ""}${m.id}`,
				detalle,
				grupo: proveedorPorId(m.proveedor)?.nombre ?? personalizados[m.proveedor]?.name ?? m.proveedor,
				buscarEn: m.proveedor,
				valor: m,
			};
		});
		const eleccion = await this.dialogos.elegir({
			titulo: "Elegir modelo",
			explicacion: "Estos son los modelos que puedes usar ahora. Escribe para buscar. ¿No ves el que quieres? Pulsa «Conectar otra IA».",
			elementos,
			buscador: true,
			vacio: "No hay modelos disponibles. Conecta una IA primero.",
			inicial: actual ? `${actual.proveedor}/${actual.modelo}` : undefined,
			extras: [{ id: "conectar", etiqueta: "+ Conectar otra IA", tipo: "primario" }, ...(actual ? [{ id: "auto", etiqueta: "Elegir automaticamente" }] : [])],
		});
		if (eleccion?.boton === "conectar") return void (await this.conectar());
		if (eleccion?.boton === "auto") {
			guardarAjustesPi({ defaultProvider: undefined, defaultModel: undefined });
			return;
		}
		if (!eleccion || eleccion.boton) return;
		guardarAjustesPi({ defaultProvider: eleccion.proveedor, defaultModel: eleccion.id });
		this.mensaje = this.estilo.exito(`✓ Modelo elegido: ${eleccion.proveedor} / ${eleccion.id}`);
	}

	async elegirRazonamiento() {
		const actual = leerAjustesPi().defaultThinkingLevel ?? "medium";
		const eleccion = await this.dialogos.elegir({
			titulo: "¿Cuanto debe pensar la IA antes de responder?",
			explicacion: "Mas razonamiento da mejores respuestas en problemas dificiles, pero tarda mas y gasta mas. Si el modelo no lo admite, se ajusta solo.",
			elementos: NIVELES.map((n) => ({ id: n.id, etiqueta: `${n.id === actual ? "● " : "  "}${n.etiqueta}`, detalle: n.detalle, valor: n.id })),
			inicial: actual,
		});
		if (typeof eleccion === "string") guardarAjustesPi({ defaultThinkingLevel: eleccion });
	}

	async elegirPermisos() {
		await elegirPermisos(this.dialogos);
		this.preferencias = leerPreferencias();
	}

	async gestionarInstrucciones() {
		const resultado = await gestionarInstrucciones(this.dialogos, { carpeta: this.carpeta });
		this.preferencias = leerPreferencias();
		if (resultado) this.mensaje = this.estilo.exito(`✓ ${resultado}`);
	}

	// --- Ajustes ------------------------------------------------------------------------

	async ajustes() {
		while (true) {
			const p = (this.preferencias = leerPreferencias());
			const piAjustes = leerAjustesPi();
			const siNo = (v) => (v ? "Si" : "No");
			const tema = { system: "Automatico (como la consola)", dark: "Oscuro", light: "Claro" }[piAjustes.theme ?? "system"] ?? piAjustes.theme;
			const eleccion = await this.dialogos.elegir({
				titulo: "Ajustes",
				explicacion: "Haz clic en un ajuste para cambiarlo.",
				elementos: [
					{ id: "tema", etiqueta: "Tema de colores", detalle: tema, grupo: "Apariencia", valor: "tema" },
					{ id: "barra", etiqueta: "Barra de botones en el chat", detalle: siNo(p.barraBotones), grupo: "Apariencia", valor: "barra" },
					{ id: "principiante", etiqueta: "Consejos para principiantes", detalle: siNo(p.modoPrincipiante), grupo: "Apariencia", valor: "principiante" },
					{ id: "animacion", etiqueta: "Animacion de inicio", detalle: siNo(p.animacion !== false), grupo: "Apariencia", valor: "animacion" },
					{ id: "permisos", etiqueta: "Permisos de la IA", detalle: PERMISOS.find((x) => x.id === p.permisos)?.etiqueta, grupo: "IA", valor: "permisos" },
					{ id: "razonamiento", etiqueta: "Razonamiento por defecto", detalle: NIVELES.find((n) => n.id === (piAjustes.defaultThinkingLevel ?? "medium"))?.etiqueta, grupo: "IA", valor: "razonamiento" },
					{ id: "conexiones", etiqueta: "Mis conexiones de IA", detalle: "Ver o quitar servicios conectados", grupo: "IA", valor: "conexiones" },
					{ id: "locales", etiqueta: "Buscar IA local al iniciar", detalle: siNo(p.buscarModelosLocales), grupo: "Sistema", valor: "locales" },
					{ id: "ventana", etiqueta: "Ventana del sistema para elegir carpetas", detalle: siNo(p.selectorGrafico), grupo: "Sistema", valor: "ventana" },
					{ id: "info", etiqueta: "Informacion del sistema", detalle: "Versiones y ubicacion de archivos", grupo: "Sistema", valor: "info" },
				],
			});
			if (eleccion === undefined || typeof eleccion === "object") return;
			if (eleccion === "tema") {
				const t = await this.dialogos.elegir({
					titulo: "Tema de colores (dentro del chat)",
					elementos: [
						{ id: "system", etiqueta: "Automatico", detalle: "Igual que tu consola", valor: "system" },
						{ id: "dark", etiqueta: "Oscuro", valor: "dark" },
						{ id: "light", etiqueta: "Claro", valor: "light" },
					],
				});
				if (typeof t === "string") guardarAjustesPi({ theme: t });
			} else if (eleccion === "barra") guardarPreferencias({ barraBotones: !p.barraBotones });
			else if (eleccion === "principiante") guardarPreferencias({ modoPrincipiante: !p.modoPrincipiante });
			else if (eleccion === "animacion") guardarPreferencias({ animacion: p.animacion === false });
			else if (eleccion === "locales") guardarPreferencias({ buscarModelosLocales: !p.buscarModelosLocales });
			else if (eleccion === "ventana") guardarPreferencias({ selectorGrafico: !p.selectorGrafico });
			else if (eleccion === "permisos") await this.elegirPermisos();
			else if (eleccion === "razonamiento") await this.elegirRazonamiento();
			else if (eleccion === "conexiones") await this.conexiones();
			else if (eleccion === "info") {
				const { cli, version } = rutaCliPi();
				await this.dialogos.informar({
					titulo: "Informacion del sistema",
					texto: [
						`hilosenda ${versionHilosenda()}  ·  Pi ${version}`,
						`Node.js ${process.versions.node}  ·  ${process.platform} ${process.arch}`,
						"",
						`Programa de Pi:      ${cli}`,
						`Configuracion de Pi: ${rutaBonita(carpetaPi())}`,
						`Preferencias:        ${rutaBonita(archivoPreferencias())}`,
					].join("\n"),
				});
			}
		}
	}

	async conexiones() {
		while (true) {
			const personalizados = leerModelosJson().providers;
			const claves = leerClaves();
			const elementos = [
				...Object.entries(personalizados).map(([id, p]) => ({
					id: `m:${id}`,
					etiqueta: p.name ?? id,
					detalle: `${p.models?.length ?? 0} modelos · ${p.baseUrl ?? ""}`,
					grupo: "Servicios agregados",
					valor: { tipo: "proveedor", id },
				})),
				...Object.entries(claves).map(([id, c]) => ({
					id: `k:${id}`,
					etiqueta: proveedorPorId(id)?.nombre ?? id,
					detalle: c.type === "oauth" ? "sesion iniciada con tu cuenta" : "clave API guardada",
					grupo: "Cuentas y claves",
					valor: { tipo: "clave", id },
				})),
			];
			const eleccion = await this.dialogos.elegir({
				titulo: "Mis conexiones de IA",
				explicacion: "Haz clic en una conexion para quitarla.",
				elementos,
				vacio: "No hay conexiones todavia.",
				extras: [{ id: "conectar", etiqueta: "+ Conectar una IA", tipo: "primario" }],
			});
			if (eleccion?.boton === "conectar") {
				await this.conectar();
				continue;
			}
			if (!eleccion || eleccion.boton) return;
			const quitar = await this.dialogos.confirmar({
				titulo: "¿Quitar esta conexion?",
				explicacion: eleccion.tipo === "clave" ? "Se borrara la clave o sesion guardada en esta computadora." : "Se quitara el servicio y sus modelos de la lista.",
				si: "Si, quitar",
				no: "Cancelar",
				peligro: true,
			});
			if (!quitar) continue;
			if (eleccion.tipo === "clave") quitarClave(eleccion.id);
			else quitarProveedor(eleccion.id);
			const porDefecto = modeloPorDefecto();
			if (porDefecto?.proveedor === eleccion.id) guardarAjustesPi({ defaultProvider: undefined, defaultModel: undefined });
		}
	}
}
