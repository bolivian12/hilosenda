<p align="center"><img src="docs/icon.png" alt="hilosenda" width="128"></p>

<h1 align="center">hilosenda</h1>

<p align="center"><b><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.it.md">Italiano</a></b></p>

**Pi, renewed: a console AI assistant you use with mouse clicks.**

hilosenda is a "modded" version of the [Pi](https://github.com/earendil-works/pi) coding agent.
It is still a console program, but it is designed for someone who **has never used anything like
it**: everything works with buttons and mouse clicks, with explanations in your language. If you
already know Pi, **all the original commands still work** (type `/` inside the chat).


## Screenshots

<table>
<tr><td width="50%"><img src="docs/img/home.png" alt="Home screen"><br><sub>Home screen</sub></td><td width="50%"><img src="docs/img/chat-reply.png" alt="Chat with the side panel"><br><sub>Chat with the side panel</sub></td></tr>
<tr><td width="50%"><img src="docs/img/models.png" alt="Choosing a model by provider"><br><sub>Choosing a model by provider</sub></td><td width="50%"><img src="docs/img/connect.png" alt="Connecting any AI"><br><sub>Connecting any AI</sub></td></tr>
<tr><td width="50%"><img src="docs/img/settings.png" alt="Settings (including language)"><br><sub>Settings (including language)</sub></td><td width="50%"><img src="docs/img/tutorial.png" alt="Guided tutorial on first run"><br><sub>Guided tutorial on first run</sub></td></tr>
</table>

## Install

You don't need anything installed first: if your computer has no Node.js, the installer
downloads a private copy just for hilosenda. It never asks for administrator rights.

**Windows** (open PowerShell and paste):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.ps1 | iex"
```

Or download [`install/install.cmd`](install/install.cmd) and double-click it. A **hilosenda**
shortcut is created on the Desktop and in the Start menu.

**macOS and Linux** (open the Terminal and paste):

```sh
curl -fsSL https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.sh | sh
```

On macOS, `hilosenda.command` appears on the Desktop; on Linux, hilosenda appears in the
applications menu. You can also type `hilosenda` in any terminal.

> To install another branch (for example a test version), set `HILOSENDA_REF`:
> `curl -fsSL …/install.sh | HILOSENDA_REF=my-branch sh`

You can also download it with git and run the installer from there:

```sh
git clone https://github.com/bolivian12/hilosenda.git hilosenda
cd hilosenda
sh install/install.sh        # on Windows: powershell -ExecutionPolicy Bypass -File install\install.ps1
```

**NixOS**: the installer detects it and gets Node.js through Nix (generic Linux programs don't
run on NixOS). If you use home-manager, add `~/.local/bin` to `home.sessionPath`. Also
recommended: `fd` and `ripgrep` installed with Nix, since Pi uses them to search files.

If you already have Node.js 22.19 or newer, you can also install it with npm:

```sh
npm install -g --ignore-scripts github:bolivian12/hilosenda
```

## Get started in 3 steps

1. **Connect an AI.** Press «Connect an AI». If Ollama or LM Studio are open, they are detected
   automatically. If you prefer a cloud AI (Claude, GPT, Gemini, OpenRouter...), paste your API
   key: hilosenda **automatically detects every available model**.
2. **Choose a folder.** Press «Choose folder» and your system's normal window opens: the Windows
   or macOS picker or, on Linux, your desktop's (GNOME, KDE, Hyprland...) through the desktop
   portal. Without windows (for example over SSH), an explorer opens inside the console.
3. **Chat.** Press «Start chatting», type what you need in plain language and press Enter.

A guided tutorial, practiced with the mouse, runs the first time you open hilosenda.

## What's included

**Home screen** (with a startup animation)
- A big «Start chatting» button and buttons for everything else.
- Recent folders and **previous conversations**, searchable by any word.
- Automatic notice when AI is detected on your computer.

**Connect any AI, with no single provider**
- On your PC: Ollama, LM Studio, llama.cpp, vLLM, Jan.
- In the cloud: Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI,
  Cerebras, Together, Fireworks, Moonshot, NVIDIA.
- With your account: Claude Pro/Max, ChatGPT, GitHub Copilot (opens Pi's `/login`).
- **Any other address** compatible with OpenAI, Anthropic or Google: type the URL and
  hilosenda figures out the protocol and lists its models.
- Search models by provider and remove providers you no longer use.

**Inside the chat** (a calm design for beginners)
- A side panel with large buttons: attach file, change model, reasoning, previous chats,
  new chat, more options, home, and **Stop** while the AI works.
- The chosen model is always visible.
- **Images and documents**: attach them with the button, Ctrl+V, right-click or drag and drop,
  with a preview before sending.
- Paste works in every field and dialog.

**Permissions**
- *Ask me first* (default): before creating or changing files or running commands, a box shows
  what the AI wants to do, with «Allow», «Always allow in this chat», «Don't allow» and
  «No, and tell it why».
- *Free*: like the original Pi, no questions.
- *Read only*: the AI can read your project but change nothing.

**Instructions**
- Freely choose any `.md` or `.txt` file with rules for the AI (language, style,
  technologies...). It is read before every reply, so you can edit it anytime.

**Desktop-app look**: pill-shaped buttons, rounded cards that light up on hover, a title bar
with ✕, a clickable status bar (model, reasoning, folder, memory use and cost) and its own light
and dark themes.

**Languages**: Spanish, English, Portuguese, French, German and Italian. hilosenda uses your
system's language automatically (`LANG`, `LC_ALL`, or the Windows/macOS regional settings) and the
AI replies in that language. Change it in **Settings → Language**. Translations live in
`src/idiomas/<code>.json`.

## Commands

Everything can be done with clicks, but there are also commands:

| Command | What it does |
|---|---|
| `/menu` | Every feature, with explanations |
| `/modelo [text]` | Choose model (text filters the list) |
| `/razonamiento [level]` | Reasoning level |
| `/permisos [mode]` | Ask, free or read only |
| `/instrucciones [file]` | Choose the instructions file |
| `/carpeta [path]` | Open the chat in another folder |
| `/historial` | Search and continue previous conversations |
| `/conectar` | Connect a new AI |
| `/nuevo` | New conversation |
| `/ajustes` | hilosenda settings |
| `/inicio` | Back to the home screen |
| `/ayuda` | Step-by-step help |

Plus all of Pi's: `/model`, `/thinking`, `/tree`, `/fork`, `/compact`, `/login`, `/settings`,
`/resume`, `/export`, `/hotkeys`...

From the terminal:

```
hilosenda                  home screen
hilosenda <folder>         open the chat directly in that folder
hilosenda --continuar      continue the last conversation in the current folder
hilosenda -- <options>     pass options straight to Pi
```

## Tips

- The mouse works in Windows Terminal, macOS Terminal, iTerm2, GNOME Terminal, Konsole,
  Ghostty, WezTerm and most modern terminals. On Windows, [Windows Terminal](https://aka.ms/terminal)
  is recommended.
- Everything also works with the keyboard: arrows, Tab, Enter and Esc.
- On Linux, the folder window uses the desktop portal (`xdg-desktop-portal`), included with
  GNOME and KDE. Otherwise it uses `zenity` or `kdialog`; on NixOS it can fetch `zenity` via Nix.

## Where things are stored

- hilosenda preferences: `~/.hilosenda/preferencias.json`
- Pi configuration (models, keys, conversations): `~/.pi/agent/`. hilosenda shares this folder
  with Pi, so whatever you set up in one works in the other.
- API keys are stored only on your computer, with private permissions.

## Uninstall

- **Windows**: delete the `%LOCALAPPDATA%\hilosenda` folder and the shortcuts.
- **macOS / Linux**: `rm -rf ~/.hilosenda ~/.local/bin/hilosenda ~/.local/share/applications/hilosenda.desktop`

Your conversations and keys in `~/.pi/agent` are not deleted; remove them if you no longer want them.

## How it's built

hilosenda **does not modify Pi's code**: it installs Pi as a dependency and extends it through
its official extension system, so Pi's improvements arrive just by updating the version.

```
bin/hilosenda.js          entry command
src/inicio/app.js         home screen (control center)
extension/hilosenda.ts    extension loaded inside Pi (side panel, menu, permissions...)
src/flujos/               shared wizards: connect AI, folders, instructions
src/core/                 model detection, configuration, system windows
src/ui/                   buttons, cards, lists, fields and animation (mouse + keyboard)
src/idiomas/              translations
temas/                    light and dark color themes for the chat
install/                  installers for Windows, macOS and Linux
```

Development:

```sh
npm install --ignore-scripts
npm start          # run hilosenda from source
npm test           # tests
```

## License

MIT. Based on [Pi](https://github.com/earendil-works/pi) (MIT, © Mario Zechner).
