// Cliente D-Bus minimo, sin dependencias, para hablar con el portal de escritorio.
//
// Solo implementa lo necesario para llamar metodos y recibir señales en el bus de
// sesion: autenticacion EXTERNAL, Hello, AddMatch y (des)serializacion de los tipos
// D-Bus basicos (y b u i s o g v a ( {).
// Especificacion: https://dbus.freedesktop.org/doc/dbus-specification.html

import { existsSync } from "node:fs";
import { createConnection } from "node:net";

const TIPO = { llamada: 1, respuesta: 2, error: 3, senal: 4 };
const CAMPO = { ruta: 1, interfaz: 2, miembro: 3, nombreError: 4, respuestaA: 5, destino: 6, remitente: 7, firma: 8 };

/** Valor variante: `{ firma: "b", valor: true }`. */
export const variante = (firma, valor) => ({ firma, valor });

// --- Firmas ------------------------------------------------------------------

/** Divide una firma en tipos completos: "sa{sv}" → ["s", "a{sv}"]. */
export function dividirFirma(firma) {
	const tipos = [];
	let i = 0;
	while (i < firma.length) {
		const fin = finDeTipo(firma, i);
		tipos.push(firma.slice(i, fin));
		i = fin;
	}
	return tipos;
}

function finDeTipo(firma, i) {
	const c = firma[i];
	if (c === "a") return finDeTipo(firma, i + 1);
	if (c === "(" || c === "{") {
		const cierre = c === "(" ? ")" : "}";
		let nivel = 0;
		for (let j = i; j < firma.length; j++) {
			if (firma[j] === c) nivel++;
			else if (firma[j] === cierre && --nivel === 0) return j + 1;
		}
		throw new Error(`Firma D-Bus incompleta: ${firma}`);
	}
	return i + 1;
}

const ALINEACION = { y: 1, b: 4, n: 2, q: 2, i: 4, u: 4, x: 8, t: 8, d: 8, s: 4, o: 4, g: 1, v: 1, a: 4, "(": 8, "{": 8, h: 4 };

// --- Escritura ---------------------------------------------------------------

class Escritor {
	constructor() {
		this.partes = [];
		this.largo = 0;
	}

	bytes(buffer) {
		this.partes.push(buffer);
		this.largo += buffer.length;
	}

	alinear(n) {
		const relleno = (n - (this.largo % n)) % n;
		if (relleno) this.bytes(Buffer.alloc(relleno));
	}

	u32(valor) {
		this.alinear(4);
		const b = Buffer.alloc(4);
		b.writeUInt32LE(valor >>> 0);
		this.bytes(b);
	}

	texto(valor) {
		const datos = Buffer.from(String(valor), "utf8");
		this.u32(datos.length);
		this.bytes(Buffer.concat([datos, Buffer.from([0])]));
	}

	firma(valor) {
		const datos = Buffer.from(valor, "ascii");
		this.bytes(Buffer.from([datos.length]));
		this.bytes(Buffer.concat([datos, Buffer.from([0])]));
	}

	escribir(tipo, valor) {
		switch (tipo[0]) {
			case "y":
				this.bytes(Buffer.from([valor & 0xff]));
				return;
			case "b":
				this.u32(valor ? 1 : 0);
				return;
			case "u":
				this.u32(valor);
				return;
			case "i": {
				this.alinear(4);
				const b = Buffer.alloc(4);
				b.writeInt32LE(valor);
				this.bytes(b);
				return;
			}
			case "s":
			case "o":
				this.texto(valor);
				return;
			case "g":
				this.firma(valor);
				return;
			case "v":
				this.firma(valor.firma);
				this.escribir(valor.firma, valor.valor);
				return;
			case "(":
			case "{": {
				this.alinear(8);
				const internos = dividirFirma(tipo.slice(1, -1));
				internos.forEach((t, i) => this.escribir(t, valor[i]));
				return;
			}
			case "a": {
				const elemento = tipo.slice(1);
				this.u32(0);
				const posicionLargo = this.partes.length - 1;
				this.alinear(ALINEACION[elemento[0]]);
				const inicio = this.largo;
				if (elemento === "y") {
					this.bytes(Buffer.from(valor));
				} else if (elemento[0] === "{") {
					for (const par of Array.isArray(valor) ? valor : Object.entries(valor)) this.escribir(elemento, par);
				} else {
					for (const item of valor) this.escribir(elemento, item);
				}
				this.partes[posicionLargo].writeUInt32LE(this.largo - inicio);
				return;
			}
			default:
				throw new Error(`Tipo D-Bus no soportado al escribir: ${tipo}`);
		}
	}

