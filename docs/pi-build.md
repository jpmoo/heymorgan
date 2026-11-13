# Building the Dot, step by step

A Raspberry Pi Zero 2 W and an Adafruit Voice Bonnet in a 3rd-generation Echo
Dot's shell, as a device of Morgan's brain. [pi.md](pi.md) says what the Dot
is and what it runs; this is the build, in order, with a check after each step.
Don't go on past a check that fails.

**Part 1 is all on the bench, and nothing is cut.** The Dot is opened only in
Part 2, once everything works in the open, so a wrong part or a pin that
doesn't match is found while it is still easy to fix.

Throughout, `dot` is the Pi's hostname and `home-server:8790` the brain. Change
either if yours differ. Commands are marked with where they run: **laptop** or
**Pi**.

## What you need

**Parts**

- Raspberry Pi Zero 2 W, with its header soldered on (the "WH"), or a 2×20 male
  header to solder yourself
- Adafruit Voice Bonnet (product 4757)
- microSD card, 16 GB or more
- 5 V, 2.5 A micro-USB supply (the official Pi one), and a right-angle
  micro-USB cable if you use the one-cable route in step F10
- a speaker: the Dot's own (1.6 inch), or Adafruit's 40 mm, for the bench at
  least
- a JST-PH 2-pin cable (Adafruit 261), for the speaker
- optionally, for the light ring: a NeoPixel ring or a short NeoPixel strip
  sized to the Dot's diffuser (step F4 measures it), a 330 Ω resistor and a
  470–1000 µF capacitor (6.3 V or more)
- optionally, for the Dot's Action key: one 6×6 mm tactile switch and a scrap
  of perfboard
- a small heatsink for the Zero 2 W's chip
- thin silicone wire (26–30 AWG), heat-shrink, Kapton tape, double-sided foam
  tape, nylon M2.5 standoffs and screws

**Tools**: soldering iron and solder, Torx T6 (and T6 security, as some Dots
have it), T7, a spudger or plastic pry tools, a hair dryer, flush cutters, a
multimeter, a small drill (1.5 mm bit) or pin vise, a needle file or step
drill, hot glue.

---

# Part 1 — on the bench

## 1. The SD card

**Laptop.** In Raspberry Pi Imager choose *Raspberry Pi Zero 2 W*, then
*Raspberry Pi OS Lite (64-bit)*. Before writing, open its settings
(*Edit settings* / the customisation step) and set:

- hostname `dot`
- a username and password
- your Wi-Fi network and country
- SSH on, with your public key (`~/.ssh/id_ed25519.pub`)

Write it, put the card in the Pi, and power it (no bonnet yet). Give it two
minutes the first time.

**Check (laptop):**

```bash
ssh dot.local uname -r
```

It prints the kernel version, such as `6.12.…`. Note it: step 4 needs it.

## 2. Up to date, with I2C and SPI on

**Pi:**

```bash
sudo apt update && sudo apt full-upgrade -y
```

```bash
sudo raspi-config nonint do_i2c 0 && sudo raspi-config nonint do_spi 0
```

```bash
sudo apt install -y git i2c-tools && sudo reboot
```

**Check (Pi):** `ls /dev/i2c-1 /dev/spidev0.0` lists both.

## 3. The bonnet on

**Shut the Pi down and unplug it first:** `sudo poweroff`, wait for the green
light to stop, then pull the power. Press the bonnet onto the header, all 40
pins, squarely. Power up again.

**Check (Pi):**

```bash
sudo i2cdetect -y 1
```

