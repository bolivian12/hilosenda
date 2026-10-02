<p align="center"><img src="docs/icon.png" alt="hilosenda" width="128"></p>

<h1 align="center">hilosenda</h1>

<p align="center"><b><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.it.md">Italiano</a></b></p>

**Pi rinnovato: un assistente IA per la console che si usa con i clic.**

hilosenda è una versione "moddata" dell'agente di programmazione [Pi](https://github.com/earendil-works/pi).
Resta un programma da console, ma è pensato per chi **non ha mai usato niente del genere**: tutto si
fa con pulsanti e clic del mouse, con spiegazioni nella tua lingua. Se conosci già Pi, **tutti i
comandi originali funzionano ancora** (scrivi `/` nella chat).


## Screenshot

<table>
<tr><td width="50%"><img src="docs/img/home.png" alt="Schermata iniziale"><br><sub>Schermata iniziale</sub></td><td width="50%"><img src="docs/img/chat-reply.png" alt="Chat con il pannello laterale"><br><sub>Chat con il pannello laterale</sub></td></tr>
<tr><td width="50%"><img src="docs/img/models.png" alt="Scegliere il modello per fornitore"><br><sub>Scegliere il modello per fornitore</sub></td><td width="50%"><img src="docs/img/connect.png" alt="Collegare qualsiasi IA"><br><sub>Collegare qualsiasi IA</sub></td></tr>
<tr><td width="50%"><img src="docs/img/settings.png" alt="Impostazioni (inclusa la lingua)"><br><sub>Impostazioni (inclusa la lingua)</sub></td><td width="50%"><img src="docs/img/tutorial.png" alt="Tutorial guidato al primo avvio"><br><sub>Tutorial guidato al primo avvio</sub></td></tr>
</table>

## Installazione

Non serve installare nulla prima: se il computer non ha Node.js, l'installer scarica una copia
privata solo per hilosenda. Non chiede permessi di amministratore.

**Windows** (apri PowerShell e incolla):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.ps1 | iex"
```

Oppure scarica [`install/install.cmd`](install/install.cmd) e fai doppio clic. Viene creato un
collegamento **hilosenda** sul Desktop e nel menu Start.

**macOS e Linux** (apri il Terminale e incolla):

```sh
curl -fsSL https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.sh | sh
```

Su macOS compare `hilosenda.command` sul Desktop; su Linux, hilosenda compare nel menu delle
applicazioni. Puoi anche scrivere `hilosenda` in qualsiasi terminale.

> Per installare un altro branch (ad esempio una versione di prova), imposta `HILOSENDA_REF`:
> `curl -fsSL …/install.sh | HILOSENDA_REF=mio-branch sh`

Puoi anche scaricarlo con git:

```sh
git clone https://github.com/bolivian12/hilosenda.git hilosenda
cd hilosenda
sh install/install.sh        # su Windows: powershell -ExecutionPolicy Bypass -File install\install.ps1
```

**NixOS**: l'installer lo rileva e ottiene Node.js con Nix. Con home-manager aggiungi
`~/.local/bin` a `home.sessionPath`. Consigliati: `fd` e `ripgrep` installati con Nix.

Con Node.js 22.19 o più recente puoi anche installarlo con npm:

```sh
npm install -g --ignore-scripts github:bolivian12/hilosenda
```

## Inizia in 3 passi

1. **Collega un'IA.** Premi «Collega un'IA». Se Ollama o LM Studio sono aperti, vengono rilevati da
   soli. Per un'IA nel cloud (Claude, GPT, Gemini, OpenRouter...), incolla la tua chiave API:
   hilosenda **rileva automaticamente tutti i modelli disponibili**.
2. **Scegli una cartella.** Premi «Scegli cartella» e si apre la normale finestra del sistema (su
   Linux quella del tuo desktop tramite il portale). Senza finestre (via SSH) si apre un esploratore
   nella console.
3. **Chatta.** Premi «Inizia a chattare», scrivi ciò che ti serve e premi Invio.

Al primo avvio, un tutorial guidato ti insegna a fare tutto col mouse.

## Cosa include

- **Schermata iniziale** animata, cartelle recenti e **conversazioni precedenti** con ricerca.
- **Qualsiasi IA, senza un fornitore obbligato**: Ollama, LM Studio, llama.cpp, vLLM, Jan;
  Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Cerebras, Together,
  Fireworks, Moonshot, NVIDIA; abbonamenti (Claude Pro/Max, ChatGPT, Copilot); o qualsiasi URL
  compatibile. Cerca modelli per fornitore e rimuovi fornitori.
- **Chat tranquilla** con un pannello laterale di grandi pulsanti: allega file, cambia modello,
  ragionamento, chat precedenti, nuova chat, altre opzioni, home e **Ferma**. Il modello scelto è
  sempre visibile.
- **Immagini e documenti**: allegali con il pulsante, Ctrl+V, clic destro o trascinandoli, con
  anteprima prima dell'invio. Incollare funziona in tutti i campi.
- **Permessi**: *Chiedi prima* (predefinito), *Libero* o *Sola lettura*.
- **Istruzioni**: scegli qualsiasi file `.md` o `.txt` con regole per l'IA.
- **Aspetto da app desktop**, con temi chiaro e scuro.
- **Lingue**: spagnolo, inglese, portoghese, francese, tedesco e italiano. Usa automaticamente la
  lingua del sistema e l'IA risponde in quella lingua. Cambiala in **Impostazioni → Lingua**.

## Comandi

Tutto si fa con i clic, ma ci sono anche comandi: `/menu`, `/modelo`, `/razonamiento`,
`/permisos`, `/instrucciones`, `/carpeta`, `/historial`, `/conectar`, `/nuevo`, `/ajustes`,
`/inicio`, `/ayuda`. E tutti quelli di Pi: `/model`, `/thinking`, `/tree`, `/fork`, `/compact`,
`/login`, `/settings`, `/resume`, `/export`, `/hotkeys`...

```
hilosenda                  schermata iniziale
hilosenda <cartella>       apre la chat direttamente in quella cartella
hilosenda --continuar      continua l'ultima conversazione della cartella attuale
hilosenda -- <opzioni>     passa opzioni direttamente a Pi
```

## Dove vengono salvati i dati

- Preferenze: `~/.hilosenda/preferencias.json`
- Configurazione di Pi (modelli, chiavi, conversazioni): `~/.pi/agent/`, condivisa con Pi.
- Le chiavi API restano solo sul tuo computer.

## Disinstallare

- **Windows**: elimina `%LOCALAPPDATA%\hilosenda` e i collegamenti.
- **macOS / Linux**: `rm -rf ~/.hilosenda ~/.local/bin/hilosenda ~/.local/share/applications/hilosenda.desktop`

## Come è fatto

hilosenda **non modifica il codice di Pi**: lo installa come dipendenza e lo estende con il sistema
ufficiale di estensioni. Sviluppo: `npm install --ignore-scripts`, `npm start`, `npm test`.

## Licenza

MIT. Basato su [Pi](https://github.com/earendil-works/pi) (MIT, © Mario Zechner).