	buffer() {
		return Buffer.concat(this.partes);
	}
}

// --- Lectura -----------------------------------------------------------------

class Lector {
	constructor(buffer, pequenio = true) {
		this.b = buffer;
		this.pos = 0;
		this.pequenio = pequenio;
	}

	alinear(n) {
		this.pos += (n - (this.pos % n)) % n;
	}

	u32() {
		this.alinear(4);
		const v = this.pequenio ? this.b.readUInt32LE(this.pos) : this.b.readUInt32BE(this.pos);
		this.pos += 4;
		return v;
	}

	leer(tipo) {
		switch (tipo[0]) {
			case "y":
				return this.b[this.pos++];
			case "b":
				return this.u32() !== 0;
			case "n":
			case "q": {
				this.alinear(2);
				const v = tipo === "n" ? (this.pequenio ? this.b.readInt16LE(this.pos) : this.b.readInt16BE(this.pos)) : this.pequenio ? this.b.readUInt16LE(this.pos) : this.b.readUInt16BE(this.pos);
				this.pos += 2;
				return v;
			}
			case "u":
			case "h":
				return this.u32();
			case "i": {
				this.alinear(4);
				const v = this.pequenio ? this.b.readInt32LE(this.pos) : this.b.readInt32BE(this.pos);
				this.pos += 4;
				return v;
			}
			case "x":
			case "t": {
				this.alinear(8);
				const v = tipo === "x" ? (this.pequenio ? this.b.readBigInt64LE(this.pos) : this.b.readBigInt64BE(this.pos)) : this.pequenio ? this.b.readBigUInt64LE(this.pos) : this.b.readBigUInt64BE(this.pos);
				this.pos += 8;
				return v;
			}
			case "d": {
				this.alinear(8);
				const v = this.pequenio ? this.b.readDoubleLE(this.pos) : this.b.readDoubleBE(this.pos);
				this.pos += 8;
				return v;
			}
			case "s":
			case "o": {
				const largo = this.u32();
				const v = this.b.toString("utf8", this.pos, this.pos + largo);
				this.pos += largo + 1;
				return v;
			}
			case "g": {
				const largo = this.b[this.pos++];
				const v = this.b.toString("ascii", this.pos, this.pos + largo);
				this.pos += largo + 1;
				return v;
			}
			case "v": {
				const firma = this.leer("g");
				return variante(firma, this.leer(firma));
			}
			case "(":
			case "{": {
				this.alinear(8);
				return dividirFirma(tipo.slice(1, -1)).map((t) => this.leer(t));
			}
			case "a": {
				const elemento = tipo.slice(1);
				const largo = this.u32();
				this.alinear(ALINEACION[elemento[0]]);
				const fin = this.pos + largo;
				if (elemento === "y") {
					const v = this.b.subarray(this.pos, fin);
					this.pos = fin;
					return v;
				}
				const items = [];
				while (this.pos < fin) items.push(this.leer(elemento));
				return elemento[0] === "{" ? Object.fromEntries(items) : items;
			}
			default:
				throw new Error(`Tipo D-Bus no soportado al leer: ${tipo}`);
		}
	}
}

// --- Mensajes ------------------------------------------------------------------

