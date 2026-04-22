import { environment } from './environment';

/**
 * Phase 0 audit (Bearer clients): codex web app used Authorization Bearer from localStorage;
 * codex_api_v2 uses Bearer only for outbound GitLab calls; codex_plugin_v2 query_project_context
 * sent no auth — remediated via PLUGIN_GRAPHQL_SERVICE_TOKEN + header on plugin requests.
 *
 * Phase 0 cookie topology: production uses __Host- prefix (same-origin, Path=/, no Domain, Secure).
 * Development uses a separate name because __Host- + Secure breaks typical http://localhost flows.
 * Max-Age on Set-Cookie is derived from JWT (exp − iat) in setSessionCookie().
 *
 * Combined CSRF defense (do not downgrade any layer): SameSite=Lax on the session cookie,
 * Apollo csrfPrevention (non-simple requests), Origin/Referer allowlist on /graphql and WS upgrade.
 */
export const SESSION_COOKIE_NAME_PRODUCTION = '__Host-pt_session';
export const SESSION_COOKIE_NAME_DEVELOPMENT = 'pt_session_dev';

export function getSessionCookieName(): string {
  return environment.isProduction() ? SESSION_COOKIE_NAME_PRODUCTION : SESSION_COOKIE_NAME_DEVELOPMENT;
}
