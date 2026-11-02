# heymorgan

Morgan: a voice and chat assistant for a Linux desktop (Hyprland, Noctalia,
PipeWire), and for a Raspberry Pi in a speaker. A local model served by Ollama does the talking. When a question is
beyond it, it consults "the Oracle" — Claude, through the `claude` command on
its own subscription login — and relays the answer.

## Brain and devices

Morgan has two parts:

- **The brain** holds memory, runs the model loop and the Oracle, keeps
  reminders and the voices it knows, and does speech.
- **Devices** are the microphone, wake word and speaker, plus whatever screen,
  folders or tools a device offers.

A device reaches its brain at an address, using a key. Every brain is a server,
even one serving a single laptop. The only difference between setups is the
address, so you get the same settings, the same faces and the same voice
everywhere.

There are three more pieces, and each can run on the same machine as the brain
or on another one:

- **Ollama** answers. Point the brain at it with the `ollama.url` setting.
- **The speech service** handles speech for the brain (`node speech.mjs serve`).
  It is optional: without it, the brain does speech itself.
- **The Oracle** is the `claude` command, run where the brain runs, with its own
  login.

## Ways to set it up

Pick a row, then follow its steps under [Installing](#installing).

| Setup | The brain | Speech | Devices | Steps |
|---|---|---|---|---|
| **A. All on one laptop** | this laptop (`heymorgan-brain`) | this laptop | this laptop | [Common](#common-to-every-machine), then [A](#a-everything-on-one-laptop) |
| **A + a speech machine** | this laptop | another machine with a GPU | this laptop | A, then [Speech elsewhere](#speech-on-another-machine) |
| **A + more devices** | this laptop, listening on the network | this laptop | this laptop, a Pi, another computer | A, then [More devices](#letting-more-devices-in) |
| **B. A home server** | the home server (`heymorgan.service` from its checkout) | the server, or a speech machine | laptops, Pis | [B](#b-the-brain-on-a-home-server) and [deploy.md](docs/deploy.md), then a device on each machine |
| **C. A device only** | somewhere else | done by the brain | this machine | [Common](#common-to-every-machine), then [C](#c-a-device-of-a-brain-elsewhere) |
| **D. A voice-only speaker** | somewhere else | done by the brain | a Pi in a speaker | [pi.md](docs/pi.md) |

A few things are true whichever setup you pick:

- **Moving between A and C is one command.** `heymorgan connect` on a laptop
  stops its own brain and uses the other one. `heymorgan serve` (or `heymorgan
  disconnect`) brings the laptop's brain back, along with the memories it had
  before. Memory does not travel when you switch. To move it, follow
  [deploy.md §3](docs/deploy.md#3-what-morgan-knows-moved-from-the-laptop).
- **Each device can do its own speech** instead of the brain:
  `heymorgan device speech here`. The default, `auto`, uses the brain's speech
  when the brain offers it and the device's own otherwise. With `here`, that
  device needs the speech models listed under
  [What it needs](#what-it-needs-beyond-this-repository).
- **Talaris and Noctalia are optional.** They are faces: a pleasant settings
  window and a place to chat. Everything they set can also be set with
  `heymorgan settings`, `heymorgan device …` and `heymorgan admin …`, and you
  can talk to Morgan with `heymorgan chat`, `heymorgan window` or a wake word.
- **When two devices hear "Hey Morgan"**, the one that heard it best answers
  ([protocol.md](docs/protocol.md) §5). Voiceprints live on the brain. The first
  device to learn a voice teaches it to every device, and any device can learn
  it again for itself (`heymorgan enroll <name> --here`).
- **`heymorgan status` says which setup is running.** On a device, `"role"` is
  `client`, with `"server"` set to the brain's address. `"speech"` is `brain`
  or `here`. `heymorgan brain status` asks the brain on this machine, if
  there is one, and there `"speech"` is `service` when a speech service does
  its speech. `"role":"local"` means either a test run or a machine that
  couldn't set up its own brain (`heymorgan log` says why).

## What is where

| | |
|---|---|
| `daemon.mjs` | The assistant: as a device, the microphone, wake word and speaker, sight and folders (`heymorgan.service`); as a brain, the model loop, memory, MCP tools and speech for its devices (`heymorgan-brain.service` on a laptop, `heymorgan-server.service` on a home server). |
| `speech.mjs` | Speech in and out, and voiceprints: whisper.cpp, Kokoro or Piper, TitaNet; or, as `node speech.mjs serve`, the same for brains on other machines. |
| `bin/heymorgan` | The command. `heymorgan help` lists everything: talking (`chat`, `window`, `say`, `type`, `toggle`), setting up (`settings`, `serve`, `connect`, `devices`, `device`, `enroll`, `login`, `key`), and looking (`status`, `log`, `watch`, `tools`, `brain …`). |
| `env.mjs` | Which part this copy plays (brain, device, or a test run's whole Morgan) and where it keeps things, settled before anything else loads. |
| `settings.mjs` | `heymorgan settings`: menus for Morgan's settings. |
| `lib.mjs` | Paths, defaults, the Oracle's login, encryption. |
| `history.mjs` | Every exchange, sealed, with embeddings for finding earlier ones. |
| `admin.mjs` | What the settings window may ask of the daemon: `heymorgan admin {"op": ..., "args": ...}`. |
| `access.mjs` | The brain's device keys: issued one per device, shown once, kept as hashes. |
| `sort.mjs` | What kind of turn this is (about you, the world, or now; whether it needs a tool, a sum, a reminder or the Oracle), decided before the model answers. |
| `calc.mjs` | Arithmetic, done exactly rather than by the model. |
| `weather.mjs` | The weather from Open-Meteo (no key): for a place named, where the asking device is, or `home`. |
| `reminders.mjs` | Timers and reminders: working out when they are due. |
| `speaker.mjs` | Taught voiceprints: the set every device shares, and a device's own. |
| `mcp.mjs` | A small MCP client (stdio and HTTP with a header key; no OAuth). |
| `wake.mjs` | The wake-word spotter. |
| `kokoro.mjs` | The Kokoro voice, kept loaded as a helper process. |
| `keyring.py` | Fetches the data key from the login keyring. |
| `noctalia/` | The Noctalia plugin: voice popup, chat window, settings window, bar icon. |
| `window/` | `heymorgan window`: the conversation as an ordinary application window (PySide6). |
| `systemd/` | The device's user unit, the laptop brain's (filled in by `heymorgan serve`), and templates for a home server's brain and a speech service. |
| `pi/lights.py` | A speaker's lights and button (the Voice Bonnet), as a device's `lights` helper. |
| `restart.sh` | On a home server: pull, reinstall, check and restart, going back if a step fails. |
| `tests/` | Trials run beside the real Morgan, never touching its memory, screen or microphone (`tests/trial.sh`). |
| `docs/protocol.md` | What a face or satellite may say to the daemon, and what it hears back: the versioned client protocol. |
| `docs/deploy.md` | Putting Morgan's brain on a home server, with the laptop as its first client; a speech service. |
| `docs/server-and-satellites.md` | The plan behind brain and devices, and how far it has got. |
| `docs/rename.md` | The move from heyclaude to heymorgan, and the old names still answered. |
| `docs/pi.md` | A Raspberry Pi in a speaker as a voice-only client: setup, its own settings, what is not there yet. |

## What it needs, beyond this repository

None of this is committed here. Models go under `~/.local/share/heymorgan/`,
in the account that uses them.

| What | Brain | Speech (the brain, a speech service, or a device set to `here`) | Device |
|---|:-:|:-:|:-:|
| Node 22, and `npm ci` in a checkout | ✓ | ✓ | ✓ |
| An Ollama server with a tool-calling chat model and an embedding model, on any machine | ✓ | | |
| The `claude` command (for the Oracle) | ✓ | | |
| python3 with GObject bindings for libsecret (the login keyring) | ✓ (a laptop brain; a server keeps its key in `data/memory.key`) | | a desktop doing its own speech, to seal voices taught to it alone (a Pi keeps `device.key`) |
| `whisper.cpp/`, built from source, and `models/ggml-base.en.bin` (speech to text) | | ✓ | |
| `kokoro-multi-lang-v1_0/` (the more natural voice), or `piper/` and `voices/*.onnx` (the lighter one) | | ✓ | |
| `speaker/nemo_en_titanet_small.onnx` (telling voices apart) | | ✓ | |
| `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01/` (the wake word) | | | ✓ |
| `pw-record`, `pw-play` and `pw-cli` (or ALSA commands set with `heymorgan device record` / `play`) | | | ✓ |
| `grim`, `wl-paste` and `hyprctl` (the screen and clipboard, on request), `ffmpeg` (the camera), `pdftotext` (PDFs in shared folders), `zenity` (choosing files and folders) | | | a desktop |
| `ffmpeg` (shrinking a picture you ask it to keep) | ✓ | | |
| PySide6 with QtWebEngine (`heymorgan window`) | | | a desktop, if wanted |

If the brain does speech and a device leaves `speech` at `auto`, that device
needs only the wake-word model.

## Installing

### Common to every machine

```bash
git clone https://github.com/jpmoo/heymorgan.git ~/Documents/Scripts/heymorgan
```

```bash
cd ~/Documents/Scripts/heymorgan && npm ci
```

```bash
ln -s "$PWD/bin/heymorgan" ~/.local/bin/heymorgan
```

`systemd/heymorgan.service` expects the checkout at
`~/Documents/Scripts/heymorgan` and Node at `/usr/bin/node`, and
`window/io.github.jpmoo.heymorgan.desktop` names the full path to
`bin/heymorgan` in its `Exec=` line. Edit them if yours differ. (`heymorgan
serve` writes the brain's unit itself, with this checkout and this Node.)

### A. Everything on one laptop

Install the device's service:

```bash
cp systemd/heymorgan.service ~/.config/systemd/user/
```

```bash
systemctl --user enable --now heymorgan.service
```

The first time it starts with no brain to go to, it runs `heymorgan serve`
itself. That installs `heymorgan-brain.service`, which listens on
`localhost:8790`, gives this machine a key, and connects to it. Then use
`heymorgan settings` (or Talaris) to set Ollama, log the Oracle in
(`heymorgan login`), and teach it your voice (`heymorgan enroll <your name>`).

For the faces, which are optional, set up the Noctalia plugin and the window:

```bash
ln -s "$PWD/noctalia" ~/.local/share/noctalia/plugins/morgan && noctalia msg plugins enable jpmoo/morgan
```

```bash
ln -s "$PWD/window/morgan.svg" ~/.local/share/icons/hicolor/scalable/apps/io.github.jpmoo.heymorgan.svg && cp window/io.github.jpmoo.heymorgan.desktop ~/.local/share/applications/
```

Talaris finds Morgan on its own, through `heymorgan.sock`.

### Speech on another machine

To move the brain's speech to a machine with a GPU, such as the one running
Ollama, put a checkout there along with the speech models, set `SPEECH_KEY` in
its `.env`, and run `systemd/heymorgan-speech.service`. Then tell the brain
where it is: `speechUrl` and `speechKey`.
[deploy.md §8](docs/deploy.md#8-speech-on-the-brain) has the steps. These two
settings can only be changed on the brain's own machine. For a laptop brain:

```bash
heymorgan brain admin '{"op":"config.set","args":{"values":{"speechUrl":"http://ai-server:8791","speechKey":"…"}}}'
```

### Letting more devices in

A laptop brain lets in only devices on its own machine until you tell it to
listen on the network: the "Let other devices in" switch in Talaris or the
Noctalia settings, or

```bash
heymorgan brain admin '{"op":"config.set","args":{"values":{"listen":"network"}}}'
```

Then give each new device a key. Run this, then run the `heymorgan connect`
line it prints on that device, with this laptop's address filled in
(`laptop-name:8790`):

```bash
heymorgan devices add kitchen
```

A key crosses the network unencrypted, so keep this to your home network or
Tailscale. Remember that the laptop has to be awake for the other devices to
reach Morgan. A brain that should always be there belongs on a server (B).

### B. The brain on a home server

The brain runs as a system service from its own checkout, with a `.env` (copy
`.env.example`) that sets the port and the address it listens on. Everything it
keeps goes into the checkout's `data/` folder. [deploy.md](docs/deploy.md)
covers the whole thing: the Oracle's login, moving a laptop's memory across, the
unit, TLS for reaching it from away, keys, speech, and `./restart.sh` for
updates. On the server, run `./bin/heymorgan` from the checkout.

### C. A device of a brain elsewhere

Install the service as in A, but get a key from the brain first
(`heymorgan devices add <name>` there, or Talaris → Morgan → Where → Devices),
then:

```bash
heymorgan connect home-server:8790 hc_… laptop
```

It uses the brain's speech, settings, memory and voices. The settings this
device keeps for itself, such as a voice or sound commands, are set with
`heymorgan device <setting> <value>`. If the brain can't be reached, it says
"I can't reach home right now" in Morgan's voice (kept from the last time it
could), or plays two falling tones if it has never heard that voice.

### D. A Raspberry Pi in a speaker

See [pi.md](docs/pi.md). It covers the hardware, the wake word on a Zero 2 W,
the lights and button (`pi/lights.py`), and teaching it your voice, either by
voice or from another device.

### Coming from heyclaude

Until 2026-10-23 all of this was called heyclaude. The old names still work for
now, as `docs/rename.md` describes: `heyclaude` is a link to the command,
`heyclaude.service` an alias of the unit, `heyclaude.sock` is answered beside
`heymorgan.sock`, `HEYCLAUDE_*` variables are read, and the first start moves
`~/.config/heyclaude` and `~/.local/share/heyclaude` to `heymorgan`, leaving
links behind.

## Where things are kept

- Settings: the brain's, in `~/.config/heymorgan/config.json` (a home server's: `data/config.json`), not encrypted, holding any MCP access keys. A device keeps a copy of them in `mirror.json` beside it, and its own in `client.json`.
- The Oracle's Claude login: `~/.config/heymorgan/anthropic` and `~/.config/heymorgan/claude`, apart from any other Claude login on the machine.
- Memory topics, saved pictures, voiceprints and the transcript: `~/.local/share/heymorgan/memory` and `history`, encrypted with a key in the login keyring — on the machine the brain is on.
- The brain's device keys, as hashes: `~/.config/heymorgan/access.json` (a home server's: `data/access.json`). A device's own key and settings: `~/.config/heymorgan/client.json`.

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
  issued by the brain (`heymorgan devices add <device>`, shown once, stored only
  as a hash) and revocable (`heymorgan devices remove <device>`). A key gives full
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

Copyright © 2026 Jeff Moore. GPL-3.0-only — see [LICENSE](LICENSE). Also available on other terms from the
owner, as Talaris is. Contributions need the [Contributor License
Agreement](CLA.md); see [CONTRIBUTING.md](CONTRIBUTING.md).
