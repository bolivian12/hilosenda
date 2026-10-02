#!/usr/bin/env node
// Punto de entrada del comando `hilosenda`.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const [mayor, menor] = process.versions.node.split(".").map(Number);
if (mayor < 22 || (mayor === 22 && menor < 19)) {
	console.error(`hilosenda necesita Node.js 22.19 o mas nuevo (tienes ${process.versions.node}).`);
	console.error("Vuelve a ejecutar el instalador de hilosenda o descarga Node.js desde https://nodejs.org");
	process.exit(1);
}

const { tr } = await import("../src/i18n.js");

const AYUDA = `hilosenda: Pi renovado, facil de usar con el raton.

Uso:
  hilosenda                 Abre la pantalla de inicio
  hilosenda <carpeta>       Abre el chat directamente en esa carpeta
  hilosenda --continuar     Continua la ultima conversacion de la carpeta actual
  hilosenda -- <opciones>   Pasa opciones directamente a Pi (por ejemplo: -- --model gpt-5)

Opciones:
  --sin-animacion           No mostrar la animacion de inicio
  --version                 Muestra la version
  --ayuda, -h               Muestra esta ayuda

Dentro del chat funcionan todos los comandos de Pi (escribe /) y los botones de hilosenda.`;

async function principal() {
	const argumentos = process.argv.slice(2);
	const separador = argumentos.indexOf("--");
	const propios = separador >= 0 ? argumentos.slice(0, separador) : argumentos;
	const paraPi = separador >= 0 ? argumentos.slice(separador + 1) : [];

	if (propios.includes("--ayuda") || propios.includes("--help") || propios.includes("-h")) {
		console.log(AYUDA);
		return;
	}
	if (propios.includes("--version") || propios.includes("-v")) {
		const { rutaCliPi, versionHilosenda } = await import("../src/core/pi.js");
		console.log(`hilosenda ${versionHilosenda()} (Pi ${rutaCliPi().version})`);
		return;
	}
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		console.error(tr("hilosenda debe ejecutarse en una consola (terminal) interactiva."));
		process.exit(1);
	}

	const posicional = propios.find((a) => !a.startsWith("-"));
	let carpeta;
	if (posicional) {
		carpeta = resolve(posicional);
		if (!existsSync(carpeta) || !statSync(carpeta).isDirectory()) {
			console.error(tr("No existe la carpeta: {0}", [carpeta]));
			process.exit(1);
		}
	}

	const { App } = await import("../src/inicio/app.js");
	const app = new App({ carpeta, animacion: propios.includes("--sin-animacion") ? false : undefined });

	const restaurar = () => {
		try {
			app.apagar();
		} catch {
			// La consola ya estaba restaurada.
		}
	};
	const errorFatal = (error) => {
		restaurar();
		console.error(tr("hilosenda encontro un error inesperado:"), "\n", error);
		process.exit(1);
	};
	process.on("uncaughtException", errorFatal);
	process.on("unhandledRejection", errorFatal);

	const continuar = propios.includes("--continuar") || propios.includes("-c");
	if (continuar || paraPi.length > 0) {
		app.carpeta = carpeta ?? process.cwd();
		await app.ejecutar({ entrarDirecto: true, argumentos: [...(continuar ? ["--continue"] : []), ...paraPi] });
	} else {
		await app.ejecutar({ entrarDirecto: Boolean(carpeta) });
	}
	process.exit(0);
}

principal();
