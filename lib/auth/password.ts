import 'server-only'
import bcrypt from 'bcryptjs'

// One place for how passwords are turned into hashes and checked — shared by
// the sign-in/sign-up/change actions and the admin reset route so the cost
// factor and the strength rule can never drift apart.
export const BCRYPT_ROUNDS = 12

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// null when the password is acceptable, otherwise the message to show.
// bcrypt only reads the first 72 bytes, so anything longer is rejected rather
// than silently truncated.
export function validatePassword(password: string): string | null {
  if (password.length < 8 || new TextEncoder().encode(password).length > 72
      || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must be 8–72 characters and include a letter and a number.'
  }
  return null
}
