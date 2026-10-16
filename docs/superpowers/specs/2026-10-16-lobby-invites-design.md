# Lobby invites: the design's invite screens

The design canvas has six artboards for lobby invites. This spec covers building them:

- `Lobby-Invite`: the toast for an incoming invite, on desktop.
- `Lobby-Invite-Phone`: the same toast on a phone, while in a lobby.
- `Lobby-Invite-Drawer`: the invites section of the friends drawer.
- `Invites-Phone`: the Invites page.
- `Lobby-Invite-Sent`: the host's view of invites that are still pending.
- `Lobby-Invite-Link`, `Lobby-Invite-Link-Phone`: the invite link, opened while signed out.

## What changes

- **A glance at the lobby.** Every place that shows an invite also tells what the lobby is
  about: the next game, the first faces with the names of who's in, and the boards. The
  server sends this with each pending invite (`/ws/me`, `GET /api/invites`) and with the code
  preview (`GET /api/lobby-codes/:code`). It sends `peopleCount`, `faces`, `nextGame` and
  `boardNames`, built by one `lobbyGlance(lobby)` that the lobby summary also uses.
- **The invite toast.** The newest invite you haven't closed shows as a card. It sits at the
  bottom right on desktop (404 px) and at the top on phones. It shows who invited you, the
  lobby's name, the glance, Decline and Join lobby. If you're in another lobby, a line says
  that joining takes you out of it. Close (✕) only hides the toast; the invite stays. The toast
  stays off the Invites page and the match screen.
- **The friends drawer** starts with a "Lobby invites" section when there are any, with a red
  count. The newest invite is open, with Decline and Join lobby. Older ones are compact rows
  with ✕ and Join. Under them: "Invites stay here until the lobby closes."
- **The Invites page** cards follow `Invites-Phone`. Each card shows the lobby, "Hosted by
  Mara", when it was sent, an inset with the boards and "3 people · X01 next", then Decline and
  Accept.
- **The host's pending rows** look like the other people rows, with a PENDING tag on the
  name and "Not ready" as the status. They are no longer greyed out.
- **The invite link while signed out.** `#/join/CODE` no longer sends you to sign in first. It
  shows the invite card: who invited you, the lobby's name, the glance, "Sign in to join",
  "Create a free account", the note, and the code. Signing in comes back to the link. To show
  this, the code preview no longer needs a session. The code is the secret that already lets
  anyone signed in join, and a host shares the link to be opened.
- **One set of invite actions.** Accept, Decline and the switch-lobby confirm move out of the
  Invites page into `lib/lobby/invites.svelte.ts`. The page, the toast and the drawer share
  them.

## Not in this change

- "You'll throw at" with a board picker. Accepting puts you on your usual board, as before,
  and you change it in the lobby. The accept API takes no board.
- The switch-lobby confirm as a bottom sheet on phones. It stays the existing dialog.
- Host-side board and status controls for someone who hasn't accepted yet.
