# bhoping

CS2 first-person viewmodel in the browser (three.js, no build step).

Run: `python3 -m http.server 8765` in this folder, open http://127.0.0.1:8765/ (ES modules need http, not file://).

Keys: F inspect, V switch inspect variant (lookat01 / lookat03), Q draw, R draw+inspect.

Source: geometry, skeleton and animation clips are exported from the installed game's VPKs with
ValveResourceFormat. Paint, sticker and glove textures are approximations baked from the game's
own pattern/mask textures. Item values come from the decoded inspect links (`item.json`).
