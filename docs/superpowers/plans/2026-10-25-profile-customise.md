# Profile pictures in two layers, the Customise screen, rewards details

Design: the **Dartcade Platform Design** canvas (Profile and Progression pages):
`project/Profile-Customise*.dc.html`, `project/Mobile-Profile-Customise*.dc.html`, `project/Profile-Self.dc.html`,
`project/Rewards.dc.html`, `project/Rewards-Details.dc.html`, `project/Progression-Avatars-Mark{,2}.dc.html`.
Local copies for this work are in the session scratchpad (`design/project/`).

## 1. Avatars: a foreground and a background finish

- 20 finishes ("one mark, many finishes"): the Dartcade ring and bull in different materials. Art is the design's
  sprite, copied as is to `backend/frontend/src/lib/assets/finishes.svg`: one `<symbol>` per layer,
  `finish-fg-<id>` and `finish-bg-<id>`, viewBox `0 0 120 120`. Draw background, then foreground, both clipped to a
  circle. The foreground also draws the gloss and rim.
- Ids, in order, with their unlock:

  | id         | name       | unlock                                                       |
  | ---------- | ---------- | ------------------------------------------------------------ |
  | classic    | Classic    | level 1                                                      |
  | chalk      | Chalk      | level 3                                                      |
  | arcade     | Arcade     | level 5                                                      |
  | bronze     | Bronze     | level 10                                                     |
  | chrome     | Chrome     | level 25                                                     |
  | neon       | Neon       | level 35                                                     |
  | inferno    | Inferno    | level 45 (animated: keeps the old Burning dart's `animated`) |
  | gold       | Gold       | level 50                                                     |
  | hot-streak | Hot streak | 7-day streak                                                 |
  | crystal    | Crystal    | event rankedWins (win 10 ranked games)                       |
  | frost      | Frost      | challenge: Check out 100+                                    |
  | carbon     | Carbon     | challenge: Play 100 games                                    |
  | holo       | Holo       | challenge: Season 1 reward                                   |
  | marble     | Marble     | challenge: Win 25 ranked games                               |
  | lava       | Lava       | challenge: Win 5 in a row                                    |
  | electric   | Electric   | challenge: Throw a 180                                       |
  | galaxy     | Galaxy     | challenge: Reach Elite rank                                  |
  | toxic      | Toxic      | challenge: Minigolf hole in one                              |
  | walnut     | Walnut     | challenge: Play 20 games with friends                        |
  | glitch     | Glitch     | challenge: Launch week event                                 |

  The challenge finishes exist and show their unlock but nothing unlocks them yet (no achievements system):
  `Unlock` gains `{ challenge: string }` (the text), `unlockText` returns it, `reachedPerks` never yields one.

- Perks stay `picture.<id>`. Old ids map one to one: logo→classic, dart→chalk, flight→arcade, board→bronze,
  trophy→chrome, crossed-darts→neon, burning-dart→inferno, golden-dart→gold, flame→hot-streak, shield→crystal.
- API (`schema/common-v1.json`): `Avatar` preset branch is `{ kind: 'preset', foreground, background }`;
  `AvatarChoice` is `{ kind, foreground?, background? }`. `color`/`fgColor` go. PATCH /api/me checks both are
  finishes and, with progression on, that both are unlocked (409 otherwise).
- DB migration 038: rename the `picture.*` rows of `user_unlocks`; add `user.avatar_background`; map
  `avatar_preset` to the new id and set `avatar_background` to the same finish; drop `avatar_color` and
  `avatar_fg_color`. Default avatar for a preset: classic on classic.
- Frontend: `FinishSprite.svelte` (the sprite inlined once, in `App.svelte`); `Avatar.svelte` draws the two
  layers with `<use href="#finish-bg-…">` / `#finish-fg-…`. The old preset icons (`avatarPresetIcons.ts`) and the
  colour swatches go. Settings → Profile picks the two layers with the same grid as Customise.

Known gap, kept as designed: Electric's lightning, Inferno's flames and Toxic's drips are in the foreground
layer, so those finishes are plain as backgrounds.

## 2. Customise: `#/profile/customise/:tab`

- Tabs: Picture · Frame · Banner · Colours · Title (`/profile/customise` is Picture), plus Sounds and
  Celebrations, which the design hasn't drawn yet. They stay so nothing that's wearable today loses its picker.
  They use the same grid.
- Header: breadcrumb Profile › Customise; title row with Cancel (back to `#/profile`, drops the draft) and Save
  (writes the changed kinds through `PUT /api/progress/equip` and the picture through `PATCH /api/me`, then back
  to `#/profile`).
- Left (desktop) / top (phone): "Your card" preview (the existing `ProfileCard` with the draft look and avatar)
  and "How others see it", a lobby row. Both follow the draft live.
- Right: the grid of options. Locked ones are greyed, with a lock badge and their unlock, and can't be picked.
  "Hide locked" switch: off by default, kept across tabs and visits (localStorage), at the end of the tab bar on
  desktop and on the grid's header row on phone.
- Picture: two grids, Foreground ("the mark in the middle", the foreground on a plain dark disc) and Background
  ("the disc behind it", the background alone); the two picks are named under the card; on phone a
  Foreground / Background switch shows one grid at a time.
- Colours: the themes, then the Gold name style (level 50) as a separate option that overrides the theme.
- Profile page: its Customise button links here; the inline customise panel (`YourCard`) goes.
  `#/profile?customise` links point here instead.

## 3. Rewards: details modal

- Clicking, or Enter/Space on, a level of the track or a card under "Off the track" opens a modal: every item of
  that reward with a preview, its kind and its name; unlocked ones have Apply (Applied once worn), locked ones
  their unlock. Footer: Apply all and a link to Customise. Closes on ✕, Close, Esc and the backdrop.
- Apply writes at once, through the same calls Customise saves with. A picture reward is applied to both layers
  (the finish as the track shows it).
