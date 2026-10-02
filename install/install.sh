#!/bin/sh
# Instalador de hilosenda para Linux y macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.sh | sh
#
# No necesita permisos de administrador. Si no tienes Node.js 22.19 o mas nuevo,
# descarga una copia privada de Node.js solo para hilosenda.
#
# Variables opcionales:
#   HILOSENDA_REF   rama o etiqueta a instalar (por defecto: main)
#   HILOSENDA_REPO  repositorio de GitHub (por defecto: bolivian12/hilosenda)
#   HILOSENDA_DIR   carpeta de instalacion (por defecto: ~/.hilosenda)
#   HILOSENDA_FUENTE carpeta o archivo .tgz local en lugar de descargar de GitHub
#
# Si el repositorio es privado, descargalo con git y ejecuta desde esa carpeta:
#   sh install/install.sh
# El instalador detecta que esta dentro del proyecto e instala esa copia.

set -eu

REF="${HILOSENDA_REF:-main}"
REPO="${HILOSENDA_REPO:-bolivian12/hilosenda}"
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

es_nixos() { [ -e /etc/NIXOS ] || grep -qs '^ID=nixos' /etc/os-release; }

# En NixOS los programas genericos de Linux no arrancan: Node.js se obtiene con Nix.
node_desde_nix() {
	mkdir -p "$DIR"
	for ATRIBUTO in nodejs_24 nodejs_22 nodejs; do
		if command -v nix-build >/dev/null 2>&1 \
			&& nix-build '<nixpkgs>' -A "$ATRIBUTO" -o "$DIR/node-nix" >/dev/null 2>&1 \
			&& node_valido "$DIR/node-nix/bin/node"; then return 0; fi
		if command -v nix >/dev/null 2>&1 \
			&& nix --extra-experimental-features 'nix-command flakes' build "nixpkgs#$ATRIBUTO" --out-link "$DIR/node-nix" >/dev/null 2>&1 \
			&& node_valido "$DIR/node-nix/bin/node"; then return 0; fi
	done
	return 1
}

usar_node_nix() {
	NODE="$DIR/node-nix/bin/node"
	NPM="$DIR/node-nix/bin/npm"
	PATH="$DIR/node-nix/bin:$PATH"
	export PATH
	ok "Node.js $("$NODE" -v) listo (desde Nix)"
}

AYUDA_NODE="Instala Node.js 22.19 o mas nuevo y vuelve a ejecutar el instalador."
if es_nixos; then
	AYUDA_NODE="En NixOS: agrega nodejs_22 a environment.systemPackages (o ejecuta: nix-shell -p nodejs_22 --run 'sh install/install.sh') y vuelve a intentarlo."
fi

NODE=""
if command -v node >/dev/null 2>&1 && node_valido "$(command -v node)"; then
	NODE="$(command -v node)"
	NPM="$(dirname "$NODE")/npm"
	[ -x "$NPM" ] || NPM="$(command -v npm || true)"
	[ -n "$NPM" ] && ok "Usando tu Node.js $("$NODE" -v)"
fi

if { [ -z "$NODE" ] || [ -z "${NPM:-}" ]; } && es_nixos; then
	say "NixOS detectado: obteniendo Node.js con Nix (puede tardar)…"
	node_desde_nix && usar_node_nix || fail "No se pudo obtener Node.js con Nix. $AYUDA_NODE"
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
	if node_valido "$DIR/node/$NOMBRE/bin/node"; then
		NODE="$DIR/node/$NOMBRE/bin/node"
		NPM="$DIR/node/$NOMBRE/bin/npm"
		PATH="$DIR/node/$NOMBRE/bin:$PATH"
		export PATH
		ok "Node.js $NODE_VERSION listo"
	elif node_desde_nix; then
		usar_node_nix
	else
		fail "El Node.js descargado no funciona en este sistema. $AYUDA_NODE"
	fi
fi

# --- 2. hilosenda y Pi --------------------------------------------------------------
# Si este script esta dentro de una copia del proyecto (git clone), se instala esa copia.
RAIZ_LOCAL=""
case "$0" in
	*install.sh)
		CANDIDATA="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || true)"
		if [ -n "$CANDIDATA" ] && grep -qs '"name": "hilosenda"' "$CANDIDATA/package.json"; then RAIZ_LOCAL="$CANDIDATA"; fi
		;;
esac
FUENTE="${HILOSENDA_FUENTE:-${RAIZ_LOCAL:-https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF}}"

if [ -d "$FUENTE" ]; then
	say "Preparando hilosenda desde $FUENTE…"
	PAQUETE="$(mktemp -d)"
	(cd "$FUENTE" && "$NPM" pack --pack-destination "$PAQUETE" --silent >/dev/null) || fail "No se pudo preparar la copia local de hilosenda."
	FUENTE="$(ls "$PAQUETE"/*.tgz | head -n 1)"
fi

say "Descargando hilosenda y Pi (puede tardar un minuto)…"
mkdir -p "$DIR/app"
[ -f "$DIR/app/package.json" ] || printf '{ "name": "hilosenda-instalacion", "private": true }\n' > "$DIR/app/package.json"
"$NPM" install --prefix "$DIR/app" --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier --loglevel=error "$FUENTE" \
	|| fail "No se pudo instalar hilosenda. Revisa tu conexion a internet. Si el repositorio es privado, descargalo con git clone y ejecuta: sh install/install.sh"
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
		AGREGADO=0
		for RC in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
			# Archivos gestionados por Nix/home-manager son de solo lectura: no se tocan.
			if [ -w "$RC" ] || { [ ! -e "$RC" ] && [ "$RC" = "$HOME/.profile" ]; }; then
				if grep -qs "$BIN_DIR" "$RC" || printf '\n# hilosenda\n%s\n' "$LINEA" >> "$RC" 2>/dev/null; then AGREGADO=1; fi
			fi
		done
		if [ "$AGREGADO" = "0" ]; then
			say "Agrega $BIN_DIR a tu PATH (en home-manager: home.sessionPath = [ \"$BIN_DIR\" ];)"
		fi
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
Icon=$DIR/app/node_modules/hilosenda/install/hilosenda.png
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
