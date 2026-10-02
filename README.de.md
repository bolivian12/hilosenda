<p align="center"><img src="docs/icon.png" alt="hilosenda" width="128"></p>

<h1 align="center">hilosenda</h1>

<p align="center"><b><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.it.md">Italiano</a></b></p>

**Pi, neu gedacht: ein KI-Assistent für die Konsole, der sich mit Mausklicks bedienen lässt.**

hilosenda ist eine „gemoddete“ Version des Programmier-Agenten [Pi](https://github.com/earendil-works/pi).
Es bleibt ein Konsolenprogramm, ist aber für Menschen gemacht, die **so etwas noch nie benutzt
haben**: Alles geht mit Knöpfen und Mausklicks, mit Erklärungen in deiner Sprache. Wer Pi schon
kennt: **Alle Originalbefehle funktionieren weiterhin** (tippe `/` im Chat).


## Screenshots

<table>
<tr><td width="50%"><img src="docs/img/home.png" alt="Startbildschirm"><br><sub>Startbildschirm</sub></td><td width="50%"><img src="docs/img/chat-reply.png" alt="Chat mit Seitenleiste"><br><sub>Chat mit Seitenleiste</sub></td></tr>
<tr><td width="50%"><img src="docs/img/models.png" alt="Modell nach Anbieter wählen"><br><sub>Modell nach Anbieter wählen</sub></td><td width="50%"><img src="docs/img/connect.png" alt="Beliebige KI verbinden"><br><sub>Beliebige KI verbinden</sub></td></tr>
<tr><td width="50%"><img src="docs/img/settings.png" alt="Einstellungen (inkl. Sprache)"><br><sub>Einstellungen (inkl. Sprache)</sub></td><td width="50%"><img src="docs/img/tutorial.png" alt="Geführtes Tutorial beim ersten Start"><br><sub>Geführtes Tutorial beim ersten Start</sub></td></tr>
</table>

## Installation

Vorher musst du nichts installieren: Hat dein Computer kein Node.js, lädt das Installationsprogramm
eine private Kopie nur für hilosenda herunter. Es braucht keine Administratorrechte.

**Windows** (PowerShell öffnen und einfügen):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.ps1 | iex"
```

Oder lade [`install/install.cmd`](install/install.cmd) herunter und doppelklicke darauf. Eine
Verknüpfung **hilosenda** wird auf dem Desktop und im Startmenü angelegt.

**macOS und Linux** (Terminal öffnen und einfügen):

```sh
curl -fsSL https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.sh | sh
```

Unter macOS erscheint `hilosenda.command` auf dem Desktop; unter Linux erscheint hilosenda im
Anwendungsmenü. Du kannst auch in jedem Terminal `hilosenda` eingeben.

> Um einen anderen Branch zu installieren (z. B. eine Testversion), setze `HILOSENDA_REF`:
> `curl -fsSL …/install.sh | HILOSENDA_REF=mein-branch sh`

Du kannst es auch mit git herunterladen:

```sh
git clone https://github.com/bolivian12/hilosenda.git hilosenda
cd hilosenda
sh install/install.sh        # unter Windows: powershell -ExecutionPolicy Bypass -File install\install.ps1
```

**NixOS**: Das Installationsprogramm erkennt es und holt Node.js über Nix. Mit home-manager
`~/.local/bin` zu `home.sessionPath` hinzufügen. Empfohlen: `fd` und `ripgrep` über Nix.

Mit Node.js 22.19 oder neuer geht es auch per npm:

```sh
npm install -g --ignore-scripts github:bolivian12/hilosenda
```

## In 3 Schritten loslegen

1. **KI verbinden.** Drücke «KI verbinden». Laufen Ollama oder LM Studio, werden sie automatisch
   erkannt. Für eine Cloud-KI (Claude, GPT, Gemini, OpenRouter...) füge deinen API-Schlüssel ein:
   hilosenda **erkennt automatisch alle verfügbaren Modelle**.
2. **Ordner wählen.** Drücke «Ordner wählen» und das normale Fenster deines Systems öffnet sich
   (unter Linux das deines Desktops über das Portal). Ohne Fenster (z. B. per SSH) öffnet sich ein
   Explorer in der Konsole.
3. **Chatten.** Drücke «Chat starten», schreib, was du brauchst, und drücke Enter.

Beim ersten Start zeigt dir ein geführtes Tutorial alles mit der Maus.

## Was drin ist

- **Startbildschirm** mit Animation, zuletzt genutzten Ordnern und **früheren Unterhaltungen** mit Suche.
- **Jede KI, ohne Anbieterbindung**: Ollama, LM Studio, llama.cpp, vLLM, Jan; Anthropic, OpenAI,
  Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Cerebras, Together, Fireworks, Moonshot,
  NVIDIA; Abos (Claude Pro/Max, ChatGPT, Copilot); oder jede kompatible URL. Modelle nach Anbieter
  suchen und Anbieter entfernen.
- **Ruhiger Chat** mit Seitenleiste großer Knöpfe: Datei anhängen, Modell wechseln, Nachdenken,
  frühere Chats, neuer Chat, weitere Optionen, Start und **Stopp**. Das gewählte Modell ist immer sichtbar.
- **Bilder und Dokumente**: per Knopf, Strg+V, Rechtsklick oder Ziehen anhängen, mit Vorschau vor
  dem Senden. Einfügen funktioniert in allen Feldern.
- **Berechtigungen**: *Vorher fragen* (Standard), *Frei* oder *Nur lesen*.
- **Anweisungen**: wähle eine beliebige `.md`- oder `.txt`-Datei mit Regeln für die KI.
- **Desktop-App-Optik** mit hellem und dunklem Design.
- **Sprachen**: Spanisch, Englisch, Portugiesisch, Französisch, Deutsch und Italienisch. Die
  Systemsprache wird automatisch verwendet, und die KI antwortet in dieser Sprache. Ändern unter
  **Einstellungen → Sprache**.

## Befehle

Alles geht mit Klicks, es gibt aber auch Befehle: `/menu`, `/modelo`, `/razonamiento`,
`/permisos`, `/instrucciones`, `/carpeta`, `/historial`, `/conectar`, `/nuevo`, `/ajustes`,
`/inicio`, `/ayuda`. Dazu alle von Pi: `/model`, `/thinking`, `/tree`, `/fork`, `/compact`,
`/login`, `/settings`, `/resume`, `/export`, `/hotkeys`...

```
hilosenda                  Startbildschirm
hilosenda <ordner>         öffnet den Chat direkt in diesem Ordner
hilosenda --continuar      setzt die letzte Unterhaltung im aktuellen Ordner fort
hilosenda -- <optionen>    gibt Optionen direkt an Pi weiter
```

## Wo Daten gespeichert werden

- Einstellungen: `~/.hilosenda/preferencias.json`
- Pi-Konfiguration (Modelle, Schlüssel, Unterhaltungen): `~/.pi/agent/`, gemeinsam mit Pi.
- API-Schlüssel bleiben nur auf deinem Computer.

## Deinstallieren

- **Windows**: `%LOCALAPPDATA%\hilosenda` und die Verknüpfungen löschen.
- **macOS / Linux**: `rm -rf ~/.hilosenda ~/.local/bin/hilosenda ~/.local/share/applications/hilosenda.desktop`

## Aufbau

hilosenda **verändert den Code von Pi nicht**: Es installiert Pi als Abhängigkeit und erweitert es
über das offizielle Erweiterungssystem. Entwicklung: `npm install --ignore-scripts`, `npm start`, `npm test`.

## Lizenz

MIT. Basiert auf [Pi](https://github.com/earendil-works/pi) (MIT, © Mario Zechner).
