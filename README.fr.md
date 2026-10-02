<p align="center"><img src="docs/icon.png" alt="hilosenda" width="128"></p>

<h1 align="center">hilosenda</h1>

<p align="center"><b><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.it.md">Italiano</a></b></p>

**Pi renouvelé : un assistant IA pour la console qui s'utilise à la souris.**

hilosenda est une version « moddée » de l'agent de programmation [Pi](https://github.com/earendil-works/pi).
C'est toujours un programme console, mais pensé pour quelqu'un qui **n'a jamais utilisé ce genre
d'outil** : tout se fait avec des boutons et des clics, avec des explications dans votre langue.
Si vous connaissez déjà Pi, **toutes les commandes d'origine fonctionnent** (tapez `/` dans le chat).


## Captures d'écran

<table>
<tr><td width="50%"><img src="docs/img/home.png" alt="Écran d'accueil"><br><sub>Écran d'accueil</sub></td><td width="50%"><img src="docs/img/chat-reply.png" alt="Chat avec le panneau latéral"><br><sub>Chat avec le panneau latéral</sub></td></tr>
<tr><td width="50%"><img src="docs/img/models.png" alt="Choisir un modèle par fournisseur"><br><sub>Choisir un modèle par fournisseur</sub></td><td width="50%"><img src="docs/img/connect.png" alt="Connecter n'importe quelle IA"><br><sub>Connecter n'importe quelle IA</sub></td></tr>
<tr><td width="50%"><img src="docs/img/settings.png" alt="Paramètres (dont la langue)"><br><sub>Paramètres (dont la langue)</sub></td><td width="50%"><img src="docs/img/tutorial.png" alt="Tutoriel guidé au premier lancement"><br><sub>Tutoriel guidé au premier lancement</sub></td></tr>
</table>

## Installation

Rien à installer avant : si votre ordinateur n'a pas Node.js, l'installateur télécharge une copie
privée pour hilosenda. Aucun droit administrateur n'est demandé.

**Windows** (ouvrez PowerShell et collez) :

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.ps1 | iex"
```

Ou téléchargez [`install/install.cmd`](install/install.cmd) et double-cliquez dessus. Un raccourci
**hilosenda** est créé sur le Bureau et dans le menu Démarrer.

**macOS et Linux** (ouvrez le Terminal et collez) :

```sh
curl -fsSL https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.sh | sh
```

Sur macOS, `hilosenda.command` apparaît sur le Bureau ; sur Linux, hilosenda apparaît dans le menu
des applications. Vous pouvez aussi taper `hilosenda` dans n'importe quel terminal.

> Pour installer une autre branche (par exemple une version de test), définissez `HILOSENDA_REF` :
> `curl -fsSL …/install.sh | HILOSENDA_REF=ma-branche sh`

Vous pouvez aussi le télécharger avec git :

```sh
git clone https://github.com/bolivian12/hilosenda.git hilosenda
cd hilosenda
sh install/install.sh        # sous Windows : powershell -ExecutionPolicy Bypass -File install\install.ps1
```

**NixOS** : l'installateur le détecte et obtient Node.js via Nix. Avec home-manager, ajoutez
`~/.local/bin` à `home.sessionPath`. Recommandé : `fd` et `ripgrep` installés via Nix.

Avec Node.js 22.19 ou plus récent, vous pouvez aussi l'installer avec npm :

```sh
npm install -g --ignore-scripts github:bolivian12/hilosenda
```

## Démarrer en 3 étapes

1. **Connectez une IA.** Cliquez «Connecter une IA». Si Ollama ou LM Studio sont ouverts, ils sont
   détectés tout seuls. Pour une IA dans le cloud (Claude, GPT, Gemini, OpenRouter...), collez votre
   clé API : hilosenda **détecte automatiquement tous les modèles disponibles**.
2. **Choisissez un dossier.** Cliquez «Choisir un dossier» : la fenêtre normale de votre système
   s'ouvre (sous Linux, celle de votre bureau via le portail). Sans fenêtres (SSH), un explorateur
   s'ouvre dans la console.
3. **Discutez.** Cliquez «Commencer à discuter», écrivez ce dont vous avez besoin et appuyez sur Entrée.

Au premier lancement, un tutoriel guidé vous apprend à tout faire à la souris.

## Ce qui est inclus

- **Écran d'accueil** animé, dossiers récents et **conversations précédentes** avec recherche.
- **N'importe quelle IA, sans fournisseur imposé** : Ollama, LM Studio, llama.cpp, vLLM, Jan ;
  Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Cerebras, Together,
  Fireworks, Moonshot, NVIDIA ; abonnements (Claude Pro/Max, ChatGPT, Copilot) ; ou toute URL
  compatible. Recherche de modèles par fournisseur et suppression de fournisseurs.
- **Chat apaisé** avec un panneau latéral de grands boutons : joindre un fichier, changer de modèle,
  raisonnement, chats précédents, nouveau chat, plus d'options, accueil et **Arrêter**. Le modèle
  choisi est toujours visible.
- **Images et documents** : joignez-les avec le bouton, Ctrl+V, clic droit ou glisser-déposer, avec
  un aperçu avant l'envoi. Le collage fonctionne dans tous les champs.
- **Autorisations** : *Demander d'abord* (par défaut), *Libre* ou *Lecture seule*.
- **Instructions** : choisissez n'importe quel fichier `.md` ou `.txt` de règles pour l'IA.
- **Look d'application de bureau**, avec thèmes clair et sombre.
- **Langues** : espagnol, anglais, portugais, français, allemand et italien. La langue du système
  est utilisée automatiquement et l'IA répond dans cette langue. Changez-la dans
  **Paramètres → Langue**.

## Commandes

Tout se fait à la souris, mais il existe aussi des commandes : `/menu`, `/modelo`,
`/razonamiento`, `/permisos`, `/instrucciones`, `/carpeta`, `/historial`, `/conectar`, `/nuevo`,
`/ajustes`, `/inicio`, `/ayuda`. Et toutes celles de Pi : `/model`, `/thinking`, `/tree`, `/fork`,
`/compact`, `/login`, `/settings`, `/resume`, `/export`, `/hotkeys`...

```
hilosenda                  écran d'accueil
hilosenda <dossier>        ouvre le chat directement dans ce dossier
hilosenda --continuar      reprend la dernière conversation du dossier actuel
hilosenda -- <options>     transmet des options directement à Pi
```

## Où sont stockées les données

- Préférences : `~/.hilosenda/preferencias.json`
- Configuration de Pi (modèles, clés, conversations) : `~/.pi/agent/`, partagée avec Pi.
- Les clés API restent uniquement sur votre ordinateur.

## Désinstaller

- **Windows** : supprimez `%LOCALAPPDATA%\hilosenda` et les raccourcis.
- **macOS / Linux** : `rm -rf ~/.hilosenda ~/.local/bin/hilosenda ~/.local/share/applications/hilosenda.desktop`

## Conception

hilosenda **ne modifie pas le code de Pi** : il l'installe comme dépendance et l'étend via son
système officiel d'extensions. Développement : `npm install --ignore-scripts`, `npm start`, `npm test`.

## Licence

MIT. Basé sur [Pi](https://github.com/earendil-works/pi) (MIT, © Mario Zechner).
