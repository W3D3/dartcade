/** The delete-account modal's confirm button lights up only once the exact name is typed and a password is entered. */
export function canConfirm(typed: string, name: string, password: string): boolean {
  return typed.trim() === name && password.length > 0
}

/** Confirming with a passkey takes the typed name alone: the passkey prompt is the second factor. */
export function canConfirmWithPasskey(typed: string, name: string): boolean {
  return typed.trim() === name
}
