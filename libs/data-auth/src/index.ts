export {
  AuthService,
  AUTH_API_BASE_URL,
  AUTH_FETCH,
  AUTH_REVALIDATE_INTERVAL_MS,
  SIGN_IN_MESSAGES,
} from './lib/auth.service';
export type { AuthStatus, AuthUser } from './lib/auth.service';
export { resolveApiBaseUrl, isLoopback } from './lib/api-url';
export type { PageLocation } from './lib/api-url';
