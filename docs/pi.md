# Morgan on a Raspberry Pi, in a speaker

A Pi in an Echo Dot (3rd generation) enclosure: voice only, no screen, no
camera, a client of the same home server the laptop uses. The plan behind it is
in [server-and-satellites.md](server-and-satellites.md); this is how to set one
up today, and what is not there yet.

## What runs where

The Pi is a **client**: it listens for the wake word, hears what is said,
turns it into text, sends it to the server, and speaks the answer. Everything
else (memory, the model, the Oracle, Hermes, reminders) is on the home server,
exactly as for the laptop.

Today the Pi turns speech into text and text into speech **itself** (whisper.cpp
and Piper). Moving both to the AI server (phase 1 of the plan) would make it
much lighter; until then, choose the small models below.

## The hardware

- A Raspberry Pi Zero 2 W (512 MB), which fits the 3rd-generation Dot's 99 mm
  shell; a Pi 3 A+ as the fallback. A Pi 5 does not fit.
- The Adafruit Voice Bonnet: two microphones, a speaker amplifier, a button and
  three LEDs, on ALSA. The Dot's speaker, or Adafruit's 40 mm one.
- Optionally, a small NeoPixel ring behind the Dot's light diffuser. **Not used
  by Morgan yet**: the ring, the bonnet's LEDs and its button are phase 4.

## The software

On Raspberry Pi OS Lite (64-bit, Bookworm or later):

1. **The bonnet's driver**, as Adafruit's guide for it says; then check it is
   heard and plays: `arecord -l`, `aplay -l`.
2. **Node 22**, from NodeSource (Debian's is older), and `git`, `ffmpeg`,
   `python3`, `build-essential`, `cmake`.
3. **Sound.** Either PipeWire, which Morgan uses by default and which gives echo
   cancelling (so "Morgan" said over her own answer is heard):
   `sudo apt install pipewire pipewire-pulse wireplumber`, or plain ALSA, with
   `record` and `play` set on the device (below) and echo cancelling off.
4. **The repository**, and its dependencies:
   ```bash
   git clone https://github.com/jpmoo/heymorgan.git ~/heymorgan
   ```
   ```bash
   cd ~/heymorgan && npm ci
   ```
5. **Speech and wake word**, under `~/.local/share/heymorgan/`, as on the laptop
   (the README's "What it needs"), but small:
   - whisper.cpp built from source, with `models/ggml-tiny.en.bin` rather than
     `base.en`;
   - Piper and one `low` or `medium` voice (`heymorgan voice <name>` fetches
     one); **no Kokoro**, whose model alone is too big for 512 MB;
   - the sherpa-onnx keyword-spotting model (the wake word);
   - the TitaNet speaker model, to answer only your voice.
6. **Swap**: 1 GB (`/etc/dphys-swapfile`), for headroom while Whisper works.

## Making it a client

On the **server**, a key for it:

```bash
./bin/heymorgan access add kitchen-dot
```

On the **Pi**, with the line that prints:

```bash
~/heymorgan/bin/heymorgan connect home-server:8790 hc_… kitchen-dot
```

Then the Pi's own settings, which override the server's for this device only
and are never set from the network:

```bash
cd ~/heymorgan
bin/heymorgan device engine piper
bin/heymorgan device voice en_US-amy-low
bin/heymorgan device stt "'$HOME/.local/share/heymorgan/whisper.cpp/build/bin/whisper-cli' -m '$HOME/.local/share/heymorgan/models/ggml-tiny.en.bin' -f {file} -nt -np -t 4 --prompt {prompt}"
```

With plain ALSA instead of PipeWire, also:

```bash
bin/heymorgan device echoCancel false
bin/heymorgan device record "arecord -q -f S16_LE -r 16000 -c 1 -t raw"
bin/heymorgan device play "aplay -q -f S16_LE -r {rate} -c 1 -t raw"
```

`bin/heymorgan device` lists them; `bin/heymorgan device <setting> --clear`
goes back to the server's.

## The service

A user service, started at boot without anyone logging in:

```bash
mkdir -p ~/.config/systemd/user
sed -e "s|%h/Documents/Scripts/heymorgan|$HOME/heymorgan|" -e '/^Alias=/d' \
  -e '/^\[Service\]/a Environment=HEYMORGAN_HEADLESS=1' \
  systemd/heymorgan.service > ~/.config/systemd/user/heymorgan.service
```

```bash
sudo loginctl enable-linger "$USER"
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now heymorgan
```

`HEYMORGAN_HEADLESS=1` tells Morgan there is no desktop: she does not wait for
one at start, and keeps her key (which seals only the voices taught to this
device) in `~/.config/heymorgan/device.key`, made the first time it is needed
and readable only by this account.

Check it: `bin/heymorgan status` should say `"role":"client"`, and
`journalctl --user -u heymorgan -n 20` should end with `home: connected`.

## Teaching it your voice

The Pi's microphones are not the laptop's, so it learns your voice for itself.
Until it has, it answers anyone. Teach it, then say the phrases it asks for:

```bash
bin/heymorgan enroll Jeff
```

## Not there yet

- **Two devices, one "Hey Morgan".** With the laptop and the Dot in one room,
  both wake and both answer. Choosing one (the plan's phase 3) is not built.
- **The ring, the LEDs and the button** (phase 4): the Dot shows nothing, and
  the button does nothing.
- **Speech on the AI server** (phase 1): until it is, the first words of an
  answer come later than on the laptop, by however long Whisper and Piper take
  on the Pi.
- **Reminders** go off on every device that can speak, the Dot included; that
  is as decided.