/** Serializa un mensaje D-Bus completo. */
export function codificarMensaje({ tipo, serie, ruta, interfaz, miembro, destino, firma = "", cuerpo = [], respuestaA, nombreError }) {
	const escritorCuerpo = new Escritor();
	const tipos = dividirFirma(firma);
	tipos.forEach((t, i) => escritorCuerpo.escribir(t, cuerpo[i]));
	const datosCuerpo = escritorCuerpo.buffer();

	const campos = [];
	if (ruta) campos.push([CAMPO.ruta, variante("o", ruta)]);
	if (interfaz) campos.push([CAMPO.interfaz, variante("s", interfaz)]);
	if (miembro) campos.push([CAMPO.miembro, variante("s", miembro)]);
	if (nombreError) campos.push([CAMPO.nombreError, variante("s", nombreError)]);
	if (respuestaA !== undefined) campos.push([CAMPO.respuestaA, variante("u", respuestaA)]);
	if (destino) campos.push([CAMPO.destino, variante("s", destino)]);
	if (firma) campos.push([CAMPO.firma, variante("g", firma)]);

	const cabecera = new Escritor();
	cabecera.bytes(Buffer.from([0x6c, tipo, 0, 1]));
	cabecera.u32(datosCuerpo.length);
	cabecera.u32(serie);
	cabecera.escribir("a(yv)", campos);
	cabecera.alinear(8);
	return Buffer.concat([cabecera.buffer(), datosCuerpo]);
}

/**
 * Intenta leer un mensaje completo al principio de `buffer`.
 * @returns {{ mensaje: object, usados: number } | undefined}
 */
export function decodificarMensaje(buffer) {
	if (buffer.length < 16) return undefined;
	const pequenio = buffer[0] === 0x6c;
	const leer32 = (pos) => (pequenio ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos));
	const largoCuerpo = leer32(4);
	const largoCampos = leer32(12);
	const finCabecera = 16 + largoCampos + ((8 - ((16 + largoCampos) % 8)) % 8);
	const total = finCabecera + largoCuerpo;
	if (buffer.length < total) return undefined;

	const lector = new Lector(buffer.subarray(0, finCabecera), pequenio);
	lector.pos = 12;
	const campos = new Map(lector.leer("a(yv)").map(([codigo, v]) => [codigo, v.valor]));
	const firma = campos.get(CAMPO.firma) ?? "";
	const lectorCuerpo = new Lector(buffer.subarray(finCabecera, total), pequenio);
	const cuerpo = dividirFirma(firma).map((t) => lectorCuerpo.leer(t));
	return {
		usados: total,
		mensaje: {
			tipo: buffer[1],
			serie: leer32(8),
			ruta: campos.get(CAMPO.ruta),
			interfaz: campos.get(CAMPO.interfaz),
			miembro: campos.get(CAMPO.miembro),
			nombreError: campos.get(CAMPO.nombreError),
			respuestaA: campos.get(CAMPO.respuestaA),
			remitente: campos.get(CAMPO.remitente),
			firma,
			cuerpo,
		},
	};
}

// --- Conexion ----------------------------------------------------------------------

/** Direccion del bus de sesion, o undefined si no hay ninguno. */
export function direccionBusSesion() {
	const desdeEntorno = process.env.DBUS_SESSION_BUS_ADDRESS;
	if (desdeEntorno) {
		for (const direccion of desdeEntorno.split(";")) {
			if (!direccion.startsWith("unix:")) continue;
			const claves = Object.fromEntries(
				direccion
					.slice(5)
					.split(",")
					.map((par) => par.split("="))
					.map(([k, v]) => [k, decodeURIComponent(v ?? "")]),
			);
			if (claves.path) return claves.path;
			if (claves.abstract) return `\0${claves.abstract}`;
		}
		return undefined;
	}
	const porDefecto = process.getuid ? `/run/user/${process.getuid()}/bus` : undefined;
	return porDefecto && existsSync(porDefecto) ? porDefecto : undefined;
}

export class ConexionDBus {
	/** @param {import("node:net").Socket} socket */
	constructor(socket) {
		this.socket = socket;
		this.serie = 1;
		this.pendientes = new Map();
		this.oyentes = new Set();
		this.recibido = Buffer.alloc(0);
		this.nombre = undefined;
		socket.on("data", (datos) => this.alRecibir(datos));
		const cerrar = (error) => {
			for (const { rechazar } of this.pendientes.values()) rechazar(error ?? new Error("Conexion D-Bus cerrada"));
			this.pendientes.clear();
		};
		socket.on("error", cerrar);
		socket.on("close", () => cerrar());
	}

