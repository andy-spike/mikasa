# Better Auth with Google OAuth only

Mikasa uses Better Auth with Google OAuth and open registration. The first Google sign-in creates the account, so there is no separate registration or password-reset flow. Better Auth keeps identity in the application and avoids a per-active-user service cost; Google OAuth is enough for the intended private distribution.
