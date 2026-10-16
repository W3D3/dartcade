# Lobby invites: implementation plan

Spec: `docs/superpowers/specs/2026-10-16-lobby-invites-design.md`.

1. **Schema and server.**
   - Add `peopleCount`, `faces`, `nextGame` and `boardNames` to `PendingInvite`
     (`schema/lobby-ws-v1.json`) and to `Invite` (`schema/api-v1.yaml`).
   - Add `faces` and `nextGame` to `LobbyPreview`, and drop the auth requirement from
     `getLobbyByCode`.
   - Write `lobbyGlance(lobby)` in `lobby/view.ts`, used by `lobbySummary`, `preview` and
     `inviteView(row, lobby)`. `meMessage` and `listInvites` load each invite's lobby.
   - Run `npm run gen:api`. Test the new invite fields and the signed-out preview.
2. **Shared pieces.**
   - `lib/lobby/invites.svelte.ts`: accept, decline and the switch-lobby confirm, taken out of
     `routes/Invites.svelte`.
   - `LobbyGlance.svelte`: the next game, in the lobby and boards list.
   - `Faces.svelte`, if the stack of faces isn't already a component.
3. **Toast.** `InviteToast.svelte`, rendered once by `Layout`. It shows the newest invite whose
   id you haven't closed, with the ids kept in sessionStorage.
4. **Drawer.** `DrawerInvites.svelte` at the top of `FriendsDrawer`.
5. **Invites page.** Restyle `InviteCard` to the design.
6. **Host.** Restyle `InvitedRow` with the PENDING tag and the Not ready status.
7. **Invite link.** Let `#/join/` through the signed-out redirect in `App.svelte`. Signed out,
   `Join.svelte` shows the invite card.
8. **Check.** Typecheck, lint, tests and format, plus screenshots of each artboard's state at
   desktop and phone widths. Then a ponytail review and simplify, with the subagents in
   ponytail mode.
