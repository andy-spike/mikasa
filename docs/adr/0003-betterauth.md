# BetterAuth with Google OAuth

This is a product from day one with a waitlist, so we need real accounts with a common social login and a low-friction email option. BetterAuth is free, self-hosted, TypeScript-native, and works well with Next.js App Router without a per-MAU vendor cost. Rejected: Clerk (paid past free tier, vendor dependency for something as core as identity), Auth.js (less batteries-included for email+password), Supabase Auth (couples the auth choice to the database vendor).

**Amended 31 AUG 2026.** Email+password is dropped; Google OAuth is the only provider. The waitlist that motivated a second low-friction option is gone with it, signup is open, and one provider means one account per person, no password reset path, and no separate sign-up surface — signing in for the first time is the account creation. BetterAuth still stands for the reasons above; only the enabled providers changed.
