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
  notice?: string                                     // success message (sign-up request sent)
  fields?: { username?: string; fullname?: string }   // re-filled so a failed submit doesn't wipe them
}

// pending = signed up, never approved; disabled = approved, then switched off
export type AccountStatus = 'pending' | 'active' | 'disabled'

export type AdminUserAction = 'approve' | 'reject' | 'enable' | 'disable' | 'make-admin' | 'remove-admin'

// One row of Settings → Users & access (GET /api/admin/users)
export interface AdminUserRow {
  id:          number
  username:    string
  name:        string
  role:        string
  status:      AccountStatus
  createdAt:   string
  lastLoginAt: string | null
  approvedAt:  string | null
  approvedBy:  string | null   // approver's username
}
