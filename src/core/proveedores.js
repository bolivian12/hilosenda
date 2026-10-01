// Catalogo de servicios de IA que hilosenda sabe conectar.
//
// Hay tres clases:
//  - "local":      programas en tu computadora (Ollama, LM Studio...). Gratis y privados.
//  - "nube":       servicios que Pi ya conoce. Solo hace falta pegar una clave API.
//  - "suscripcion": cuentas como Claude Pro o ChatGPT Plus; se conectan con /login dentro de Pi.
// Ademas, cualquier otra URL compatible se puede agregar como "personalizado".

/**
 * @typedef {object} Proveedor
 * @property {string} id Nombre interno; en "nube" coincide con el proveedor de Pi.
 * @property {string} nombre
 * @property {"local" | "nube" | "suscripcion"} clase
 * @property {string} descripcion
 * @property {string} [url] URL base por defecto.
 * @property {"openai" | "anthropic" | "google"} [protocolo]
 * @property {string} [web] Donde conseguir la clave o el programa.
 * @property {string} [variable] Variable de entorno que Pi tambien acepta.
 */

/** @type {Proveedor[]} */
export const PROVEEDORES = [
	// --- En tu computadora ----------------------------------------------------
	{
		id: "ollama",
		nombre: "Ollama",
		clase: "local",
		descripcion: "Modelos gratis en tu PC. El mas facil de instalar.",
		url: "http://localhost:11434/v1",
		protocolo: "openai",
		web: "https://ollama.com/download",
	},
	{
		id: "lmstudio",
		nombre: "LM Studio",
		clase: "local",
		descripcion: "Aplicacion con ventana para descargar y servir modelos.",
		url: "http://localhost:1234/v1",
		protocolo: "openai",
		web: "https://lmstudio.ai",
	},
	{
		id: "llamacpp",
		nombre: "llama.cpp",
		clase: "local",
		descripcion: "Servidor llama-server con archivos GGUF.",
		url: "http://localhost:8080/v1",
		protocolo: "openai",
		web: "https://github.com/ggml-org/llama.cpp",
	},
	{
		id: "vllm",
		nombre: "vLLM",
		clase: "local",
		descripcion: "Servidor rapido para tarjetas graficas potentes.",
		url: "http://localhost:8000/v1",
		protocolo: "openai",
		web: "https://docs.vllm.ai",
	},
	{
		id: "jan",
		nombre: "Jan",
		clase: "local",
		descripcion: "Aplicacion de escritorio con servidor local.",
		url: "http://localhost:1337/v1",
		protocolo: "openai",
		web: "https://jan.ai",
	},

	// --- En la nube, con clave API ---------------------------------------------
	{
		id: "anthropic",
		nombre: "Anthropic (Claude)",
		clase: "nube",
		descripcion: "Modelos Claude. Muy buenos para programar.",
		url: "https://api.anthropic.com",
		protocolo: "anthropic",
		web: "https://console.anthropic.com/settings/keys",
		variable: "ANTHROPIC_API_KEY",
	},
	{
		id: "openai",
		nombre: "OpenAI (GPT)",
		clase: "nube",
		descripcion: "Modelos GPT y o-series.",
		url: "https://api.openai.com/v1",
		protocolo: "openai",
		web: "https://platform.openai.com/api-keys",
		variable: "OPENAI_API_KEY",
	},
	{
		id: "google",
		nombre: "Google (Gemini)",
		clase: "nube",
		descripcion: "Modelos Gemini. Tiene un nivel gratuito.",
		url: "https://generativelanguage.googleapis.com/v1beta",
		protocolo: "google",
		web: "https://aistudio.google.com/apikey",
		variable: "GEMINI_API_KEY",
	},
	{
		id: "openrouter",
		nombre: "OpenRouter",
		clase: "nube",
		descripcion: "Una sola clave para cientos de modelos de muchas empresas.",
		url: "https://openrouter.ai/api/v1",
		protocolo: "openai",
		web: "https://openrouter.ai/keys",
		variable: "OPENROUTER_API_KEY",
	},
	{
		id: "groq",
		nombre: "Groq",
		clase: "nube",
		descripcion: "Respuestas muy rapidas. Tiene nivel gratuito.",
		url: "https://api.groq.com/openai/v1",
		protocolo: "openai",
		web: "https://console.groq.com/keys",
		variable: "GROQ_API_KEY",
	},
	{
		id: "deepseek",
		nombre: "DeepSeek",
		clase: "nube",
		descripcion: "Modelos economicos y capaces.",
		url: "https://api.deepseek.com",
		protocolo: "openai",
		web: "https://platform.deepseek.com/api_keys",
		variable: "DEEPSEEK_API_KEY",
	},
	{
		id: "mistral",
		nombre: "Mistral",
		clase: "nube",
		descripcion: "Modelos europeos, incluido Codestral.",
		url: "https://api.mistral.ai/v1",
		protocolo: "openai",
		web: "https://console.mistral.ai/api-keys",
		variable: "MISTRAL_API_KEY",
	},
	{
		id: "xai",
		nombre: "xAI (Grok)",
		clase: "nube",
		descripcion: "Modelos Grok.",
		url: "https://api.x.ai/v1",
		protocolo: "openai",
		web: "https://console.x.ai",
		variable: "XAI_API_KEY",
	},
	{
		id: "cerebras",
		nombre: "Cerebras",
		clase: "nube",
		descripcion: "Muy rapido, con nivel gratuito.",
		url: "https://api.cerebras.ai/v1",
		protocolo: "openai",
		web: "https://cloud.cerebras.ai",
		variable: "CEREBRAS_API_KEY",
	},
	{
		id: "together",
		nombre: "Together AI",
		clase: "nube",
		descripcion: "Muchos modelos abiertos en la nube.",
		url: "https://api.together.xyz/v1",
		protocolo: "openai",
		web: "https://api.together.ai/settings/api-keys",
		variable: "TOGETHER_API_KEY",
	},
	{
		id: "fireworks",
		nombre: "Fireworks",
		clase: "nube",
		descripcion: "Modelos abiertos rapidos.",
		url: "https://api.fireworks.ai/inference/v1",
		protocolo: "openai",
		web: "https://fireworks.ai/account/api-keys",
		variable: "FIREWORKS_API_KEY",
	},
	{
		id: "moonshotai",
		nombre: "Moonshot (Kimi)",
		clase: "nube",
		descripcion: "Modelos Kimi.",
		url: "https://api.moonshot.ai/v1",
		protocolo: "openai",
		web: "https://platform.moonshot.ai",
		variable: "MOONSHOT_API_KEY",
	},
	{
		id: "nvidia",
		nombre: "NVIDIA NIM",
		clase: "nube",
		descripcion: "Modelos alojados por NVIDIA.",
		url: "https://integrate.api.nvidia.com/v1",
		protocolo: "openai",
		web: "https://build.nvidia.com",
		variable: "NVIDIA_API_KEY",
	},

	// --- Con tu cuenta (sin clave API) ------------------------------------------
	{
		id: "suscripcion",
		nombre: "Mi suscripcion (Claude Pro/Max, ChatGPT, Copilot...)",
		clase: "suscripcion",
		descripcion: "Inicia sesion en el navegador con tu cuenta. Abre /login de Pi.",
	},
];

export const proveedorPorId = (id) => PROVEEDORES.find((p) => p.id === id);

export const NOMBRES_CLASE = {
	local: "En tu computadora (gratis y privado)",
	nube: "En la nube (necesita una clave API)",
	suscripcion: "Con tu cuenta",
};
