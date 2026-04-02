import * as fs from 'fs-extra';
import * as path from 'path';
import { CliError, EXIT_CODES } from './errors';
import { getSiteFromBaseUrl, normalizeBaseUrl, normalizeSite, SITE_BASE_URLS, SupportedSite } from './sites';

export const CONFIG_PATH = path.join(process.env.HOME || '', '.config', 'ship', 'config.json');

export interface LegacyConfig {
  DIRS_TOKEN?: string;
  DIRS_BASE_URL?: string;
}

export interface SiteConfig {
  token: string;
  baseUrl: string;
}

export interface Config {
  currentSite: SupportedSite;
  sites: Partial<Record<SupportedSite, SiteConfig>>;
}

export interface LoadConfigOptions {
  site?: string;
}

export interface LoadedConfig {
  site: SupportedSite;
  token: string;
  baseUrl: string;
}

export async function readConfigFile(): Promise<Config | null> {
  if (!(await fs.pathExists(CONFIG_PATH))) {
    return null;
  }

  const rawConfig = (await fs.readJson(CONFIG_PATH)) as Partial<Config & LegacyConfig>;

  if (rawConfig.sites && rawConfig.currentSite) {
    return {
      currentSite: normalizeSite(rawConfig.currentSite),
      sites: rawConfig.sites,
    };
  }

  const legacyToken = rawConfig.DIRS_TOKEN;
  if (!legacyToken) {
    return null;
  }

  const legacySite = getSiteFromBaseUrl(rawConfig.DIRS_BASE_URL);
  return {
    currentSite: legacySite,
    sites: {
      [legacySite]: {
        token: legacyToken,
        baseUrl: SITE_BASE_URLS[legacySite],
      },
    },
  };
}

export async function writeConfig(config: Config): Promise<void> {
  await fs.ensureFile(CONFIG_PATH);
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const envToken = process.env.DIRS_TOKEN;
  const envBaseUrl = process.env.DIRS_BASE_URL;
  const requestedSite = options.site ? normalizeSite(options.site) : undefined;
  const fileConfig = await readConfigFile();

  const site = requestedSite ?? fileConfig?.currentSite ?? getSiteFromBaseUrl(envBaseUrl);
  const siteFromFile = fileConfig?.sites?.[site];

  const token = siteFromFile?.token || envToken || '';
  const baseUrl = normalizeBaseUrl(siteFromFile?.baseUrl || envBaseUrl || SITE_BASE_URLS[site]);

  if (!token) {
    throw new CliError(
      `No token configured for ${site}. Run 'ship login --site ${site}' first or set DIRS_TOKEN.`,
      EXIT_CODES.AUTH_ERROR,
    );
  }

  return { site, token, baseUrl };
}

export async function saveSiteConfig(site: SupportedSite, token: string): Promise<void> {
  const existing = (await readConfigFile()) ?? {
    currentSite: site,
    sites: {},
  };

  const nextConfig: Config = {
    currentSite: site,
    sites: {
      ...existing.sites,
      [site]: {
        token,
        baseUrl: SITE_BASE_URLS[site],
      },
    },
  };

  await writeConfig(nextConfig);
}
