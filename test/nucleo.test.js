import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

// Carpetas temporales para no tocar la configuracion real.
const temporal = mkdtempSync(join(tmpdir(), "hilosenda-test-"));
process.env.HILOSENDA_HOME = join(temporal, "hilosenda");
process.env.PI_CODING_AGENT_DIR = join(temporal, "pi");

const { aModelosPi, detectarModelos, leerListaOpenAI, normalizarUrl } = await import("../src/core/deteccion.js");
const { leerTablaModelos } = await import("../src/core/pi.js");
const { aIdentificador } = await import("../src/flujos/conectar.js");
const { agregarReciente, leerPreferencias, guardarPreferencias } = await import("../src/core/preferencias.js");
const { guardarClave, guardarProveedor, leerClaves, leerModelosJson, guardarAjustesPi, leerAjustesPi } = await import("../src/core/pi-config.js");
const { acortarRuta, FilaBotones, Lista } = await import("../src/ui/widgets.js");
const { estiloBase } = await import("../src/ui/style.js");

describe("deteccion", () => {
	test("normaliza direcciones", () => {
		assert.equal(normalizarUrl("localhost:11434"), "http://localhost:11434");
		assert.equal(normalizarUrl("api.ejemplo.com/v1/"), "https://api.ejemplo.com/v1");
		assert.equal(normalizarUrl(" http://192.168.1.5:1234/v1 "), "http://192.168.1.5:1234/v1");
	});

	test("lee listas estilo OpenAI y descarta embeddings", () => {
		const modelos = leerListaOpenAI({
			data: [
				{ id: "b-modelo", context_length: 128000, architecture: { input_modalities: ["text", "image"] }, supported_parameters: ["reasoning"] },
				{ id: "text-embedding-3-small" },
				{ id: "a-modelo" },
			],
		});
		assert.deepEqual(
			modelos.map((m) => m.id),
			["a-modelo", "b-modelo"],
		);
		assert.deepEqual(modelos[1], { id: "b-modelo", contexto: 128000, vision: true, razonamiento: true });
		assert.deepEqual(aModelosPi(modelos)[1], { id: "b-modelo", contextWindow: 128000, input: ["text", "image"], reasoning: true });
	});

	describe("contra servidores falsos", () => {
		let servidor;
		let url;
		before(async () => {
			servidor = createServer((req, res) => {
				res.setHeader("content-type", "application/json");
				if (req.url === "/v1/models" && req.headers.authorization === "Bearer buena") {
					res.end(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }));
				} else if (req.url === "/v1/models" && req.headers.authorization) {
					res.statusCode = 401;
					res.end("{}");
				} else if (req.url === "/api/tags") {
					res.end(JSON.stringify({ models: [{ name: "llama3:latest", model: "llama3:latest" }, { name: "nomic-embed-text", model: "nomic-embed-text" }] }));
				} else if (req.url.startsWith("/anth/v1/models")) {
					res.end(JSON.stringify({ data: [{ id: "claude-x", display_name: "Claude X" }] }));
				} else {
					res.statusCode = 404;
					res.end("{}");
				}
			});
			await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
			url = `http://127.0.0.1:${servidor.address().port}`;
		});
		after(() => servidor.close());

		test("compatible con OpenAI, con clave", async () => {
			const d = await detectarModelos({ url, clave: "buena" });
			assert.equal(d.api, "openai-completions");
			assert.equal(d.baseUrl, `${url}/v1`);
			assert.deepEqual(
				d.modelos.map((m) => m.id),
				["m1", "m2"],
			);
		});

		test("clave incorrecta da un error claro", async () => {
			await assert.rejects(detectarModelos({ url, clave: "mala" }), (e) => e.tipo === "clave");
		});

		test("Ollama nativo cuando /v1/models no responde", async () => {
			const d = await detectarModelos({ url });
			assert.equal(d.baseUrl, `${url}/v1`);
			assert.deepEqual(
				d.modelos.map((m) => m.id),
				["llama3:latest"],
			);
		});

		test("Anthropic", async () => {
			const d = await detectarModelos({ url: `${url}/anth`, clave: "x", protocolo: "anthropic" });
			assert.equal(d.api, "anthropic-messages");
			assert.equal(d.modelos[0].nombre, "Claude X");
		});

		test("servidor apagado da error de red", async () => {
			await assert.rejects(detectarModelos({ url: "http://127.0.0.1:1" }), (e) => e.tipo === "red");
		});
	});
});

describe("pi", () => {
	test("lee la tabla de --list-models", () => {
		const tabla = [
			"provider   model                 context  max-out  thinking  images",
			"anthropic  claude-sonnet-5       1M       128K     yes       yes",
			"ollama     qwen2.5-coder:7b      128K     16K      no        no",
		].join("\n");
		assert.deepEqual(leerTablaModelos(tabla), [
			{ proveedor: "anthropic", id: "claude-sonnet-5", contexto: "1M", razona: true, imagenes: true },
			{ proveedor: "ollama", id: "qwen2.5-coder:7b", contexto: "128K", razona: false, imagenes: false },
		]);
	});

	test("identificadores validos", () => {
		assert.equal(aIdentificador("Mi Servidor Ñandú!"), "mi-servidor-nandu");
		assert.equal(aIdentificador("***"), "personalizado");
	});
});

