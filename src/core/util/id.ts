/** Random record id. */
export function newId(): string {
  return crypto.randomUUID();
}
