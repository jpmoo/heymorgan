# heymorgan

Morgan: a voice and chat assistant for a Linux desktop (Hyprland, Noctalia,
PipeWire). A local model served by Ollama does the talking. When a question is
beyond it, it consults "the Oracle" — Claude, through the `claude` command on
its own subscription login — and relays the answer.

## What is where

| | |
|---|---|
| `daemon.mjs` | The assistant: microphone, wake word, speech in and out, the model loop, memory, sight, MCP tools. Runs as `heymorgan.service`. |
| `bin/heymorgan` | The command: `settings`, `chat`, `toggle`, `say`, `type`, `stop`, `new`, `interview`, `voice`, `login`, `status`, `watch`. |
| `settings.mjs` | `heymorgan settings`: menus for everything in `~/.config/heymorgan/config.json`. |
| `lib.mjs` | Paths, defaults, the Oracle's login, encryption. |
| `history.mjs` | Every exchange, sealed, with embeddings for finding earlier ones. |
| `admin.mjs` | What the settings window may ask of the daemon: `heymorgan admin {"op": ..., "args": ...}`. |
| `reminders.mjs` | Timers and reminders: working out when they are due. |
| `speaker.mjs` | Whose voice is speaking, from taught voiceprints. |
| `mcp.mjs` | A small MCP client (stdio and HTTP with a header key; no OAuth). |
| `wake.mjs` | The wake-word spotter. |
| `kokoro.mjs` | The Kokoro voice, kept loaded as a helper process. |
| `keyring.py` | Fetches the data key from the login keyring. |
| `noctalia/` | The Noctalia plugin: voice popup, chat window, settings window, bar icon. |
| `systemd/` | The user unit. |
| `docs/protocol.md` | What a face or satellite may say to the daemon, and what it hears back: the versioned client protocol. |

## What it needs, beyond this repository

Under `~/.local/share/heymorgan/`, none of it committed here:

- `whisper.cpp/` built from source, and `models/ggml-base.en.bin` (speech to text)
- `piper/` and `voices/*.onnx` (the lighter voice)
- `kokoro-multi-lang-v1_0/` (the more natural voice)
- `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01/` (wake word)
- `speaker/nemo_en_titanet_small.onnx` (telling voices apart)

Also: Node 22, `npm install` here, an Ollama server with a tool-calling chat
model and an embedding model, the `claude` command, `pw-record`, `pw-play`,
`pw-cli`, `ffmpeg`, `grim`, `wl-paste`, and python3 with GObject bindings for
libsecret.

## Installing

```bash
npm install
ln -s "$PWD/bin/heymorgan" ~/.local/bin/heymorgan
ln -s "$PWD/noctalia" ~/.local/share/noctalia/plugins/morgan
cp systemd/heymorgan.service ~/.config/systemd/user/
systemctl --user enable --now heymorgan.service
ln -s "$PWD/window/morgan.svg" ~/.local/share/icons/hicolor/scalable/apps/io.github.jpmoo.heymorgan.svg
cp window/io.github.jpmoo.heymorgan.desktop ~/.local/share/applications/
noctalia msg plugins enable jpmoo/morgan
heymorgan settings
```

The unit file and the desktop file assume the repository is at
`~/Documents/Scripts/heymorgan`.

Until 2026-10-23 all of this was called heyclaude. The old names still work for
now, as `docs/rename.md` describes: `heyclaude` is a link to the command,
`heyclaude.service` an alias of the unit, `heyclaude.sock` is answered beside
`heymorgan.sock`, `HEYCLAUDE_*` variables are read, and the first start moves
`~/.config/heyclaude` and `~/.local/share/heyclaude` to `heymorgan`, leaving
links behind.

## Where things are kept

- Settings: `~/.config/heymorgan/config.json` (not encrypted; holds any MCP access keys).
- The Oracle's Claude login: `~/.config/heymorgan/anthropic` and `~/.config/heymorgan/claude`, apart from any other Claude login on the machine.
- Memory topics, saved pictures and the transcript: `~/.local/share/heymorgan/memory` and `history`, encrypted with a key in the login keyring.

## Security and privacy

Morgan is personal software: it runs for one person, on their own machines and
network, and it is not built to be a service on the open internet.

