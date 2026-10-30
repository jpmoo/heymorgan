#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (c) 2026 Jeff Moore
"""Morgan's lights and button on a Pi in a speaker (the Adafruit Voice Bonnet).

Morgan starts this as its `lights` setting and keeps it running. It is told
Morgan's state, one word a line on stdin (idle, listening, transcribing,
thinking, consulting, speaking, muted, offline), and shows it on the bonnet's
three DotStar LEDs and, optionally, a NeoPixel ring behind the Dot's
diffuser. When the bonnet's button is pressed it prints "press"; held down
for a second, "hold" (Morgan mutes or unmutes the microphone).

    heymorgan device lights "python3 /home/pi/heymorgan/pi/lights.py --ring 12"

Needs: pip install adafruit-blinka adafruit-circuitpython-dotstar
(and adafruit-circuitpython-neopixel-spi for a ring, on the Pi's SPI pins,
with SPI turned on). --dry shows the states on stderr instead, with no
hardware. The pins are the bonnet's as Adafruit's guide gives them; check
them against it, and change them with --clock, --data and --button.
"""

import argparse
import math
import sys
import threading
import time

COLOURS = {
    "idle": None,
    "listening": (0, 90, 255),
    "transcribing": (0, 160, 200),
    "thinking": (0, 160, 200),
    "consulting": (140, 60, 255),
    "speaking": (255, 255, 255),
    "muted": (255, 0, 0),
    "offline": (255, 120, 0),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--ring", type=int, default=0, help="pixels in a NeoPixel ring on SPI (0: none)")
    parser.add_argument("--brightness", type=float, default=0.25)
    parser.add_argument("--clock", default="D6", help="the DotStars' clock pin")
    parser.add_argument("--data", default="D5", help="the DotStars' data pin")
    parser.add_argument("--button", default="D17", help="the button's pin")
    parser.add_argument("--dry", action="store_true", help="no hardware: say the states on stderr")
    args = parser.parse_args()

    dots = ring = button = None
    if not args.dry:
        import board
        import digitalio
        import adafruit_dotstar
        dots = adafruit_dotstar.DotStar(getattr(board, args.clock), getattr(board, args.data), 3, brightness=args.brightness, auto_write=False)
        pin = digitalio.DigitalInOut(getattr(board, args.button))
        pin.direction = digitalio.Direction.INPUT
        pin.pull = digitalio.Pull.UP
        button = pin
        if args.ring:
            import neopixel_spi
            ring = neopixel_spi.NeoPixel_SPI(board.SPI(), args.ring, brightness=args.brightness, auto_write=False)

    state = {"now": "idle"}

    def read() -> None:
        for line in sys.stdin:
            word = line.strip()
            if word in COLOURS:
                state["now"] = word
                if args.dry:
                    print(f"lights: {word}", file=sys.stderr, flush=True)
        # Morgan has gone: dark, and done.
        state["now"] = "gone"

    threading.Thread(target=read, daemon=True).start()

    pressed_at = None
    held = False
    started = time.monotonic()
    while state["now"] != "gone":
        t = time.monotonic() - started
        now = state["now"]
        colour = COLOURS.get(now)
        # How bright, by state: a slow breath while listening, a sweep while thinking, steady while speaking.
        if colour is None:
            level = 0.0
        elif now == "listening":
            level = 0.55 + 0.45 * math.sin(t * 3)
        elif now == "offline":
            level = 1.0 if int(t * 2) % 2 == 0 else 0.0
        else:
            level = 1.0
        shown = tuple(int(c * level) for c in colour) if colour else (0, 0, 0)
        if dots is not None:
            dots.fill(shown)
            dots.show()
        if ring is not None:
            if now in ("transcribing", "thinking", "consulting") and colour:
                # A sweep: one bright pixel going round, with a fading tail.
                head = int(t * 12) % args.ring
                for i in range(args.ring):
                    behind = (head - i) % args.ring
                    fade = max(0.0, 1 - behind / 5)
                    ring[i] = tuple(int(c * fade) for c in colour)
            else:
                ring.fill(shown)
            ring.show()
        if button is not None:
            down = not button.value
            if down and pressed_at is None:
                pressed_at, held = time.monotonic(), False
            elif down and not held and time.monotonic() - pressed_at >= 1.0:
                held = True
                print("hold", flush=True)
            elif not down and pressed_at is not None:
                if not held:
                    print("press", flush=True)
                pressed_at = None
        time.sleep(1 / 30)

    if dots is not None:
        dots.fill((0, 0, 0))
        dots.show()
    if ring is not None:
        ring.fill((0, 0, 0))
        ring.show()


if __name__ == "__main__":
    main()
