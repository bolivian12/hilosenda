// Lista las conversaciones guardadas por Pi y las imprime como JSON.
//
// Se ejecuta en un proceso aparte para que cargar Pi (que tarda) nunca congele la
// pantalla de hilosenda.

import { SessionManager } from "@earendil-works/pi-coding-agent";

try {
	const sesiones = await SessionManager.listAll();
	const salida = sesiones.map((s) => ({
		path: s.path,
		id: s.id,
		cwd: s.cwd,
		name: s.name,
		modified: new Date(s.modified).toISOString(),
		messageCount: s.messageCount,
		firstMessage: (s.firstMessage ?? "").slice(0, 300),
		allMessagesText: (s.allMessagesText ?? "").slice(0, 4000),
	}));
	process.stdout.write(JSON.stringify(salida));
} catch {
	process.stdout.write("[]");
}
