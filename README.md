# bhoping

CS2 first-person viewmodel in the browser (three.js, no build step).

Run: `python3 -m http.server 8765` in this folder, open http://127.0.0.1:8765/ (ES modules need http, not file://).

Keys: F inspect, V switch inspect variant (lookat01 / lookat03), Q draw, R draw+inspect.

Source: geometry, skeleton and animation clips are exported from the installed game's VPKs with
ValveResourceFormat. Paint, sticker and glove textures are approximations baked from the game's
own pattern/mask textures. Item values come from the decoded inspect links (`item.json`).

Look, tuned against the CS2 inspect view:
- Camera: 68 viewmodel FOV with `camera.zoom = 0.7` (VM_ZOOM), so the whole gun reads at once.
- Lighting: neutral studio environment (dark box + three white panels, PMREM) at 0.75 intensity,
  one shadow-casting key from upper left, dim rim and fill. No warm directional sun.
- Renderer: ACES filmic tone mapping, exposure 0.95, PCF soft shadows from the key light.
- Backdrop: transparent canvas over a CSS radial gradient plus a vignette.
- Albedo: the baked maps are graded down from the raw pattern bake so the paint matches the
  in-game palette under this light:
  `magick orig -modulate 100,68,100 ak_color.jpg` (gloves 96,76,100 / arms 98,86,100).

Stickers and charm:
- The four Elemental Craft | Lightning (Foil) stickers are real decals (`STICKERS` in main.js):
  rotated planes parented to the `weapon` bone through the AK bind matrix, so they ride the
  animation. Rotations come from `item.json`; z/y place the band on the receiver's camera side
  (`assets/tex/sticker_lightning.png`, alpha cleaned with `-channel A -level 30%,100%`).
- The Jelly charm hangs from `CHARM_ATTACH` on a pendulum, with pseudo-gravity from the pivot's
  own acceleration so it swings during inspect and draw.
