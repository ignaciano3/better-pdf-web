import { createAuthClient } from 'better-auth/svelte';

/**
 * Browser-side auth client. `baseURL` is inferred from the current origin, so
 * no env access is needed here. Exposes signIn / signUp / signOut / useSession.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
