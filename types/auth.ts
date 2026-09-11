// Who is signed in — carried in the signed session cookie (see lib/auth/token.ts)
export interface SessionUser {
  id:       number
  username: string
  name:     string
  role:     string
}

// What the sign-in / sign-up Server Actions hand back to their forms
export interface AuthFormState {
  error?:  string
  fields?: { username?: string; fullname?: string }   // re-filled so a failed submit doesn't wipe them
}
