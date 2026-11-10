/** A file name for an exported profile: 'Dartcade default' becomes 'dartcade-default.dartcade-lights.json'.
 *  The server names the download with it and the SPA names the file it saves, so a player gets the same name either way. */
export function profileFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'profile'}.dartcade-lights.json`
}
