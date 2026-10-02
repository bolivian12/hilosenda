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
import { crearEstilo, esFondoClaro } from "../ui/style.js";
import { acortarRuta, FilaBotones, Logo, Mosaico, Pantalla, Parrafo, Tarjeta } from "../ui/widgets.js";
import { AYUDA_GENERAL } from "../textos.js";
import { IDIOMAS, idiomaDelSistema, localeFechas, tr } from "../i18n.js";

/** "hace 5 min", "ayer", "12/03/2026". */
export function cuando(fecha) {
	const ms = Date.now() - new Date(fecha).getTime();
	const min = Math.round(ms / 60000);
	if (min < 1) return tr("ahora mismo");
	if (min < 60) return tr("hace {0} min", [min]);
	const horas = Math.round(min / 60);
	if (horas < 24) return `hace ${horas} h`;
	const dias = Math.round(horas / 24);
	if (dias === 1) return "ayer";
	if (dias < 7) return tr("hace {0} dias", [dias]);
	return new Date(fecha).toLocaleDateString(localeFechas);
}

function grupoFecha(fecha) {
	const dias = (Date.now() - new Date(fecha).getTime()) / 86400000;
	if (dias < 1) return tr("Hoy");
	if (dias < 2) return tr("Ayer");
	if (dias < 7) return tr("Esta semana");
	if (dias < 31) return tr("Este mes");
	return tr("Mas antiguas");
}

const rutaBonita = (ruta) => (ruta.startsWith(homedir()) ? `~${ruta.slice(homedir().length)}` : ruta);

export class App {
	/** @param {{ carpeta?: string, animacion?: boolean }} opciones */
	constructor(opciones = {}) {
		this.preferencias = leerPreferencias();
		this.usarEstilo(this.preferencias.tema === "claro" ? false : true);
		const desdeConsola = process.cwd() !== homedir() ? process.cwd() : undefined;
		this.carpeta = opciones.carpeta ?? desdeConsola ?? recientesExistentes()[0]?.ruta;
		this.animacion = opciones.animacion ?? this.preferencias.animacion !== false;
		this.modelos = [];
		this.locales = [];
		this.mensaje = undefined;
		this.tui = undefined;
		this.terminal = undefined;
		this.terminado = undefined;
	}

	/** Cambia entre la paleta oscura y la clara. */
	usarEstilo(oscuro) {
		this.estilo = crearEstilo({ oscuro });
		this.dialogos = crearDialogos(this.estilo, (construir) => this.mostrar(construir), {
			altoPantalla: () => this.terminal?.rows ?? 24,
			altoLista: () => Math.max(5, Math.min(18, (this.terminal?.rows ?? 24) - 16)),
		});
	}