- **What leaves the machine is what you point it at.** Everything said to
  Morgan, and the memory that bears on it, goes to the Ollama server you set.
  Questions for the Oracle go to Anthropic through your Claude login, with the
  recent conversation for context. Tool servers (MCP) see what is asked of
  them. The Oracle's searches and the pages it fetches reach the web, and a
  voice you choose is downloaded from Hugging Face. Nothing goes anywhere else.
- **At rest.** Memory, saved pictures, kept documents and the transcript are
  encrypted (AES-256-GCM). The key is in the login keyring, or on a server in
  `data/memory.key`, readable only by its account. Keep a copy somewhere safe
  (`heymorgan key export`): without it the memory cannot be read. The settings
  file is not encrypted, and holds any access keys for tool servers.
- **Changes to your services wait for a yes.** Morgan puts a change forward
  (a task created, an event moved) and makes it only when you agree.
- **Looking is on request.** The screen, clipboard or camera is looked at only
  when asked, and only on the device asked; a picture is kept only when you say
  to keep it.
- **Devices.** When Morgan runs on a server, each device has its own key,
  issued by the server (`heymorgan access add <device>`, shown once, stored only
  as a hash) and revocable (`heymorgan access remove <device>`). A key gives full
  use of Morgan: its memory, its history and its settings, so keep keys like
  passwords. Settings that are commands Morgan runs (the voice, recording and
  playback commands, the camera, the Oracle's program and tools, tool servers
  started as commands) can only be changed on the machine itself, never from a
  device.
- **The network.** On the home network, devices connect over a plain
  WebSocket, so a key crosses the local network unencrypted. From away, put
  the server behind TLS (`docs/deploy.md` shows Caddy over Tailscale). Exposed
  to the public internet (Tailscale Funnel, a forwarded port), only devices with
  a key get in, but nothing limits how often a stranger may try.
- **The Oracle reads the web.** It has no shell and cannot touch files, but it
  can search and fetch pages, and a page can carry instructions meant for it,
  with the recent conversation in its hands. To narrow that, allow it search
  alone: set `oracle.tools` and `oracle.allowedTools` to `["WebSearch"]`. Turn
  off any claude.ai connectors on the Oracle's Claude account that it should
  not use.

Report a security problem privately to the owner rather than in a public issue.

## Credits

Morgan stands on other people's work. Bundled in this repository:

- [markdown-it](https://github.com/markdown-it/markdown-it) (MIT), in
  `window/markdown-it.min.js`, with its notice.

Used through npm:

- [ws](https://github.com/websockets/ws) (MIT)
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) and `sherpa-onnx-node`
  (Apache-2.0), for the wake word, speaker recognition and the Kokoro voice

Downloaded or installed separately, each under its own license:

- [Ollama](https://ollama.com) (MIT), which serves the local models
- [Qwen](https://github.com/QwenLM) (the default chat model; see its model card
  for its license) and [nomic-embed-text](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
  (Apache-2.0), run by Ollama
- [Claude](https://www.anthropic.com/claude) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code),
  used through your own Claude login and Anthropic's terms
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (MIT) and OpenAI's
  [Whisper](https://github.com/openai/whisper) models (MIT), for speech to text
- [Piper](https://github.com/rhasspy/piper) and its
  [voices](https://huggingface.co/rhasspy/piper-voices); each voice carries its
  own license and attribution on its model card
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0), as
  packaged for sherpa-onnx
- the sherpa-onnx keyword-spotting model trained on GigaSpeech, from the
  [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases)
- NVIDIA NeMo's [TitaNet](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/nemo/models/titanet_small)
  speaker model, for telling voices apart (see its model card for its license)
- [Qt for Python](https://doc.qt.io/qtforpython-6/) (PySide6 and QtWebEngine,
  LGPL-3.0), for the window
- [Noctalia](https://github.com/noctalia-dev/noctalia-shell), the shell the
  plugin runs in, and its icon font from [Tabler Icons](https://tabler.io/icons) (MIT)
- [Hyprland](https://hyprland.org), [PipeWire](https://pipewire.org),
  [FFmpeg](https://ffmpeg.org), grim, wl-clipboard, zenity and Poppler's
  `pdftotext`, which Morgan calls as programs
- the [Model Context Protocol](https://modelcontextprotocol.io), which its tool
  client speaks

## License

GPL-3.0-only — see [LICENSE](LICENSE). Also available on other terms from the
owner, as Talaris is. Contributions need the [Contributor License
Agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).
