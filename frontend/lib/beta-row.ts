/** A merged (channel=all) catalog row that exists only in the current beta
 * carries its art under the versioned beta tree; main rows never do. */
export function isBetaRow(
  row: { image_url?: string | null } | null | undefined,
): boolean {
  return /\/beta\/v/.test(row?.image_url ?? "");
}