	/** Pregunta a la consola su color de fondo para elegir paleta clara u oscura. */
	async detectarFondo() {
		const tema = this.preferencias.tema ?? "auto";
		if (tema === "oscuro" || tema === "claro") return;
		// El fondo de la consola no cambia entre chats: se pregunta una sola vez.
		if (this.fondoDetectado) return;
		this.fondoDetectado = true;
		try {
			const colores = await this.tui.queryTerminalColors({ timeoutMs: 150 });
			if (colores?.background) this.usarEstilo(!esFondoClaro(colores.background));
		} catch {
			// Sin respuesta: se queda la paleta oscura.
		}
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
		await this.detectarFondo();
		if (this.animacion && !entrarDirecto) await this.reproducirAnimacion();
		this.refrescarDatos();
		if (!this.preferencias.bienvenidaVista && !entrarDirecto) await this.tutorial();
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
			const animacion = new AnimacionInicio({ alTerminar: resolver, alto: () => this.terminal.rows, version: versionHilosenda(), oscuro: this.estilo.oscuro });
			this.poner(animacion);
			animacion.empezar(this.tui);
		});
	}

	/**
	 * Carga en segundo plano (en otros procesos, sin congelar la pantalla) los modelos,
	 * las conversaciones y la IA local detectada. Los botones usan estos datos ya listos.
	 */
	refrescarDatos() {
		if (this.refrescoAplazado) {
			this.refrescoAplazado = false;
			setTimeout(() => this.refrescarDatos(), 400);
			return;
		}
		this.cargaModelos = listarModelosPi()
			.then((modelos) => {
				this.modelos = modelos;
				this.modelosListos = true;
				this.tui?.requestRender();
				return modelos;
			})
			.catch(() => this.modelos);
		this.cargaConversaciones = listarConversaciones()
			.then((sesiones) => {
				this.conversaciones = sesiones;
				return sesiones;
			})
			.catch(() => this.conversaciones ?? []);
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

	/** Filas de la tarjeta tr("Tu proyecto"). */
	filasProyecto(ancho) {
		const e = this.estilo;
		const p = this.preferencias;
		const etiqueta = (t) => ({ t: t.padEnd(15), fg: e.c.suave });
		const icono = (t, n) => ({ t: `${t}  `, fg: e.c.acentos[n], negrita: true });
		const porDefecto = modeloPorDefecto();
		const ia = porDefecto
			? [
					{ t: `${porDefecto.proveedor} / ${porDefecto.modelo}`, fg: e.c.texto, negrita: true },
					{ t: `   ${tr("razonamiento {0}", [(NIVELES.find((n) => n.id === porDefecto.razonamiento)?.etiqueta ?? tr("Medio")).toLowerCase()])}`, fg: e.c.tenue },
				]
			: this.modelos.length > 0
				? [{ t: tr("Automático · {0} modelos disponibles", [this.modelos.length]), fg: e.c.texto }]
				: [{ t: tr("Ninguna IA conectada todavía — pulsa «Conectar una IA»"), fg: e.c.aviso }];
		const filas = [
			[icono("▤", 0), etiqueta(tr("Carpeta")), this.carpeta ? { t: acortarRuta(rutaBonita(this.carpeta), ancho - 20), fg: e.c.texto, negrita: true } : { t: tr("sin elegir — pulsa «Elegir carpeta»"), fg: e.c.aviso }],
			[icono("◆", 4), etiqueta(tr("IA")), ...ia],
			[icono("≡", 6), etiqueta(tr("Instrucciones")), p.instrucciones ? { t: `${nombreCorto(p.instrucciones)}${p.instruccionesActivas ? "" : ` ${tr("(desactivadas)")}`}`, fg: e.c.texto } : { t: tr("ninguna (opcional)"), fg: e.c.tenue }],
			[icono("◈", 7), etiqueta(tr("Permisos")), { t: PERMISOS.find((x) => x.id === p.permisos)?.etiqueta ?? tr("Preguntarme antes"), fg: e.c.texto }],
		];
		for (const local of this.locales) {
			filas.push([{ t: "✓  ", fg: e.c.exito, negrita: true }, { t: tr("Encontré {0} en tu computadora con {1} modelos — pulsa «Conectar una IA»", [local.proveedor.nombre, local.deteccion.modelos.length]), fg: e.c.exito }]);
		}
		if (this.mensaje) {
			const color = this.mensaje.tipo === "error" ? e.c.error : this.mensaje.tipo === "aviso" ? e.c.aviso : e.c.exito;
			filas.push([{ t: "✓  ", fg: color, negrita: true }, { t: this.mensaje.texto, fg: color }]);
		}
		return filas;
	}

	pantallaInicio() {
		return this.mostrar((cerrar) => {
			const e = this.estilo;
			const filas = () => this.terminal?.rows ?? 40;
			const pantalla = new Pantalla(e, {
				titulo: tr("hilosenda"),
				alto: filas,
				alSalir: () => cerrar("salir"),
				pie: tr("Clic o Enter para elegir · Tab y flechas para moverte · Esc o ✕ para salir          hilosenda {0} · Pi {1}", [versionHilosenda(), rutaCliPi().version]),
			});
			pantalla.margen = 3;
			if (filas() >= 38) pantalla.agregar(new Logo(e, tr("tu senda con la IA, hilo a hilo")));
			pantalla.agregar(new Parrafo(""));
			pantalla.agregar(new Tarjeta(e, (ancho) => this.filasProyecto(ancho), { titulo: tr("Tu proyecto") }));
			pantalla.agregar(new Parrafo(""));
			pantalla.agregar(
				new FilaBotones(e, [{ id: "chat", etiqueta: tr("▶   Empezar a chatear"), tipo: "primario", ayuda: tr("Abre el chat con la IA en la carpeta elegida") }], {
					grande: true,
					centrado: true,
					alPulsar: cerrar,
				}),
			);
			pantalla.agregar(new Parrafo(""));
			pantalla.agregar(
				new Mosaico(
					e,
					[
						{ id: "carpeta", icono: "▤", titulo: tr("Elegir carpeta"), descripcion: tr("Dónde trabaja la IA"), color: 0 },
						{ id: "recientes", icono: "↺", titulo: tr("Recientes"), descripcion: tr("Vuelve a un proyecto"), color: 1 },
						{ id: "historial", icono: "❝", titulo: tr("Conversaciones"), descripcion: tr("Retoma un chat"), color: 2 },
						{ id: "conectar", icono: "✦", titulo: tr("Conectar una IA"), descripcion: tr("Ollama, GPT, Claude…"), color: 3 },
						{ id: "modelo", icono: "◆", titulo: tr("Elegir modelo"), descripcion: tr("Con qué IA hablar"), color: 4 },
						{ id: "razonamiento", icono: "◑", titulo: tr("Razonamiento"), descripcion: tr("Cuánto piensa antes"), color: 5 },
						{ id: "instrucciones", icono: "≡", titulo: tr("Instrucciones"), descripcion: tr("Reglas .md o .txt"), color: 6 },
						{ id: "permisos", icono: "◈", titulo: tr("Permisos"), descripcion: tr("Qué puede hacer sola"), color: 7 },
						{ id: "ajustes", icono: "⚙", titulo: tr("Ajustes"), descripcion: tr("Tema y conexiones"), color: 8 },
						{ id: "ayuda", icono: "?", titulo: tr("Ayuda"), descripcion: tr("Cómo empezar"), color: 9 },
					],
					{ alPulsar: cerrar, anchoMinimo: 27, columnasMax: 5 },
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
			case "ayuda": {
				const que = await ui.botones({
					titulo: tr("Ayuda"),
					explicacion: tr("¿Qué prefieres?"),
					botones: [
						{ id: "tutorial", etiqueta: tr("Ver el tutorial guiado"), tipo: "primario", ayuda: tr("Paso a paso, practicando con el ratón") },
						{ id: "texto", etiqueta: tr("Leer la guía"), ayuda: tr("Toda la explicación en una pantalla") },
					],
				});
				if (que === "tutorial") await this.tutorial();
				else if (que === "texto") await ui.informar({ titulo: tr("Cómo usar hilosenda"), texto: AYUDA_GENERAL });
				break;
			}
		}
	}

	usarCarpeta(ruta) {
		this.carpeta = ruta;
		this.preferencias = agregarReciente(ruta);
		this.mensaje = { texto: tr("Carpeta elegida: {0}", [rutaBonita(ruta)]), tipo: "exito" };
	}

	/**
	 * Tutorial guiado para la primera vez: practica el raton, conecta una IA, elige
	 * carpeta y explica el chat. Se puede saltar en cualquier momento.
	 */
	async tutorial() {
		const ui = this.dialogos;
		const total = 6;
		const paso = (n, titulo) => `Tutorial ${n}/${total} · ${titulo}`;
		const saltar = { id: "saltar", etiqueta: tr("Saltar tutorial"), tipo: "suave", ayuda: tr("Puedes volver a verlo desde Ayuda") };
		const terminar = () => {
			this.preferencias = guardarPreferencias({ bienvenidaVista: true });
		};

		// 1. Bienvenida
		let r = await ui.botones({
			titulo: paso(1, tr("Bienvenida")),
			explicacion:
				tr("¡Hola! hilosenda es un asistente de inteligencia artificial que trabaja con los archivos de tu computadora: explica, escribe, corrige y organiza por ti.\n\nEste tutorial dura un minuto. Todo se hace con el ratón: haz clic en los botones como en cualquier programa."),
			botones: [{ id: "seguir", etiqueta: tr("▶  Empezar el tutorial"), tipo: "primario", ayuda: tr("¡Así se ve un botón cuando pasas el ratón encima!") }, saltar],
		});
		if (r !== "seguir") return terminar();

		// 2. Practicar el raton
		let intentos = 0;
		while (true) {
			r = await ui.botones({
				titulo: paso(2, tr("Practica con el ratón")),
				explicacion:
					intentos === 0
						? tr("Mueve el ratón sobre los botones: se iluminan. Ahora haz clic en el botón verde que dice «¡Aquí!».")
						: tr("¡Casi! Ese no era. Busca el botón verde que dice «¡Aquí!» y haz clic en él."),
				botones: [
					{ id: "no1", etiqueta: tr("Este no") },
					{ id: "si", etiqueta: tr("¡Aquí!"), tipo: "primario" },
					{ id: "no2", etiqueta: tr("Este tampoco") },
				],
			});
			if (r === "si") break;
			if (r === undefined) return terminar();
			intentos++;
		}
		r = await ui.botones({
			titulo: paso(2, tr("Practica con el ratón")),
			explicacion:
				tr("¡Perfecto!\n\nTambién puedes usar el teclado si lo prefieres: las flechas o Tab para moverte, Enter para elegir y Esc para volver atrás. En las listas largas, la rueda del ratón sirve para desplazarte."),
			botones: [{ id: "seguir", etiqueta: tr("Siguiente  ▶"), tipo: "primario" }, saltar],
		});
		if (r !== "seguir") return terminar();

		// 3. Conectar una IA
		const hayIA = Boolean(modeloPorDefecto()) || this.modelos.length > 0;
		r = await ui.botones({
			titulo: paso(3, tr("Conecta una IA")),
			explicacion: hayIA
				? tr("Ya tienes una IA conectada, así que puedes saltar este paso. Si quieres agregar otra (por ejemplo una gratuita en tu PC con Ollama), pulsa «Conectar otra».")
				: tr("hilosenda necesita una IA para pensar. Puedes usar una gratis en tu computadora (Ollama) o una en internet (Claude, GPT, Gemini…) pegando su clave.\n\nNo te preocupes: el asistente te guía y detecta los modelos solo."),
			botones: [
				{ id: "conectar", etiqueta: hayIA ? tr("Conectar otra") : tr("Conectar una IA ahora"), tipo: hayIA ? "normal" : "primario" },
				{ id: "seguir", etiqueta: hayIA ? "Siguiente  ▶" : tr("Más tarde"), tipo: hayIA ? "primario" : "suave" },
				saltar,
			],
		});
		if (r === "saltar" || r === undefined) return terminar();
		if (r === "conectar") await this.conectar();

		// 4. Elegir carpeta
		r = await ui.botones({
			titulo: paso(4, tr("Elige una carpeta")),
			explicacion: `${tr("La IA trabaja dentro de una carpeta: la de tu proyecto, tus documentos, lo que quieras.")}${this.carpeta ? `\n\n${tr("Ahora mismo está elegida: {0}", [rutaBonita(this.carpeta)])}` : ""}\n\n${tr("Al pulsar «Elegir carpeta» se abre la ventana normal de tu sistema.")}`,
			botones: [
				{ id: "carpeta", etiqueta: tr("Elegir carpeta"), tipo: this.carpeta ? "normal" : "primario" },
				{ id: "seguir", etiqueta: this.carpeta ? tr("Usar esa y seguir  ▶") : tr("Más tarde"), tipo: this.carpeta ? "primario" : "suave" },
				saltar,
			],
		});
		if (r === "saltar" || r === undefined) return terminar();
		if (r === "carpeta") {
			const ruta = await elegirCarpeta(ui, { inicio: this.carpeta, ventana: this.preferencias.selectorGrafico });
			if (ruta) this.usarCarpeta(ruta);
		}

		// 5. El chat
		r = await ui.botones({
			titulo: paso(5, tr("Cómo es el chat")),
			explicacion: [
				tr("En el chat escribes abajo, como en WhatsApp, y pulsas «Enviar ▶» o Enter."),
				"",
				tr("A la derecha del cuadro de texto tienes botones para:"),
				tr("  ▣  adjuntar fotos o documentos (también puedes pegarlos con Ctrl+V o clic derecho)"),
				tr("  ◆  cambiar de modelo de IA"),
				tr("  ❝  ver tus chats anteriores"),
				tr("  ✚  empezar un chat nuevo"),
				tr("  ≡  ver todas las demás opciones"),
				"",
				tr("Si la IA quiere cambiar un archivo o ejecutar algo, primero te pide permiso con botones."),
				tr("Esc detiene a la IA en cualquier momento."),
			].join("\n"),
			botones: [{ id: "seguir", etiqueta: tr("Siguiente  ▶"), tipo: "primario" }, saltar],
		});
		if (r !== "seguir") return terminar();

		// 6. Fin
		r = await ui.botones({
			titulo: paso(6, tr("¡Listo!")),
			explicacion:
				tr("Ya sabes todo lo necesario. Ideas para tu primer mensaje:\n\n  «explícame qué hay en esta carpeta»\n  «ordena mis fotos por fecha»\n  «crea una página web sencilla sobre mi negocio»\n\nPuedes repetir este tutorial cuando quieras desde «Ayuda»."),
			botones: [
				{ id: "chat", etiqueta: tr("▶  Empezar a chatear"), tipo: "primario" },
				{ id: "inicio", etiqueta: tr("Ir a la pantalla de inicio") },
			],
		});
		terminar();
		if (r === "chat") await this.entrarAlChat();
	}

	/** Espera datos que se cargan en segundo plano, mostrando una pantalla solo si hace falta. */
	async esperarDatos(mensaje, promesa, listos) {
		if (listos) return promesa;
		const resultado = await this.dialogos.esperar(mensaje, promesa);
		return resultado ?? [];
	}

	/** Mensaje mientras Pi arranca, para que la consola no quede vacia ni muestre lo anterior. */
	pantallaCarga(mensaje) {
		const ancho = process.stdout.columns || 80;
		const alto = process.stdout.rows || 24;
		const e = this.estilo;
		const texto = `${e.acento("◆")}  ${e.texto(mensaje)}`;
		const x = Math.max(1, Math.floor((ancho - mensaje.length - 3) / 2));
		const y = Math.max(1, Math.floor(alto / 2));
		process.stdout.write(`\x1b[?1049h\x1b[2J\x1b[${y};${x}H${texto}\x1b[?25l`);
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
			const modelos = await this.esperarDatos(tr("Revisando que IA tienes conectada…"), this.cargaModelos ?? listarModelosPi(), this.modelosListos);
			if (modelos.length === 0) {
				const quiere = await this.dialogos.confirmar({
					titulo: tr("Primero conecta una IA"),
					explicacion: tr("Para chatear hace falta al menos una IA. Es un paso de un minuto. ¿Lo hacemos ahora?"),
					si: tr("Si, conectar una IA"),
					no: tr("Ahora no"),
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
				await this.dialogos.informar({ titulo: tr("La carpeta ya no existe"), texto: carpeta });
				return;
			}
			agregarReciente(carpeta);
			// Oculta la lista tecnica de extensiones al abrir el chat (solo si no se configuro antes).
			if (leerAjustesPi().quietStartup === undefined) guardarAjustesPi({ quietStartup: "header" });
			this.apagar();
			this.pantallaCarga(tr("Abriendo el chat en {0}…", [basename(carpeta) || carpeta]));
			const { traspaso } = await abrirPi({ carpeta, argumentos, alIniciar, tema: this.preferencias.tema });
			this.encender();
			this.preferencias = leerPreferencias();
			// Dibujar ya la pantalla de inicio; las recargas en segundo plano esperan un poco.
			this.refrescoAplazado = true;
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
			titulo: tr("Carpetas recientes"),
			elementos: recientes.map((r) => ({ id: r.ruta, etiqueta: basename(r.ruta) || r.ruta, detalle: `${rutaBonita(r.ruta)} · ${cuando(r.fecha)}`, valor: r.ruta })),
			vacio: tr("Todavia no abriste ninguna carpeta."),
			extras: recientes.length ? [{ id: "olvidar", etiqueta: tr("Olvidar una carpeta") }] : [],
		});
		if (typeof eleccion === "string") this.usarCarpeta(eleccion);
		else if (eleccion?.boton === "olvidar") {
			const olvidar = await this.dialogos.elegir({
				titulo: tr("¿Que carpeta quitar de la lista?"),
				explicacion: tr("Solo se quita de la lista; la carpeta y sus archivos no se tocan."),
				elementos: recientes.map((r) => ({ id: r.ruta, etiqueta: rutaBonita(r.ruta), valor: r.ruta })),
			});
			if (typeof olvidar === "string") this.preferencias = quitarReciente(olvidar);
		}
	}

	async abrirHistorial() {
		// Si ya estan cargadas aparecen al instante; si no, se espera a la carga en curso.
		const sesiones = this.conversaciones ?? (await this.esperarDatos(tr("Cargando tus conversaciones…"), this.cargaConversaciones ?? listarConversaciones(), false));
		this.cargaConversaciones = listarConversaciones().then((lista) => {
			this.conversaciones = lista;
			return lista;
		});
		const elementos = sesiones.map((s) => {
			const titulo = (s.name || s.firstMessage || tr("(conversacion vacia)")).replace(/\s+/g, " ").trim();
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
			titulo: tr("Conversaciones anteriores"),
			explicacion: tr("Haz clic en una conversacion para continuarla. Escribe para buscar por cualquier palabra que se haya dicho."),
			elementos,
			buscador: true,
			vacio: tr("Todavia no hay conversaciones. ¡Empieza una con «Empezar a chatear»!"),
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
		this.mensaje = { texto: `Listo: usaras ${resultado.proveedor} / ${resultado.modelo}`, tipo: "exito" };
		this.modelosListos = false;
		this.refrescarDatos();
		return true;
	}

	async elegirModelo() {
		const modelos = this.modelosListos ? this.modelos : await this.esperarDatos(tr("Cargando modelos disponibles…"), this.cargaModelos ?? listarModelosPi(), false);
		const actual = modeloPorDefecto();
		const personalizados = leerModelosJson().providers;
		const elementos = modelos.map((m) => {
			const elegido = actual && actual.proveedor === m.proveedor && actual.modelo === m.id;
			const extra = personalizados[m.proveedor]?.models?.find((x) => x.id === m.id);
			const detalle = [m.contexto && tr("{0} de contexto", [m.contexto]), m.razona && "razona", m.imagenes && tr("ve imagenes")].filter(Boolean).join(" · ") || (extra ? describirModelo({ id: m.id }) : "");
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
			titulo: tr("Elegir modelo"),
			explicacion: tr("Estos son los modelos que puedes usar ahora. Escribe para buscar. ¿No ves el que quieres? Pulsa «Conectar otra IA»."),
			elementos,
			buscador: true,
			vacio: tr("No hay modelos disponibles. Conecta una IA primero."),
			inicial: actual ? `${actual.proveedor}/${actual.modelo}` : undefined,
			extras: [{ id: "conectar", etiqueta: tr("+ Conectar otra IA"), tipo: "primario" }, ...(actual ? [{ id: "auto", etiqueta: tr("Elegir automaticamente") }] : [])],
		});
		if (eleccion?.boton === "conectar") return void (await this.conectar());
		if (eleccion?.boton === "auto") {
			guardarAjustesPi({ defaultProvider: undefined, defaultModel: undefined });
			return;
		}
		if (!eleccion || eleccion.boton) return;
		guardarAjustesPi({ defaultProvider: eleccion.proveedor, defaultModel: eleccion.id });
		this.mensaje = { texto: tr("Modelo elegido: {0} / {1}", [eleccion.proveedor, eleccion.id]), tipo: "exito" };
	}

	async elegirRazonamiento() {
		const actual = leerAjustesPi().defaultThinkingLevel ?? "medium";
		const eleccion = await this.dialogos.elegir({
			titulo: tr("¿Cuanto debe pensar la IA antes de responder?"),
			explicacion: tr("Mas razonamiento da mejores respuestas en problemas dificiles, pero tarda mas y gasta mas. Si el modelo no lo admite, se ajusta solo."),
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
		if (resultado) this.mensaje = { texto: `${resultado}`, tipo: "exito" };
	}

	// --- Ajustes ------------------------------------------------------------------------

	async ajustes() {
		while (true) {
			const p = (this.preferencias = leerPreferencias());
			const piAjustes = leerAjustesPi();
			const siNo = (v) => (v ? tr("Si") : tr("No"));
			const tema = { auto: tr("hilosenda automático"), oscuro: tr("hilosenda oscuro"), claro: tr("hilosenda claro"), pi: tr("el de Pi") }[p.tema ?? "auto"] ?? "hilosenda";
			const eleccion = await this.dialogos.elegir({
				titulo: tr("Ajustes"),
				explicacion: tr("Haz clic en un ajuste para cambiarlo."),
				elementos: [
					{ id: "tema", etiqueta: tr("Tema de colores"), detalle: tema, grupo: tr("Apariencia"), valor: "tema" },
					{ id: "barra", etiqueta: tr("Barra de botones en el chat"), detalle: siNo(p.barraBotones), grupo: tr("Apariencia"), valor: "barra" },
					{ id: "principiante", etiqueta: tr("Consejos para principiantes"), detalle: siNo(p.modoPrincipiante), grupo: tr("Apariencia"), valor: "principiante" },
					{ id: "idioma", etiqueta: tr("Idioma"), detalle: p.idioma && p.idioma !== "auto" ? IDIOMAS[p.idioma] : tr("Automático ({0})", [IDIOMAS[idiomaDelSistema()]]), grupo: tr("Apariencia"), valor: "idioma" },
					{ id: "animacion", etiqueta: tr("Animacion de inicio"), detalle: siNo(p.animacion !== false), grupo: tr("Apariencia"), valor: "animacion" },
					{ id: "permisos", etiqueta: tr("Permisos de la IA"), detalle: PERMISOS.find((x) => x.id === p.permisos)?.etiqueta, grupo: tr("IA"), valor: "permisos" },
					{ id: "razonamiento", etiqueta: tr("Razonamiento por defecto"), detalle: NIVELES.find((n) => n.id === (piAjustes.defaultThinkingLevel ?? "medium"))?.etiqueta, grupo: tr("IA"), valor: "razonamiento" },
					{ id: "conexiones", etiqueta: tr("Mis conexiones de IA"), detalle: tr("Ver o quitar servicios conectados"), grupo: tr("IA"), valor: "conexiones" },
					{ id: "locales", etiqueta: tr("Buscar IA local al iniciar"), detalle: siNo(p.buscarModelosLocales), grupo: tr("Sistema"), valor: "locales" },
					{ id: "ventana", etiqueta: tr("Ventana del sistema para elegir carpetas"), detalle: siNo(p.selectorGrafico), grupo: tr("Sistema"), valor: "ventana" },
					{ id: "info", etiqueta: tr("Informacion del sistema"), detalle: tr("Versiones y ubicacion de archivos"), grupo: tr("Sistema"), valor: "info" },
				],
			});
			if (eleccion === undefined || typeof eleccion === "object") return;
			if (eleccion === "tema") {
				const t = await this.dialogos.elegir({
					titulo: tr("Tema de colores"),
					explicacion: tr("Se usa en esta pantalla y en el chat."),
					elementos: [
						{ id: "auto", etiqueta: tr("hilosenda automático"), detalle: tr("Claro u oscuro según tu consola"), valor: "auto" },
						{ id: "oscuro", etiqueta: tr("hilosenda oscuro"), valor: "oscuro" },
						{ id: "claro", etiqueta: tr("hilosenda claro"), valor: "claro" },
						{ id: "pi", etiqueta: tr("El tema de Pi"), detalle: tr("El que elijas en los ajustes avanzados de Pi"), valor: "pi" },
					],
					inicial: p.tema ?? "auto",
				});
				if (typeof t === "string") {
					this.preferencias = guardarPreferencias({ tema: t });
					if (t === "oscuro" || t === "claro") this.usarEstilo(t === "oscuro");
					else await this.detectarFondo();
				}
			} else if (eleccion === "idioma") {
				const i = await this.dialogos.elegir({
					titulo: tr("Idioma"),
					explicacion: tr("El idioma cambia la próxima vez que abras hilosenda."),
					elementos: [
						{ id: "auto", etiqueta: tr("Automático ({0})", [IDIOMAS[idiomaDelSistema()]]), detalle: tr("El idioma de tu sistema"), valor: "auto" },
						...Object.entries(IDIOMAS).map(([id, nombre]) => ({ id, etiqueta: nombre, valor: id })),
					],
					inicial: p.idioma ?? "auto",
				});
				if (typeof i === "string") this.preferencias = guardarPreferencias({ idioma: i });
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
					titulo: tr("Informacion del sistema"),
					texto: [
						`hilosenda ${versionHilosenda()}  ·  Pi ${version}`,
						`Node.js ${process.versions.node}  ·  ${process.platform} ${process.arch}`,
						"",
						tr("Programa de Pi:      {0}", [cli]),
						tr("Configuracion de Pi: {0}", [rutaBonita(carpetaPi())]),
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
					grupo: tr("Servicios agregados"),
					valor: { tipo: "proveedor", id },
				})),
				...Object.entries(claves).map(([id, c]) => ({
					id: `k:${id}`,
					etiqueta: proveedorPorId(id)?.nombre ?? id,
					detalle: c.type === "oauth" ? tr("sesion iniciada con tu cuenta") : tr("clave API guardada"),
					grupo: tr("Cuentas y claves"),
					valor: { tipo: "clave", id },
				})),
			];
			const eleccion = await this.dialogos.elegir({
				titulo: tr("Mis conexiones de IA"),
				explicacion: tr("Haz clic en una conexion para quitarla."),
				elementos,
				vacio: tr("No hay conexiones todavia."),
				extras: [{ id: "conectar", etiqueta: tr("+ Conectar una IA"), tipo: "primario" }],
			});
			if (eleccion?.boton === "conectar") {
				await this.conectar();
				continue;
			}
			if (!eleccion || eleccion.boton) return;
			const quitar = await this.dialogos.confirmar({
				titulo: tr("¿Quitar esta conexion?"),
				explicacion: eleccion.tipo === "clave" ? tr("Se borrara la clave o sesion guardada en esta computadora.") : tr("Se quitara el servicio y sus modelos de la lista."),
				si: tr("Si, quitar"),
				no: tr("Cancelar"),
				peligro: true,
			});
			if (!quitar) continue;
			if (eleccion.tipo === "clave") quitarClave(eleccion.id);
			else quitarProveedor(eleccion.id);
			this.modelosListos = false;
			this.refrescarDatos();
			const porDefecto = modeloPorDefecto();
			if (porDefecto?.proveedor === eleccion.id) guardarAjustesPi({ defaultProvider: undefined, defaultModel: undefined });
		}
	}
}
