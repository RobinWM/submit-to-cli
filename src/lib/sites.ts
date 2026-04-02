import { CliError, EXIT_CODES } from './errors';

export const DEFAULT_SITE = 'aidirs.org';
export const SUPPORTED_SITES = ['aidirs.org', 'backlinkdirs.com'] as const;
export type SupportedSite = (typeof SUPPORTED_SITES)[number];

export const SITE_BASE_URLS: Record<SupportedSite, string> = {
  'aidirs.org': 'https://aidirs.org',
  'backlinkdirs.com': 'https://backlinkdirs.com',
};

export const SITE_AUTH_URLS: Record<SupportedSite, string> = {
  'aidirs.org': 'https://aidirs.org/api/cli/callback',
  'backlinkdirs.com': 'https://backlinkdirs.com/api/cli/callback',
};

export function normalizeSite(site: string | undefined): SupportedSite {
  if (!site) return DEFAULT_SITE;

  if ((SUPPORTED_SITES as readonly string[]).includes(site)) {
    return site as SupportedSite;
  }

  throw new CliError(
    `Unsupported site '${site}'. Use one of: ${SUPPORTED_SITES.join(', ')}`,
    EXIT_CODES.GENERAL_ERROR,
  );
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function getSiteFromBaseUrl(baseUrl?: string): SupportedSite {
  if (!baseUrl) return DEFAULT_SITE;

  const normalized = normalizeBaseUrl(baseUrl);
  const matchedEntry = Object.entries(SITE_BASE_URLS).find(([, value]) => value === normalized);
  return (matchedEntry?.[0] as SupportedSite | undefined) ?? DEFAULT_SITE;
}