`1a` appears in the grid (the bonnet's audio chip). `UU` there instead is fine
too: it means the driver from step 4 already has it.

## 4. The bonnet's sound driver

Adafruit's guide installs it from a community copy of Seeed's driver, kept up
to date for each kernel. **Pi:**

```bash
git clone https://github.com/HinTak/seeed-voicecard ~/seeed-voicecard && cd ~/seeed-voicecard && git branch -r
```

Pick the branch matching the first two numbers of the kernel from step 1
(`v6.12` for `6.12.x`), then:

```bash
git checkout v6.12 && sudo ./install.sh && sudo reboot
```

**Check (Pi):**

```bash
aplay -l && arecord -l
```

Both list a card named `seeed2micvoicec`. Note its card number (often 1 or 2
on a Zero).

## 5. Sound in and out

Connect the bench speaker to the JST cable and plug it into the bonnet's
**Left** speaker socket (bottom middle, labelled). Slide the bonnet's **Audio
On/Off** switch to On.

**Pi:**

```bash
alsamixer
```

Press **F6**, choose `seeed2micvoicec`, and bring the *Speaker* level to about
60 % (Adafruit: "plenty loud"). Esc to leave.

```bash
speaker-test -D plughw:seeed2micvoicec -c 2 -t wav -l 1
```

**Check:** you hear "front left, front right" (only the left from a speaker on
Left; that is right).

Then the mics. Record five seconds, and play them back:

```bash
arecord -D plughw:seeed2micvoicec -f S16_LE -r 16000 -c 1 -d 5 /tmp/hello.wav && aplay -D plughw:seeed2micvoicec /tmp/hello.wav
```

**Check:** your voice comes back, clearly and not faintly. If faint, raise the
*Capture* level in `alsamixer` and try again.

## 6. Node and Morgan

**Pi.** Node 22, from NodeSource (Debian's is older):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh && sudo bash /tmp/nodesource.sh && sudo apt install -y nodejs ffmpeg python3-pip
```

```bash
git clone https://github.com/jpmoo/heymorgan.git ~/heymorgan && cd ~/heymorgan && npm ci
```

**Check (Pi):** `node --version` says `v22.…`, and `npm ci` ends without
errors.

## 7. The wake word

The spotter's model is on the laptop already; copy it across. **Laptop:**

```bash
ssh dot.local mkdir -p .local/share/heymorgan
```

```bash
rsync -a ~/.local/share/heymorgan/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01 dot.local:.local/share/heymorgan/
```

**Check (Pi):** `du -sh ~/.local/share/heymorgan/sherpa-onnx-kws-*` says about
20M.

## 8. PipeWire

Morgan uses PipeWire by default, for echo cancelling: "Morgan" said over her
own answer is still heard. **Pi:**

```bash
sudo apt install -y pipewire pipewire-pulse wireplumber && sudo loginctl enable-linger "$USER"
```

```bash
sudo reboot
```

**Check (Pi):** `wpctl status` lists the seeed card under both *Sinks* and
*Sources*.

If PipeWire won't settle on the Zero, use plain ALSA instead; it is set in
step 9.

## 9. A key, and the Dot as a device

**Laptop:**

```bash
heymorgan devices add dot
```

It prints a `heymorgan connect` line. **Pi**, with the brain's address in
place of `<this brain's address>`:

```bash
~/heymorgan/bin/heymorgan connect home-server:8790 hc_… dot
```

Only for plain ALSA instead of PipeWire (step 8), also:

```bash
cd ~/heymorgan && bin/heymorgan device echoCancel false && bin/heymorgan device record "arecord -q -D plughw:seeed2micvoicec -f S16_LE -r 16000 -c 1 -t raw" && bin/heymorgan device play "aplay -q -D plughw:seeed2micvoicec -f S16_LE -r {rate} -c 1 -t raw"
```

## 10. The service

**Pi:**

```bash
mkdir -p ~/.config/systemd/user && cd ~/heymorgan && sed -e "s|%h/Documents/Scripts/heymorgan|$HOME/heymorgan|" -e "s|/usr/bin/node|$(command -v node)|" -e '/^Alias=/d' -e '/^\[Service\]/a Environment=HEYMORGAN_HEADLESS=1' systemd/heymorgan.service > ~/.config/systemd/user/heymorgan.service
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now heymorgan
```

**Check (Pi):**

```bash
~/heymorgan/bin/heymorgan status
```

It says `"role":"client"`, `"server":"home-server:8790"` and `"speech":"brain"`.
And `journalctl --user -u heymorgan -n 20` ends with `home: connected`. On the
laptop, `heymorgan devices` shows `dot` as connected.

## 11. Talk to it

Say "Hey Morgan", wait for the tone, and ask "what time is it?"

**Check:** it answers from the bench speaker. Then the two things nobody has
measured yet on a Zero 2 W. **Pi:**

```bash
top -b -n 1 | head -15
```

```bash
vcgencmd measure_temp
```

Note node's CPU % while idle (the spotter listening) and the temperature.
Below about 60 % and 65 °C on the bench is comfortable. Much more, and the
closed shell will run hot (step F11 matters then). Note, too, how often it
misses "Hey Morgan" from across the room.

## 12. Lights and the button

**Pi:**

```bash
pip install --break-system-packages adafruit-blinka adafruit-circuitpython-dotstar adafruit-circuitpython-neopixel-spi
```

First without touching hardware:

```bash
printf 'listening\nthinking\nspeaking\nmuted\n' | python3 ~/heymorgan/pi/lights.py --dry
```

**Check:** it prints the four states. Then for real (no ring yet; that comes
in Part 2):

```bash
cd ~/heymorgan && bin/heymorgan device lights "python3 $HOME/heymorgan/pi/lights.py"
```

**Check:** the bonnet's three LEDs breathe blue after "Hey Morgan" and go white
while she speaks. A press of the bonnet's button starts listening. A one-second
hold turns them red (muted), and another hold unmutes. If the LEDs stay dark
or show the wrong colours, the pins differ from Adafruit's guide (data GPIO 5,
clock GPIO 6, button GPIO 17); stop and check before Part 2.

## 13. Your voice, on the Dot

It already knows the voices the brain knows. Ask it something: on the laptop,
`heymorgan devices` says whether the Dot hears you poorly. If it does,
**laptop:**

```bash
heymorgan enroll Jeff --here --device dot
```

The Dot says each line; repeat it back.

## 14. Write down what works, and copy the card

**Pi.** Note the kernel and the driver branch that work together, and hold
the kernel there, so an `apt upgrade` can't move it out from under the sound
driver (*After it's closed*, below, says how to move it on purpose):

```bash
uname -r && git -C ~/seeed-voicecard branch --show-current
```

```bash
dpkg -l 'linux-image-rpi*' 'linux-headers-rpi*' | grep ^ii
```

Hold the two meta-packages that list shows (on a Zero 2 W, 64-bit, they
are `linux-image-rpi-v8` and `linux-headers-rpi-v8`):

```bash
sudo apt-mark hold linux-image-rpi-v8 linux-headers-rpi-v8
```

Then shut it down (`sudo poweroff`), take the card out, and put it in the
laptop's reader. **Laptop:** find the card, by its size:

```bash
lsblk -d -o NAME,SIZE,MODEL,TRAN
```

It is the one the size of your card, usually `sdX` on USB or `mmcblk0` in a
built-in reader. **Be sure**: the next command reads it whole, and the restore
command further down writes over whatever you name. With its name in place of
`sdX`:

```bash
sudo dd if=/dev/sdX bs=4M status=progress | gzip > ~/dot-$(date +%F).img.gz
```

Keep that file. Put the card back in the Pi.

**Part 1 is done** when steps 10–14 all pass. Write down the CPU %, the
temperature, and the Wi-Fi signal (`iw dev wlan0 link`, the `signal:` line):
Part 2 compares against them.

---

# Part 2 — into the Dot

Unplug the Pi for every step that follows until F13.

## F1. Open the Dot

Follow [iFixit's Echo Dot 3rd Gen disassembly
guide](https://www.ifixit.com/Guide/Amazon+Echo+Dot+3rd+Gen+Disassembly/143745)
for the order; its photos show each step better than words can. In short:

1. Warm the rubber foot with a hair dryer for 30 seconds, and lift it from the
   edge with a spudger. It is glued, not screwed. Peel it off slowly and keep
   it.
2. Undo the four Torx T6 screws at the corners (security T6 on some units; don't
   force a plain bit into a security screw).
3. Ease the body apart. Adhesive tape and four plastic locating pins hold the
   outer cover; work round with the spudger.

**Photograph every stage before you take the next part out.** You will put it
back together from those photos.

## F2. Take out the boards, keep the rest

- **Out:** the main board (three Torx T7 screws and one ribbon cable), and the
  top board under the cap (Amazon's mics and Wi-Fi). Neither is reused: their
  mics speak only to Amazon's chip, and the bonnet's mics replace them.
- **Keep:** the fabric shell, the top cap with its four keys and the light
  ring's diffuser, the speaker in its chassis, the bottom plate, the foot and
  every screw. Bag the screws by where they came from.

Note where the power socket is. If it was on the main board, it went with it,
and F10 decides how power gets in now.

## F3. The speaker

The speaker is held by strong adhesive. **Leave it in the chassis.** With the
multimeter on Ω, measure across its two terminals:

- about 3–4 Ω: a 4 Ω speaker. Fine on the bonnet; keep `alsamixer`'s Speaker at
  60 % or under.
- about 6–8 Ω: an 8 Ω speaker. Fine at any level.

Cut its old leads close to the old connector (leave length), strip them, and
solder on the JST-PH cable: red to the speaker's + (marked, or the red lead).
Heat-shrink both joints.

**Check (bench):** plug it into the bonnet's Left socket, power up, and run the
`speaker-test` from step 5. It is the Dot's own voice now, a little fuller than
the bench speaker.

## F4. Measure

With the boards out, measure and write down:

1. **The space where the boards were**: length, width and height. The Pi and
   bonnet together need about 66 × 31 × 22 mm (Zero 65 × 30, bonnet the same,
   stacked), plus a few mm for wires.
2. **Under the top cap**: how much room between the cap's underside and the
   speaker chassis.
3. **The diffuser**: its inside diameter, for the ring.
4. **The mic holes** in the top cap: where they are, and how far apart.

## F5. Choose where the stack goes

**Best: flat under the top cap, bonnet up**, if F4's second measurement gives
22 mm or more. The bonnet's mics are then right under the cap (they hear best
there, and farthest from the speaker), the button and ring are close, and
wiring is short.

**Otherwise: where the main board was**, and the mics then need short tubes or
foam channels up to the cap (F6). Expect it to hear a little worse; Part 1's
step 13 can make up some of it.

**Keep the microSD card reachable.** A failed card, or an update gone wrong,
otherwise means opening the Dot again. Either turn the Pi so its card slot
faces the bottom plate, where it can be reached with the foot peeled back, or
run a microSD extension cable from the slot to just inside the bottom plate.

Test-fit the stack, unwired, before going on. Nothing should press on the
bonnet's components.

## F6. The mics

The bonnet's two mics sit at the middle of each short end, labelled *L Mic*
and *R Mic*; each is a tiny port on the top face of the board.

1. Put the stack in place under the cap, and mark through onto the cap's
   underside where each mic port sits.
2. If a mark lands on one of the Dot's own mic holes, use that hole. If not,
   drill a 1.5 mm hole at the mark, from the inside, by hand with a pin vise
   (slowly; the cap is thin plastic). Keep holes off the keys and the
   diffuser.
3. Put a small ring of foam tape around each mic port, thick enough to press
   against the cap. It seals the mic to its hole, so it hears the room rather
   than the inside of the shell and the speaker.

## F7. The Action key (optional)

The Dot's keys push down on switches that were on the top board, which is
gone. To make the **Action** key (the dot) work as the button:

1. Solder the 6×6 mm tactile switch to a scrap of perfboard.
2. Solder two wires to it, and on the **underside of the Pi**, solder them to
   header pin 11 (GPIO 17) and pin 9 (GND). This is the same as the bonnet's
   own button, wired in parallel, so a press and a hold mean the same.
3. Fix the perfboard with foam tape so the key's plunger rests on the switch
   and clicks it when pressed. Check the click by hand before sticking it down
   for good.

The other three keys (volume and mute) do nothing yet. `pi/lights.py`
reads only one button; holding the Action key mutes.

## F8. The light ring (optional)

Choose a NeoPixel ring whose diameter is close to the diffuser's inside
diameter (F4.3); otherwise use a short NeoPixel strip, curled around inside
the diffuser. Count its LEDs.

Wiring, all on the **underside of the Pi** (the bonnet covers the top):

| Ring | Pi header pin |
|---|---|
| DIN (data in), through the 330 Ω resistor | pin 19 (GPIO 10, SPI MOSI) |
| 5V | pin 2 |
| GND | pin 14 |

Solder the capacitor across 5V and GND **at the ring**, with its − side
(striped) to GND. Heat-shrink everything. Fix the ring facing up into the
diffuser with foam tape.

**Check (bench, before closing):**

```bash
cd ~/heymorgan && bin/heymorgan device lights "python3 $HOME/heymorgan/pi/lights.py --ring 24"
```

with your count in place of 24. Say "Hey Morgan": the ring breathes blue with
the LEDs.

## F9. Heat and Wi-Fi

- Stick the heatsink on the Zero 2 W's chip (the square silver one).
- Cover any solder joints on the Pi's underside that could touch metal with
  Kapton tape.
- Keep the Pi's antenna end clear of the speaker's metal chassis: the Zero 2 W's
  antenna is the printed area at the board's end, which Raspberry Pi's product
  brief shows. Turn the board so that end faces the fabric, not the metal.

## F10. Power

Two ways, simplest first:

1. **One cable.** A right-angle micro-USB cable from the Pi out through the Dot's
   old power hole. File or step-drill the hole until the cable passes, then
   relieve strain inside with a cable tie and a dab of hot glue, so a tug on
   the cable never pulls on the Pi.
2. **A socket.** A panel-mount DC socket in the old hole, wired to a micro-USB
   pigtail into the Pi, and a 5 V barrel supply. Neater; more soldering.

**Never use the Dot's own power adapter.** It is not 5 V.

## F11. Mount it

Stand the stack on nylon standoffs, and fix the standoffs to the chassis with
foam tape or hot glue. Route wires so none crosses the speaker cone. Nothing
should rattle when you shake it gently.

## F12. Test before closing

Power up, with the shell still open. **Pi:**

```bash
~/heymorgan/bin/heymorgan status
```

Then go through steps 11, 12 and 13's checks again: wake word from across the
room, the LEDs and ring, the Action key's press and hold, and the speaker.
Then:

```bash
iw dev wlan0 link
```

**Check:** the `signal:` is within about 10 dBm of what Part 1 wrote down. If
it's much worse, turn the Pi's antenna end further from the metal (F9).

## F13. Close it

Reassemble from your photos, in reverse. Put the foot back with fresh
double-sided tape.

## F14. Leave it running

Leave it on for a day. **Pi**, after an hour and again after a day:

```bash
vcgencmd measure_temp && vcgencmd get_throttled
```

**Check:** under about 75 °C, and `throttled=0x0`. Anything else means it got
hot enough to slow down; open it, give it more air (a few holes in the bottom
plate, under the fabric), and check again.

Then `journalctl --user -u heymorgan --since today | grep -i error` on the Pi
should be quiet.

---

# After it's closed

Everything is done over Wi-Fi, from the laptop: `ssh dot.local`.

**Most changes need nothing on the Dot.** The model, memory, voices, speech,
the Oracle and every shared setting are the brain's. Change them on the laptop
or in Talaris as usual; the Dot picks them up.

**Updating Morgan on the Dot.** Whenever the brain is updated, so the two
match. **Laptop:**

```bash
ssh dot.local 'cd ~/heymorgan && git pull && npm ci && systemctl --user restart heymorgan'
```

**The Dot's own settings and log.** **Pi:** `~/heymorgan/bin/heymorgan device`
lists what it sets for itself, `bin/heymorgan device <setting> <value>`
changes one, and `journalctl --user -u heymorgan -f` follows its log.

**A new Wi-Fi network.** Teach the Dot the new network **before** you change
over, while it can still be reached. **Pi:**

```bash
sudo nmcli connection add type wifi con-name new-wifi ssid "Network name" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "its password"
```

It keeps both, and joins whichever it finds. `nmcli connection show` lists them.

**Moving the kernel on.** The bonnet's driver is built for one kernel series
(6.12, say), so the kernel is held (step 14). To move it on, on purpose,
**Pi:**

```bash
sudo apt-mark unhold linux-image-rpi-v8 linux-headers-rpi-v8 && sudo apt update && sudo apt full-upgrade -y && sudo reboot
```

Then `uname -r`. If the first two numbers changed, sound is gone until the
driver is reinstalled from the matching branch, over SSH:

```bash
cd ~/seeed-voicecard && git fetch && git branch -r
```

```bash
git checkout v6.13 && git pull && sudo ./install.sh && sudo reboot
```

with the new series in place of `v6.13`. **If there is no branch for it yet,
don't upgrade**: write the step 14 copy back instead (below), and wait. Once
`aplay -l` shows `seeed2micvoicec` again, hold the kernel again (step 14).

**If it stops answering altogether.** Take the card out (the slot was kept
reachable in F5) and write the step 14 copy back. **Laptop**, with the card
in the reader and its name found with `lsblk` as before (**it is overwritten
completely**):

```bash
gunzip -c ~/dot-2026-11-11.img.gz | sudo dd of=/dev/sdX bs=4M status=progress conv=fsync
```

with your copy's date and the card's name. It comes back as it was at step 14;
then run the update line above. Raspberry Pi Imager can write the copy too:
*Use custom*, and choose the `.img.gz`.

---

When something here proves wrong on real hardware (a pin, a size, a step that
needed another), fix this file. Nobody had built one when it was written.
