---
name: bhoping
description: >
  CS2 inspect-view viewmodel site in ~/Downloads/bhoping (three.js, no build).
  Use for a state recap ("what's done", "where were we"), to change the look or the
  viewmodel, and whenever sticker or charm placement comes up: exact placement comes from
  the GLB's g_vStickerN material params plus item.json offsets, never from eyeballing.
---

# bhoping

One screen, no copy: an AK-47 | Midnight Laminate viewmodel held in first person, lit and framed
like SteamAnalyst's CS2 inspect tab, with four Lightning (Foil) stickers and a Jelly charm.
`index.html` + `main.js`, three.js r170 vendored under `vendor/`, assets under `assets/`.

The site's value is the look. Every change is judged by a screenshot against the reference tab.

## State

- **Look**: `VM_ZOOM` 0.7, neutral studio PMREM env, ACES 0.95, shadow-casting key, CSS studio
  backdrop. Albedo graded (`-modulate`) so the paint sits at the in-game palette. Recipe in `README.md`.
- **Animation**: real CS2 clips (`idle`, `draw`, `lookat01`, `lookat03`, and the draw variants),
  sound events pumped by frame number. Keys: F inspect, V variant, Q draw, R draw+inspect.
- **Stickers**: four decals parented to the `weapon` bone, hand-fitted to the reference (`STICKERS`
  in `main.js`). Exact values are known and unapplied — see below.
- **Charm**: pendulum hanging from `CHARM_ATTACH`, pseudo-gravity from the pivot's acceleration.
  Hand-fitted; CS2's own anchor is the model's `keychain` attachment, absent from the export.
- Assets are pre-baked by the previous agent: geometry and clips from VPKs via ValveResourceFormat,
  paint and glove albedo are approximations of the game's pattern masks.

## Verify a change

```bash
cd ~/Downloads/bhoping && python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/`, click **Start** (it resumes the audio context), wait ~10 s for the
draw+inspect clip to finish, then screenshot. Done when three frames ~1 s apart all look right:
the idle clip itself rotates the gun, so a single frame proves nothing.

## Exact sticker placement

The GLB already carries the slot defaults, in the weapon material's extras (`VectorParams` of
`weapon_rif_ak47.vmat`, on `body_hd`):

| slot | `g_vStickerNOffset` | `g_vStickerNScale` |
|---|---|---|
| 0 | (0.148, −0.434) | 14.1 |
| 1 | (0.061, −0.434) | 14.1 |
| 2 | (−0.025, −0.435) | 14.6 |
| 3 | (−0.164, −0.444) | 14.7 |
| 4 | empty | 0 |

The offset is the sticker centre in the **sticker UV set** (`TEXCOORD_1` − 0.5); the scale is how
many stickers fit across that UV set, so a sticker spans `1/scale` of it. `item.json`'s
`offset_x/offset_y` are free placements **added on top** of the slot default.

For this item, that resolves to four UV centres:

```
slot 1  offset (−0.0636, +0.0032)  ->  uv (0.4974, 0.0692)   roll −90
slot 3  offset (+0.2098, −0.0028)  ->  uv (0.5458, 0.0532)   roll 93
slot 3  offset (+0.2764, +0.0025)  ->  uv (0.6124, 0.0585)   roll −105
slot 3  offset (+0.3292, +0.0017)  ->  uv (0.6652, 0.0577)   roll 78
```

Interpolating those UVs barycentrically over `TEXCOORD_1` on the `body_hd` mesh gives the
receiver's camera-facing side, all normals ≈ +x:

```
(0.0173, 0.0578, 0.1876)  (0.0181, 0.0732, 0.1409)
(0.0189, 0.0681, 0.0765)  (0.0189, 0.0689, 0.0255)
```

Model space, AK bind pose: +x is the camera-facing side (surface ≈ 0.026), +y up, +z toward the
muzzle. Sticker size ≈ `1/14.7` of the UV set ≈ 6.9 cm. Adopting these replaces the `STICKERS`
table and is a ~10-line edit — the numbers above are verified, not fitted.

## Charm

CS2 hangs charms from the model's `keychain` attachment (`m_attachments` in the `.vmdl`), with
`item.json`'s `(9.26, 0.678, 2.26)` as the offset from it. Neither the attachment nor the model
keyvalues survived the glTF export, which is why `CHARM_ATTACH` is eyeballed. Getting it exact
means re-reading that attachment from the model; the offset's units are still unresolved.

## Traps

- The AK meshes are skinned with `DetachedBindMode` and an identity bind matrix, so their own
  `matrixWorld` means nothing: vertices come from the bones. Anything that rides the gun is a child
  of the `weapon` bone carrying the AK bind matrix — `stkRoot` is the pattern.
- `polygonOffsetFactor: -4` with `camera.near = 0.005` pulls decals through the receiver from the
  far side. −1 renders only the near surface.
- Nearest-vertex UV lookup picks the opposite face. Interpolate the containing triangle instead.
- The charm is occluded for parts of the idle cycle. That is the pose, not a placement bug: judge
  it on several frames, and on the inspect clip where it swings clear.
- Textures are graded in place; `git show HEAD:assets/tex/ak_color.jpg` is the ungraded original.
