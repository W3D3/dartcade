/** What a player reads on a game a moderator invalidated: no reason or name, only where to turn with questions. */
export function invalidatedNote(contactEmail: string | null): { text: string; email: string | null } {
  return {
    text: 'A moderator invalidated this game. It stays in your history but does not count in your stats or ratings.',
    email: contactEmail,
  }
}