describe("configuracion", () => {
	test("recientes sin duplicados y la ultima primero", () => {
		agregarReciente("/a");
		agregarReciente("/b");
		agregarReciente("/a");
		assert.deepEqual(
			leerPreferencias().recientes.map((r) => r.ruta),
			["/a", "/b"],
		);
	});

	test("preferencias combinan con los valores por defecto", () => {
		guardarPreferencias({ permisos: "lectura" });
		const p = leerPreferencias();
		assert.equal(p.permisos, "lectura");
		assert.equal(p.barraBotones, true);
	});

	test("claves en auth.json privadas", () => {
		guardarClave("openai", "sk-prueba");
		assert.deepEqual(leerClaves().openai, { type: "api_key", key: "sk-prueba" });
		if (process.platform !== "win32") {
			assert.equal(statSync(join(process.env.PI_CODING_AGENT_DIR, "auth.json")).mode & 0o777, 0o600);
		}
	});

	test("proveedores en models.json y ajustes de Pi", () => {
		guardarProveedor("ollama", { baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "x" }] });
		assert.equal(leerModelosJson().providers.ollama.models[0].id, "x");
		guardarAjustesPi({ defaultProvider: "ollama", defaultModel: "x", otro: 1 });
		guardarAjustesPi({ defaultModel: undefined });
		assert.deepEqual(leerAjustesPi(), { defaultProvider: "ollama", otro: 1 });
		JSON.parse(readFileSync(join(process.env.PI_CODING_AGENT_DIR, "settings.json"), "utf8"));
	});
});

describe("interfaz", () => {
	const raton = (tipo, x, y) => ({ type: tipo, button: "left", x, y, screenX: x, screenY: y, width: 80, height: 10, shift: false, alt: false, ctrl: false });

	test("acorta rutas por la izquierda", () => {
		assert.equal(acortarRuta("/home/ana/proyectos/web", 100), "/home/ana/proyectos/web");
		assert.equal(acortarRuta("/home/ana/proyectos/web", 16), "…/proyectos/web");
	});

	test("un clic en un boton lo pulsa", () => {
		const pulsados = [];
		const fila = new FilaBotones(estiloBase, [
			{ id: "uno", etiqueta: "Uno" },
			{ id: "dos", etiqueta: "Dos" },
		], { alPulsar: (id) => pulsados.push(id) });
		fila.render(80);
		const zona = fila.zonas.find((z) => z.indice === 1);
		fila.handleMouse(raton("press", zona.x0 + 1, 0));
		fila.handleMouse(raton("release", zona.x0 + 1, 0));
		fila.handleMouse(raton("click", zona.x0 + 1, 0));
		assert.deepEqual(pulsados, ["dos"]);
	});

	test("los botones se reparten en varias lineas si no caben", () => {
		const fila = new FilaBotones(estiloBase, Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, etiqueta: `Boton numero ${i}` })));
		assert.ok(fila.render(40).length > 1);
	});

	test("la lista busca y elige con clic", () => {
		const elegidos = [];
		const lista = new Lista(estiloBase, [
			{ id: "a", etiqueta: "Manzana" },
			{ id: "b", etiqueta: "Banana" },
			{ id: "c", etiqueta: "Cereza" },
		], { buscador: true, alElegir: (e) => elegidos.push(e.id) });
		for (const letra of "ban") lista.handleInput(letra);
		lista.render(60);
		const zona = lista.zonas.find((z) => z.tipo === "elemento");
		lista.handleMouse(raton("press", 3, zona.y));
		lista.handleMouse(raton("click", 3, zona.y));
		assert.deepEqual(elegidos, ["b"]);
	});
});

describe("dbus", async () => {
	const { codificarMensaje, decodificarMensaje, dividirFirma, variante } = await import("../src/core/dbus.js");

	test("divide firmas en tipos completos", () => {
		assert.deepEqual(dividirFirma("ssa{sv}"), ["s", "s", "a{sv}"]);
		assert.deepEqual(dividirFirma("ua{sv}a(sa(us))"), ["u", "a{sv}", "a(sa(us))"]);
	});

	test("un mensaje se codifica y se vuelve a leer igual", () => {
		const opciones = [
			["handle_token", variante("s", "tok")],
			["directory", variante("b", true)],
			["current_folder", variante("ay", Buffer.from("/tmp\0"))],
			["filters", variante("a(sa(us))", [["Texto", [[0, "*.md"], [0, "*.txt"]]]])],
		];
		const datos = codificarMensaje({ tipo: 1, serie: 7, ruta: "/a/b", interfaz: "x.Y", miembro: "Abrir", destino: "x.Dest", firma: "ssa{sv}", cuerpo: ["", "Titulo ñ", opciones] });
		const { mensaje, usados } = decodificarMensaje(Buffer.concat([datos, Buffer.from([1, 2, 3])]));
		assert.equal(usados, datos.length);
		assert.equal(mensaje.serie, 7);
		assert.equal(mensaje.ruta, "/a/b");
		assert.equal(mensaje.miembro, "Abrir");
		const [, titulo, leidas] = mensaje.cuerpo;
		assert.equal(titulo, "Titulo ñ");
		assert.equal(leidas.directory.valor, true);
		assert.equal(leidas.current_folder.valor.toString(), "/tmp\0");
		assert.deepEqual(leidas.filters.valor, [["Texto", [[0, "*.md"], [0, "*.txt"]]]]);
	});

	test("un mensaje incompleto espera mas datos", () => {
		const datos = codificarMensaje({ tipo: 4, serie: 1, ruta: "/r", interfaz: "i.I", miembro: "S", firma: "u", cuerpo: [3] });
		assert.equal(decodificarMensaje(datos.subarray(0, datos.length - 1)), undefined);
	});
});
