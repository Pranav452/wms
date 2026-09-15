// Lower-cased address, or null when it doesn't look like an email. Only a
// sanity check — the real test is whether the reset email arrives.
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
