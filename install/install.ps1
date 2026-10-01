# Instalador de hilosenda para Windows.
#
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/bolivian12/pruebarepositori/main/install/install.ps1 | iex"
#
# No necesita permisos de administrador. Si no tienes Node.js 22.19 o mas nuevo,
# descarga una copia privada de Node.js solo para hilosenda. Crea accesos directos
# en el Escritorio y en el menu Inicio.
#
# Variables opcionales: HILOSENDA_REF, HILOSENDA_REPO, HILOSENDA_DIR, HILOSENDA_FUENTE.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$Ref = if ($env:HILOSENDA_REF) { $env:HILOSENDA_REF } else { 'main' }
$Repo = if ($env:HILOSENDA_REPO) { $env:HILOSENDA_REPO } else { 'bolivian12/pruebarepositori' }
$Dir = if ($env:HILOSENDA_DIR) { $env:HILOSENDA_DIR } else { Join-Path $env:LOCALAPPDATA 'hilosenda' }
$NodeVersion = '22.22.0'

function Ok($texto) { Write-Host "  [OK] $texto" -ForegroundColor Green }
function Info($texto) { Write-Host "  $texto" }
function Fallar($texto) { Write-Host "`n  [X] $texto`n" -ForegroundColor Red; exit 1 }

Write-Host "`n  Instalando hilosenda`n" -ForegroundColor Cyan

# --- 1. Node.js -----------------------------------------------------------------
$NodeExe = $null
$NpmCli = $null
$sistema = Get-Command node -ErrorAction SilentlyContinue
if ($sistema) {
	& $sistema.Source -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)' 2>$null
	if ($LASTEXITCODE -eq 0) {
		$NodeExe = $sistema.Source
		$candidato = Join-Path (Split-Path $NodeExe) 'node_modules\npm\bin\npm-cli.js'
		if (Test-Path $candidato) { $NpmCli = $candidato; Ok "Usando tu Node.js $(& $NodeExe -v)" } else { $NodeExe = $null }
	}
}

if (-not $NodeExe) {
	$arq = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
	$nombre = "node-v$NodeVersion-win-$arq"
	$carpetaNode = Join-Path $Dir 'node'
	$NodeExe = Join-Path $carpetaNode "$nombre\node.exe"
	if (-not (Test-Path $NodeExe)) {
		Info "Descargando Node.js $NodeVersion (solo para hilosenda)..."
		New-Item -ItemType Directory -Force -Path $carpetaNode | Out-Null
		$zip = Join-Path $env:TEMP "$nombre.zip"
		Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$NodeVersion/$nombre.zip" -OutFile $zip
		Expand-Archive -Path $zip -DestinationPath $carpetaNode -Force
		Remove-Item $zip -Force
	}
	$NpmCli = Join-Path $carpetaNode "$nombre\node_modules\npm\bin\npm-cli.js"
	$env:PATH = (Join-Path $carpetaNode $nombre) + ';' + $env:PATH
	Ok "Node.js $NodeVersion listo"
}

# --- 2. hilosenda y Pi --------------------------------------------------------------
$fuente = if ($env:HILOSENDA_FUENTE) { $env:HILOSENDA_FUENTE } else { "https://codeload.github.com/$Repo/tar.gz/refs/heads/$Ref" }
$carpetaApp = Join-Path $Dir 'app'
New-Item -ItemType Directory -Force -Path $carpetaApp | Out-Null
$paquete = Join-Path $carpetaApp 'package.json'
if (-not (Test-Path $paquete)) { Set-Content -Path $paquete -Value '{ "name": "hilosenda-instalacion", "private": true }' -Encoding ASCII }
Info 'Descargando hilosenda y Pi (puede tardar un minuto)...'
& $NodeExe $NpmCli install --prefix $carpetaApp --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier --loglevel=error $fuente
if ($LASTEXITCODE -ne 0) { Fallar 'No se pudo instalar hilosenda. Revisa tu conexion a internet y vuelve a intentarlo.' }
$App = Join-Path $carpetaApp 'node_modules\hilosenda\bin\hilosenda.js'
if (-not (Test-Path $App)) { Fallar 'La instalacion quedo incompleta.' }
Ok 'hilosenda instalado'

# --- 3. Comando `hilosenda` -----------------------------------------------------------
$carpetaBin = Join-Path $Dir 'bin'
New-Item -ItemType Directory -Force -Path $carpetaBin | Out-Null
$comando = Join-Path $carpetaBin 'hilosenda.cmd'
Set-Content -Path $comando -Encoding ASCII -Value "@echo off`r`n`"$NodeExe`" `"$App`" %*"
$rutaUsuario = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $rutaUsuario) { $rutaUsuario = '' }
if (($rutaUsuario -split ';') -notcontains $carpetaBin) {
	[Environment]::SetEnvironmentVariable('Path', ($carpetaBin + ';' + $rutaUsuario).TrimEnd(';'), 'User')
}
Ok "Comando creado: $comando"

# --- 4. Accesos directos -------------------------------------------------------------------
$shell = New-Object -ComObject WScript.Shell
$terminal = Get-Command wt.exe -ErrorAction SilentlyContinue
foreach ($destino in @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))) {
	if (-not $destino -or -not (Test-Path $destino)) { continue }
	$acceso = $shell.CreateShortcut((Join-Path $destino 'hilosenda.lnk'))
	if ($terminal) {
		$acceso.TargetPath = $terminal.Source
		$acceso.Arguments = "--title hilosenda cmd /c `"$comando`""
	} else {
		$acceso.TargetPath = $env:ComSpec
		$acceso.Arguments = "/c `"$comando`""
	}
	$acceso.WorkingDirectory = $env:USERPROFILE
	$acceso.Description = 'Asistente de IA para tus proyectos'
	$acceso.IconLocation = "$NodeExe,0"
	$acceso.Save()
}
Ok 'Accesos directos en el Escritorio y en el menu Inicio'

Write-Host "`n  Listo. Abre 'hilosenda' desde el Escritorio, o escribe hilosenda en una terminal nueva." -ForegroundColor Green
if (-not $terminal) { Write-Host '  Consejo: instala "Windows Terminal" desde la Microsoft Store para una mejor experiencia con el raton.' }
Write-Host ''
