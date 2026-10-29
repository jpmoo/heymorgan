# Contributing

Morgan (this repository, `heymorgan`) is licensed under the **GNU General
Public License, version 3 only** (`LICENSE`). Its owner also licenses it on
other terms, including commercial ones — the same arrangement as Talaris, the
desktop shell Morgan is built into, so the two products are offered the same
way.

## Forks are welcome; code contributions are not taken yet

Under the GPL you may fork Morgan, run it, change it and use your version as
you like, without asking. If you distribute your version to others, it stays
under the GPL, with its source available and these notices kept.

**Code contributions to this repository are not being accepted yet.** The
Contributor License Agreement below is a draft that has not been reviewed by a
lawyer, and no contribution is taken under a draft. Issues, bug reports and
suggestions are welcome now. Once the agreement has been reviewed, this section
will say so.

## The Contributor License Agreement

**Once contributions open, each contributor agrees to the Contributor License
Agreement in `CLA.md` before their contribution is accepted.** You keep the copyright in what you
write; the agreement gives the owner the license needed to keep offering
Morgan under both the GPL and other terms. Without it, every outside
contribution would need its author's separate permission before Morgan could be
licensed any other way.

To agree, say in your pull request that you have read `CLA.md` and agree to it.

## Source files

Every new source file starts with:

```
SPDX-License-Identifier: GPL-3.0-only
Copyright (c) <year> Jeff Moore
```

in whatever comment syntax the file uses (`//` in JavaScript, `--` in Luau, `#`
in Python, shell and systemd units, `<!-- -->` in HTML). It goes after a `#!`
line where there is one. Files written before the license was added do not
carry the header yet; they are covered by `LICENSE` all the same.

Vendored files keep their own license and header: `window/markdown-it.min.js`
is markdown-it's, under the MIT license.

**"Only," not "or later."** "Or later" would let a future version of the GPL,
written by someone else, apply to Morgan without the owner choosing it.


## The client protocol

Talaris and the satellites talk to Morgan through the protocol written down in
[docs/protocol.md](docs/protocol.md). A change to what the daemon accepts or
sends updates that document in the same commit, and a breaking change raises
its major version.