	/** Conecta y se autentica en el bus de sesion. */
	static conectar(direccion = direccionBusSesion(), tiempo = 3000) {
		if (!direccion) return Promise.reject(new Error("No hay bus de sesion D-Bus"));
		return new Promise((resolver, rechazar) => {
			const socket = createConnection(direccion);
			const reloj = setTimeout(() => {
				socket.destroy();
				rechazar(new Error("El bus D-Bus no respondio"));
			}, tiempo);
			let respuesta = "";
			const alFallar = (error) => {
				clearTimeout(reloj);
				rechazar(error);
			};
			socket.once("error", alFallar);
			socket.once("connect", () => {
				const uid = String(process.getuid ? process.getuid() : 0);
				socket.write(`\0AUTH EXTERNAL ${Buffer.from(uid, "ascii").toString("hex")}\r\n`);
			});
			const alDatos = (datos) => {
				respuesta += datos.toString("ascii");
				if (!respuesta.includes("\r\n")) return;
				socket.off("data", alDatos);
				socket.off("error", alFallar);
				clearTimeout(reloj);
				if (!respuesta.startsWith("OK")) {
					socket.destroy();
					rechazar(new Error(`D-Bus rechazo la autenticacion: ${respuesta.trim()}`));
					return;
				}
				socket.write("BEGIN\r\n");
				const conexion = new ConexionDBus(socket);
				conexion
					.llamar({ destino: "org.freedesktop.DBus", ruta: "/org/freedesktop/DBus", interfaz: "org.freedesktop.DBus", miembro: "Hello" })
					.then(([nombre]) => {
						conexion.nombre = nombre;
						resolver(conexion);
					}, rechazar);
			};
			socket.on("data", alDatos);
		});
	}

	alRecibir(datos) {
		this.recibido = Buffer.concat([this.recibido, datos]);
		while (true) {
			let resultado;
			try {
				resultado = decodificarMensaje(this.recibido);
			} catch {
				this.recibido = Buffer.alloc(0);
				return;
			}
			if (!resultado) return;
			this.recibido = this.recibido.subarray(resultado.usados);
			const { mensaje } = resultado;
			if (mensaje.tipo === TIPO.respuesta || mensaje.tipo === TIPO.error) {
				const pendiente = this.pendientes.get(mensaje.respuestaA);
				if (!pendiente) continue;
				this.pendientes.delete(mensaje.respuestaA);
				if (mensaje.tipo === TIPO.respuesta) pendiente.resolver(mensaje.cuerpo);
				else {
					const error = new Error(`${mensaje.nombreError}: ${mensaje.cuerpo[0] ?? ""}`);
					error.nombre = mensaje.nombreError;
					pendiente.rechazar(error);
				}
			} else if (mensaje.tipo === TIPO.senal) {
				for (const oyente of this.oyentes) oyente(mensaje);
			}
		}
	}

	/** Llama a un metodo y devuelve el cuerpo de la respuesta. */
	llamar({ destino, ruta, interfaz, miembro, firma = "", cuerpo = [] }) {
		const serie = this.serie++;
		return new Promise((resolver, rechazar) => {
			this.pendientes.set(serie, { resolver, rechazar });
			this.socket.write(codificarMensaje({ tipo: TIPO.llamada, serie, ruta, interfaz, miembro, destino, firma, cuerpo }));
		});
	}

	/** Recibe señales; devuelve una funcion para dejar de escuchar. */
	alSenal(oyente) {
		this.oyentes.add(oyente);
		return () => this.oyentes.delete(oyente);
	}

	agregarFiltro(regla) {
		return this.llamar({ destino: "org.freedesktop.DBus", ruta: "/org/freedesktop/DBus", interfaz: "org.freedesktop.DBus", miembro: "AddMatch", firma: "s", cuerpo: [regla] });
	}

	cerrar() {
		this.socket.end();
		this.socket.destroy();
	}
}
