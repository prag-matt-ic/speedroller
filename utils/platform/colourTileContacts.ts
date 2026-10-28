/** Prefer the most recently entered tile while the ball overlaps neighbouring sensors. */
export function updateColourTileContacts(contacts: readonly number[], paletteIndex: number, entering: boolean): number[] {
  const remaining = contacts.filter(index => index !== paletteIndex)
  return entering ? [...remaining, paletteIndex] : remaining
}
