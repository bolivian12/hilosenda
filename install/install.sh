#!/bin/sh
# Instalador de hilosenda para Linux y macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/bolivian12/pruebarepositori/main/install/install.sh | sh
#
# No necesita permisos de administrador. Si no tienes Node.js 22.19 o mas nuevo,
# descarga una copia privada de Node.js solo para hilosenda.
#
# Variables opcionales:
#   HILOSENDA_REF   rama o etiqueta a instalar (por defecto: main)
#   HILOSENDA_REPO  repositorio de GitHub (por defecto: bolivian12/pruebarepositori)
#   HILOSENDA_DIR   carpeta de instalacion (por defecto: ~/.hilosenda)
#   HILOSENDA_FUENTE carpeta o archivo .tgz local en lugar de descargar de GitHub

set -eu

REF="${HILOSENDA_REF:-main}"
REPO="${HILOSENDA_REPO:-bolivian12/pruebarepositori}"
DIR="${HILOSENDA_DIR:-$HOME/.hilosenda}"
NODE_VERSION="22.22.0"
BIN_DIR="$HOME/.local/bin"

say() { printf '  %s\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '\n  \033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

descargar() {
	if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
	elif command -v wget >/dev/null 2>&1; then wget -q "$1" -O "$2"
	else fail "Hace falta curl o wget para descargar."
	fi
}

printf '\n  \033[1;36mInstalando hilosenda\033[0m\n\n'

# --- 1. Node.js -----------------------------------------------------------------
node_valido() {
	"$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)' 2>/dev/null
}

NODE=""
if command -v node >/dev/null 2>&1 && node_valido "$(command -v node)"; then
	NODE="$(command -v node)"
	NPM="$(dirname "$NODE")/npm"
	[ -x "$NPM" ] || NPM="$(command -v npm || true)"
	ok "Usando tu Node.js $("$NODE" -v)"
fi

if [ -z "$NODE" ] || [ -z "${NPM:-}" ]; then
	case "$(uname -s)" in
		Linux) SO="linux" ;;
		Darwin) SO="darwin" ;;
		*) fail "Sistema no compatible: $(uname -s)" ;;
	esac
	case "$(uname -m)" in
		x86_64|amd64) ARQ="x64" ;;
		aarch64|arm64) ARQ="arm64" ;;
		armv7l) ARQ="armv7l" ;;
		*) fail "Procesador no compatible: $(uname -m)" ;;
	esac
	NOMBRE="node-v$NODE_VERSION-$SO-$ARQ"
	if [ ! -x "$DIR/node/$NOMBRE/bin/node" ]; then
		say "Descargando Node.js $NODE_VERSION (solo para hilosenda)…"
		mkdir -p "$DIR/node"
		TMP="$(mktemp -d)"
		descargar "https://nodejs.org/dist/v$NODE_VERSION/$NOMBRE.tar.gz" "$TMP/node.tar.gz"
		tar -xzf "$TMP/node.tar.gz" -C "$DIR/node"
		rm -rf "$TMP"
	fi
	NODE="$DIR/node/$NOMBRE/bin/node"
	NPM="$DIR/node/$NOMBRE/bin/npm"
	PATH="$DIR/node/$NOMBRE/bin:$PATH"
	export PATH
	ok "Node.js $NODE_VERSION listo"
fi

# --- 2. hilosenda y Pi --------------------------------------------------------------
FUENTE="${HILOSENDA_FUENTE:-https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF}"
say "Descargando hilosenda y Pi (puede tardar un minuto)…"
mkdir -p "$DIR/app"
[ -f "$DIR/app/package.json" ] || printf '{ "name": "hilosenda-instalacion", "private": true }\n' > "$DIR/app/package.json"
"$NPM" install --prefix "$DIR/app" --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier --loglevel=error "$FUENTE" \
	|| fail "No se pudo instalar hilosenda. Revisa tu conexion a internet y vuelve a intentarlo."
APP="$DIR/app/node_modules/hilosenda/bin/hilosenda.js"
[ -f "$APP" ] || fail "La instalacion quedo incompleta."
ok "hilosenda instalado"

# --- 3. Comando `hilosenda` -----------------------------------------------------------
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/hilosenda" <<EOF
#!/bin/sh
exec "$NODE" "$APP" "\$@"
EOF
chmod +x "$BIN_DIR/hilosenda"
ok "Comando creado: $BIN_DIR/hilosenda"

case ":$PATH:" in
	*":$BIN_DIR:"*) ;;
	*)
		LINEA="export PATH=\"$BIN_DIR:\$PATH\""
		for RC in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
			if [ -f "$RC" ] || [ "$RC" = "$HOME/.profile" ]; then
				grep -qs "$BIN_DIR" "$RC" || printf '\n# hilosenda\n%s\n' "$LINEA" >> "$RC"
			fi
		done
		if [ -d "$HOME/.config/fish" ]; then
			mkdir -p "$HOME/.config/fish/conf.d"
			printf 'fish_add_path %s\n' "$BIN_DIR" > "$HOME/.config/fish/conf.d/hilosenda.fish"
		fi
		REINICIAR=1
		;;
esac

# --- 4. Acceso directo -------------------------------------------------------------------
if [ "$(uname -s)" = "Darwin" ]; then
	ESCRITORIO="$HOME/Desktop"
	if [ -d "$ESCRITORIO" ]; then
		printf '#!/bin/sh\nclear\nexec "%s"\n' "$BIN_DIR/hilosenda" > "$ESCRITORIO/hilosenda.command"
		chmod +x "$ESCRITORIO/hilosenda.command"
		ok "Acceso directo en el Escritorio (hilosenda.command)"
	fi
else
	APLICACIONES="$HOME/.local/share/applications"
	mkdir -p "$APLICACIONES"
	cat > "$APLICACIONES/hilosenda.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=hilosenda
Comment=Asistente de IA para tus proyectos
Exec=$BIN_DIR/hilosenda
Terminal=true
Categories=Development;Utility;
EOF
	ok "Acceso en el menu de aplicaciones"
fi

printf '\n  \033[1;32mListo.\033[0m Para empezar escribe:  \033[1mhilosenda\033[0m\n'
if [ "${REINICIAR:-0}" = "1" ]; then
	printf '  (Primero cierra y vuelve a abrir la terminal, o ejecuta: %s)\n' "$BIN_DIR/hilosenda"
fi
printf '\n'
