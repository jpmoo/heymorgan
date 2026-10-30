# Morgan on a Raspberry Pi, in a speaker

A Pi in an Echo Dot (3rd generation) enclosure: voice only, no screen, no
camera, a device of the same brain the laptop uses (the home server, or the
laptop itself if that is where the brain is). The plan behind it is
in [server-and-satellites.md](server-and-satellites.md); this is how to set one
up today, and what is not there yet.

## What runs where

The Pi is a **device**: it listens for the wake word, sends what is said to
the brain, and plays the answer the brain sends back as sound. The brain
turns the speech into words and the answer into speech, and knows whose voice
it is ([deploy.md](deploy.md), §8); everything else (memory, the model, the
Oracle, Hermes, reminders) is there too, exactly as for the laptop. So the Pi
needs no Whisper, Piper, Kokoro or voice model: only the wake-word spotter.

The brain has to be doing speech for this (`heymorgan status` on the Pi says
`"speech":"brain"`). A brain that is not yet does none for the Pi, which then
has nothing to hear or speak with; until then, install the small models below
on the Pi (*If the Pi does its own speech*).

## The hardware

- A Raspberry Pi Zero 2 W (512 MB), which fits the 3rd-generation Dot's 99 mm
  shell; a Pi 3 A+ as the fallback. A Pi 5 does not fit.
- The Adafruit Voice Bonnet: two microphones, a speaker amplifier, a button and
  three LEDs, on ALSA. The Dot's speaker, or Adafruit's 40 mm one.
- Optionally, a small NeoPixel ring behind the Dot's light diffuser, on the
  Pi's SPI pins. The ring, the bonnet's three LEDs and its button are run by
  `pi/lights.py` (*Lights and the button*, below).

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
5. **The wake word**: the sherpa-onnx keyword-spotting model, under
   `~/.local/share/heymorgan/`, as the README's "What it needs" says.

## Making it a device

A key for it, from the brain: on the laptop (or anywhere Morgan runs),
Settings → Morgan → Where → Devices → Add, or

```bash
heymorgan devices add kitchen-dot
```

On the **Pi**, with the line that prints:

```bash
~/heymorgan/bin/heymorgan connect home-server:8790 hc_… kitchen-dot
```

Then the Pi's own settings, if it needs any, which override the brain's for
this device only and are never set from the network. With plain ALSA instead of
PipeWire:

```bash
bin/heymorgan device echoCancel false
bin/heymorgan device record "arecord -q -f S16_LE -r 16000 -c 1 -t raw"
bin/heymorgan device play "aplay -q -f S16_LE -r {rate} -c 1 -t raw"
```

`bin/heymorgan device` lists them; `bin/heymorgan device <setting> --clear`
goes back to the brain's.

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

## Lights and the button

`pi/lights.py` shows Morgan's state on the bonnet's LEDs and a ring (a
breathing blue while listening, a sweep while thinking, white while speaking,
red when muted, blinking amber when the brain cannot be reached), and turns
the button into a press (talk, or stop an answer) and a hold (mute or unmute
the microphone):

```bash
pip install --break-system-packages adafruit-blinka adafruit-circuitpython-dotstar adafruit-circuitpython-neopixel-spi
```

```bash
bin/heymorgan device lights "python3 $HOME/heymorgan/pi/lights.py --ring 12"
```

Leave out `--ring 12` without a ring. Its pins are the bonnet's as Adafruit's
guide gives them (the LEDs on D6 and D5, the button on D17); if the guide says
otherwise for your board, `--clock`, `--data` and `--button` change them.
`python3 pi/lights.py --dry` shows the states on the terminal with no hardware.
`bin/heymorgan mute` does what holding the button does.

## Teaching it your voice

It already knows the voices the brain knows: the first device a voice is taught
on makes the one every device uses. If the Dot hears you poorly (the brain's
Devices list says so), teach it again there, as the Dot's own. From the laptop,
where the Dot then says each line for you to repeat back:

```bash
heymorgan enroll Jeff --here --device kitchen-dot
```

or say to the Dot, once it knows you, "Morgan, learn my voice on this one".

## Not there yet

- **Measured on a Zero 2 W**: whether the wake-word spotter keeps up, and
  `pi/lights.py`'s pins on a real bonnet. Both were written without one to hand.
- **Reminders** go off on every device that can speak, the Dot included; that
  is as decided.

With the laptop and the Dot in one room, both hear "Hey Morgan", and the brain
lets the one that heard it better answer; the other stands down.

## If the Pi does its own speech

For a brain not doing speech yet, or with `bin/heymorgan device speech here`:
under `~/.local/share/heymorgan/`, whisper.cpp built from source with
`models/ggml-tiny.en.bin`, Piper with one `low` or `medium` voice (**no
Kokoro**, whose model alone is too big for 512 MB), the TitaNet speaker model,
and 1 GB of swap (`/etc/dphys-swapfile`). Then:

```bash
bin/heymorgan device engine piper
bin/heymorgan device voice en_US-amy-low
bin/heymorgan device stt "'$HOME/.local/share/heymorgan/whisper.cpp/build/bin/whisper-cli' -m '$HOME/.local/share/heymorgan/models/ggml-tiny.en.bin' -f {file} -nt -np -t 4 --prompt {prompt}"
```
