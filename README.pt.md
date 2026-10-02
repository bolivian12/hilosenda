<p align="center"><img src="docs/icon.png" alt="hilosenda" width="128"></p>

<h1 align="center">hilosenda</h1>

<p align="center"><b><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt.md">Português</a> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.it.md">Italiano</a></b></p>

**Pi renovado: um assistente de IA para o console que se usa com cliques.**

hilosenda é uma versão "modificada" do agente de programação [Pi](https://github.com/earendil-works/pi).
Continua sendo um programa de console, mas foi pensado para quem **nunca usou algo assim**:
tudo se faz com botões e cliques do mouse, com explicações no seu idioma. Para quem já conhece o
Pi, **todos os comandos originais continuam funcionando** (digite `/` dentro do chat).


## Capturas de tela

<table>
<tr><td width="50%"><img src="docs/img/home.png" alt="Tela inicial"><br><sub>Tela inicial</sub></td><td width="50%"><img src="docs/img/chat-reply.png" alt="Chat com o painel lateral"><br><sub>Chat com o painel lateral</sub></td></tr>
<tr><td width="50%"><img src="docs/img/models.png" alt="Escolher modelo por provedor"><br><sub>Escolher modelo por provedor</sub></td><td width="50%"><img src="docs/img/connect.png" alt="Conectar qualquer IA"><br><sub>Conectar qualquer IA</sub></td></tr>
<tr><td width="50%"><img src="docs/img/settings.png" alt="Configurações (inclui idioma)"><br><sub>Configurações (inclui idioma)</sub></td><td width="50%"><img src="docs/img/tutorial.png" alt="Tutorial guiado na primeira vez"><br><sub>Tutorial guiado na primeira vez</sub></td></tr>
</table>

## Instalar

Não precisa instalar nada antes: se o seu computador não tem Node.js, o instalador baixa uma
cópia privada só para o hilosenda. Não pede permissões de administrador.

**Windows** (abra o PowerShell e cole):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.ps1 | iex"
```

Ou baixe [`install/install.cmd`](install/install.cmd) e dê um duplo clique. É criado um atalho
**hilosenda** na Área de Trabalho e no menu Iniciar.

**macOS e Linux** (abra o Terminal e cole):

```sh
curl -fsSL https://raw.githubusercontent.com/bolivian12/hilosenda/main/install/install.sh | sh
```

No macOS aparece `hilosenda.command` na Área de Trabalho; no Linux, o hilosenda aparece no menu
de aplicativos. Também pode digitar `hilosenda` em qualquer terminal.

> Para instalar outro branch (por exemplo uma versão de testes), defina `HILOSENDA_REF`:
> `curl -fsSL …/install.sh | HILOSENDA_REF=meu-branch sh`

Também pode baixar com git e executar o instalador:

```sh
git clone https://github.com/bolivian12/hilosenda.git hilosenda
cd hilosenda
sh install/install.sh        # no Windows: powershell -ExecutionPolicy Bypass -File install\install.ps1
```

**NixOS**: o instalador detecta e obtém o Node.js com Nix. Se usa home-manager, adicione
`~/.local/bin` a `home.sessionPath`. Recomendado: `fd` e `ripgrep` instalados com Nix.

Com Node.js 22.19 ou mais recente, também pode instalar com npm:

```sh
npm install -g --ignore-scripts github:bolivian12/hilosenda
```

## Comece em 3 passos

1. **Conecte uma IA.** Clique «Conectar uma IA». Se o Ollama ou LM Studio estiverem abertos, são
   detectados sozinhos. Se preferir uma IA na nuvem (Claude, GPT, Gemini, OpenRouter...), cole sua
   chave API: o hilosenda **detecta automaticamente todos os modelos disponíveis**.
2. **Escolha uma pasta.** Clique «Escolher pasta» e abre-se a janela normal do seu sistema (no
   Linux, a do seu ambiente via portal de desktop). Sem janelas (por SSH), abre-se um explorador
   dentro do console.
3. **Converse.** Clique «Começar a conversar», escreva o que precisa e tecle Enter.

Na primeira vez, um tutorial guiado ensina a usar tudo com o mouse.

## O que traz

- **Tela inicial** com animação, pastas recentes e **conversas anteriores** com busca.
- **Qualquer IA, sem depender de um provedor**: Ollama, LM Studio, llama.cpp, vLLM, Jan; Anthropic,
  OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Cerebras, Together, Fireworks,
  Moonshot, NVIDIA; assinaturas (Claude Pro/Max, ChatGPT, Copilot); ou qualquer URL compatível.
  Busque modelos por provedor e remova provedores.
- **Chat tranquilo** com painel lateral de botões grandes: anexar arquivo, trocar modelo,
  raciocínio, chats anteriores, novo chat, mais opções, início e **Parar**. O modelo escolhido
  sempre visível.
- **Imagens e documentos**: anexe com o botão, Ctrl+V, clique direito ou arrastando, com prévia
  antes de enviar. Colar funciona em todos os campos.
- **Permissões**: *Perguntar antes* (padrão), *Livre* ou *Só olhar*.
- **Instruções**: escolha qualquer arquivo `.md` ou `.txt` com regras para a IA.
- **Aparência de aplicativo de desktop**, com temas claro e escuro.
- **Idiomas**: espanhol, inglês, português, francês, alemão e italiano. Usa automaticamente o
  idioma do sistema e a IA responde nesse idioma. Mude em **Configurações → Idioma**.

## Comandos

Tudo se faz com cliques, mas também há comandos: `/menu`, `/modelo`, `/razonamiento`,
`/permisos`, `/instrucciones`, `/carpeta`, `/historial`, `/conectar`, `/nuevo`, `/ajustes`,
`/inicio`, `/ayuda`. E todos os do Pi: `/model`, `/thinking`, `/tree`, `/fork`, `/compact`,
`/login`, `/settings`, `/resume`, `/export`, `/hotkeys`...

```
hilosenda                  tela inicial
hilosenda <pasta>          abre o chat direto nessa pasta
hilosenda --continuar      continua a última conversa da pasta atual
hilosenda -- <opções>      passa opções direto ao Pi
```

## Onde ficam as coisas

- Preferências: `~/.hilosenda/preferencias.json`
- Configuração do Pi (modelos, chaves, conversas): `~/.pi/agent/`, compartilhada com o Pi.
- As chaves API ficam só no seu computador.

## Desinstalar

- **Windows**: apague `%LOCALAPPDATA%\hilosenda` e os atalhos.
- **macOS / Linux**: `rm -rf ~/.hilosenda ~/.local/bin/hilosenda ~/.local/share/applications/hilosenda.desktop`

## Como é feito

O hilosenda **não modifica o código do Pi**: instala-o como dependência e o amplia com o sistema
oficial de extensões. Desenvolvimento: `npm install --ignore-scripts`, `npm start`, `npm test`.

## Licença

MIT. Baseado no [Pi](https://github.com/earendil-works/pi) (MIT, © Mario Zechner).
