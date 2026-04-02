#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import inquirer from 'inquirer';
import { CliError, EXIT_CODES, getErrorMessage, HttpError } from './lib/errors';
import { CONFIG_PATH, loadConfig, saveSiteConfig } from './lib/config';
import { CommandOutputOptions, HttpResponse, printCommandError, printJson, printResult } from './lib/output';
import { DEFAULT_SITE, getSiteFromBaseUrl, normalizeBaseUrl, normalizeSite, SITE_AUTH_URLS, SITE_BASE_URLS, SUPPORTED_SITES, SupportedSite } from './lib/sites';

const CLI_VERSION = require('../package.json').version as string;
const RELEASE_REPO = 'RobinWM/ship-cli';
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
const UPDATE_CHECK_PATH = path.join(process.env.HOME || '', '.config', 'ship', 'update-check.json');
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;








interface UpdateCheckCache {
  checkedAt: string;
  latestVersion: string;
  downloadUrl?: string;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface LatestReleaseInfo {
  version: string;
  downloadUrl?: string;
  assets: ReleaseAsset[];
}






function parseJsonSafely(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}


function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function detectPlatformAssetName(): string | null {
  const platform = process.env.TEST_SUBMIT_DIR_PLATFORM || process.platform;
  const arch = process.env.TEST_SUBMIT_DIR_ARCH || process.arch;

  if (platform === 'linux') {
    if (arch === 'x64') return 'ship-linux-x64';
    if (arch === 'arm64') return 'ship-linux-arm64';
  }

  if (platform === 'darwin') {
    if (arch === 'x64') return 'ship-darwin-x64';
    if (arch === 'arm64') return 'ship-darwin-arm64';
  }

  return null;
}

function getExecutablePath(): string {
  return fs.realpathSync(process.argv[1]);
}

function getReleaseAssetUrl(assets: ReleaseAsset[]): string | undefined {
  const assetName = detectPlatformAssetName();
  if (!assetName) return undefined;
  return assets.find((asset) => asset.name === assetName)?.browser_download_url;
}




function tryOpen(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url: string) {
  const platform = process.platform;

  if (platform === 'darwin') {
    if (tryOpen('open', [url])) return;
    throw new CliError('Failed to open browser with macOS open command.');
  }

  if (platform === 'linux') {
    if (tryOpen('xdg-open', [url])) return;
    throw new CliError('Failed to open browser with xdg-open.');
  }

  if (platform === 'win32') {
    if (tryOpen('rundll32', ['url.dll,FileProtocolHandler', url])) return;
    if (tryOpen('cmd', ['/c', 'start', '', url])) return;
    throw new CliError('Failed to open browser on Windows. Try opening the login URL manually.');
  }

  throw new CliError(`Unsupported platform: ${platform}`);
}

function waitForCallback(
  port: number,
  expectedSite: SupportedSite,
  expectedState: string,
): Promise<{ token: string; site: SupportedSite }> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      server.close(() => callback());
    };

    const server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(404);
        res.end();
        return;
      }

      const requestUrl = new URL(req.url || '/', `http://localhost:${port}`);
      const token = requestUrl.searchParams.get('token');
      const site = normalizeSite(requestUrl.searchParams.get('site') || expectedSite);
      const state = requestUrl.searchParams.get('state');

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Invalid login state</h2></body></html>');
        finish(() => reject(new CliError('Login failed: invalid callback state.', EXIT_CODES.AUTH_ERROR)));
        return;
      }

      if (site !== expectedSite) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Login site mismatch</h2></body></html>');
        finish(() => reject(new CliError('Login failed: callback site mismatch.', EXIT_CODES.AUTH_ERROR)));
        return;
      }

      if (token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#22c55e;">✅ Login successful</h2>
          <p style="color:#666;">Token saved. You can close this window.</p>
          <script>window.close()</script>
        </body></html>`);
        finish(() => resolve({ token, site }));
        return;
      }

      const error = requestUrl.searchParams.get('error') || 'Unknown error';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2 style="color:#ef4444;">❌ Login failed</h2>
        <p style="color:#666;">${error}</p>
      </body></html>`);
      finish(() => reject(new CliError(error, EXIT_CODES.AUTH_ERROR)));
    });

    server.listen(port, '127.0.0.1');

    setTimeout(() => {
      finish(() => reject(new CliError('Login timeout (5 minutes). Please try again.', EXIT_CODES.AUTH_ERROR)));
    }, 5 * 60 * 1000);
  });
}

function getAvailablePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(start, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : start;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(getAvailablePort(start + 1)));
  });
}

function validateUrl(input: string): string {
  let parsed: URL;

  try {
    parsed = new URL(input);
  } catch {
    throw new CliError(`Invalid URL: ${input}`, EXIT_CODES.GENERAL_ERROR);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new CliError(`Unsupported URL protocol: ${parsed.protocol}`, EXIT_CODES.GENERAL_ERROR);
  }

  return parsed.toString();
}


async function promptForSite(): Promise<SupportedSite> {
  const inq = (inquirer as unknown as { createPromptModule: () => (questions: unknown[]) => Promise<{ site: SupportedSite }> }).createPromptModule();
  const { site } = await inq([
    {
      type: 'list',
      name: 'site',
      message: 'Which site do you want to login to?',
      choices: SUPPORTED_SITES.map((value) => ({ name: value, value })),
    },
  ]);

  return site;
}

async function httpGetJson<T = unknown>(urlString: string): Promise<T> {
  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise<T>((resolve, reject) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `ship/${CLI_VERSION}`,
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          const parsed = parseJsonSafely(responseBody);
          const status = res.statusCode ?? 500;

          if (status < 200 || status >= 300) {
            reject(new HttpError(`Request failed with status ${status}`, status, parsed));
            return;
          }

          resolve(parsed as T);
        });
      },
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new CliError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, EXIT_CODES.NETWORK_ERROR));
    });

    req.on('error', (error) => {
      reject(
        error instanceof CliError
          ? error
          : new CliError(`Network request failed: ${getErrorMessage(error)}`, EXIT_CODES.NETWORK_ERROR),
      );
    });

    req.end();
  });
}

async function downloadToFile(urlString: string, destination: string): Promise<void> {
  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;

  await fs.ensureDir(path.dirname(destination));

  return new Promise<void>((resolve, reject) => {
    const fileStream = fs.createWriteStream(destination, { mode: 0o755 });

    const req = transport.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: {
          'User-Agent': `ship/${CLI_VERSION}`,
        },
      },
      (res) => {
        if ((res.statusCode ?? 500) >= 300 && (res.statusCode ?? 500) < 400 && res.headers.location) {
          fileStream.close();
          fs.remove(destination).catch(() => undefined).finally(() => {
            downloadToFile(res.headers.location as string, destination).then(resolve).catch(reject);
          });
          return;
        }

        if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
          fileStream.close();
          fs.remove(destination).catch(() => undefined).finally(() => {
            reject(new CliError(`Download failed with status ${res.statusCode ?? 500}`, EXIT_CODES.NETWORK_ERROR));
          });
          return;
        }

        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      },
    );

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new CliError(`Download timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, EXIT_CODES.NETWORK_ERROR));
    });

    req.on('error', (error) => {
      fileStream.close();
      fs.remove(destination).catch(() => undefined).finally(() => {
        reject(
          error instanceof CliError
            ? error
            : new CliError(`Download failed: ${getErrorMessage(error)}`, EXIT_CODES.NETWORK_ERROR),
        );
      });
    });
  });
}

async function fetchLatestReleaseInfo(): Promise<LatestReleaseInfo> {
  if (process.env.TEST_SUBMIT_DIR_LATEST_VERSION) {
    return {
      version: process.env.TEST_SUBMIT_DIR_LATEST_VERSION,
      downloadUrl: process.env.TEST_SUBMIT_DIR_DOWNLOAD_URL,
      assets: [],
    };
  }

  const response = await httpGetJson<{ tag_name: string; assets?: ReleaseAsset[] }>(RELEASE_API_URL);
  const version = response.tag_name.replace(/^v/, '');
  const assets = response.assets ?? [];
  return {
    version,
    assets,
    downloadUrl: getReleaseAssetUrl(assets),
  };
}

async function readUpdateCheckCache(): Promise<UpdateCheckCache | null> {
  if (!(await fs.pathExists(UPDATE_CHECK_PATH))) {
    return null;
  }

  try {
    return await fs.readJson(UPDATE_CHECK_PATH) as UpdateCheckCache;
  } catch {
    return null;
  }
}

async function writeUpdateCheckCache(cache: UpdateCheckCache): Promise<void> {
  await fs.ensureFile(UPDATE_CHECK_PATH);
  await fs.writeJson(UPDATE_CHECK_PATH, cache, { spaces: 2 });
}

async function getLatestReleaseInfo(options: { useCache?: boolean } = {}): Promise<LatestReleaseInfo> {
  const useCache = options.useCache !== false;
  if (useCache) {
    const cached = await readUpdateCheckCache();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.checkedAt).getTime();
      if (ageMs < UPDATE_CHECK_INTERVAL_MS) {
        return {
          version: cached.latestVersion,
          downloadUrl: cached.downloadUrl,
          assets: [],
        };
      }
    }
  }

  const latest = await fetchLatestReleaseInfo();
  await writeUpdateCheckCache({
    checkedAt: new Date().toISOString(),
    latestVersion: latest.version,
    downloadUrl: latest.downloadUrl,
  });
  return latest;
}

async function maybeNotifyUpdate(options: { silent?: boolean; json?: boolean; quiet?: boolean } = {}): Promise<void> {
  if (process.env.TEST_SUBMIT_DIR_SKIP_UPDATE_CHECK === '1') {
    return;
  }

  try {
    const latest = await getLatestReleaseInfo({ useCache: true });
    if (compareVersions(latest.version, CLI_VERSION) > 0) {
      if (!options.silent && !options.json && !options.quiet) {
        console.log(`ℹ️  Update available: v${latest.version} (current v${CLI_VERSION}). Run 'ship self-update'.`);
      }
    }
  } catch {
    // Ignore update check failures silently.
  }
}

async function login(options: { site?: string }) {
  await maybeNotifyUpdate();

  const site = options.site
    ? normalizeSite(options.site)
    : await promptForSite();

  const port = await getAvailablePort(38492);
  const callbackUrl = `http://localhost:${port}/callback`;
  const state = randomBytes(24).toString('hex');
  const callbackWithState = `${callbackUrl}?state=${encodeURIComponent(state)}`;
  const authUrl = `${SITE_AUTH_URLS[site]}?callback=${encodeURIComponent(callbackWithState)}`;

  console.log(`\n🔐 Opening browser to login to ${site}...`);
  console.log(`   Waiting for callback on localhost:${port}\n`);

  try {
    openBrowser(authUrl);
  } catch (error: unknown) {
    console.error(`\n❌ Failed to open browser automatically.`);
    console.error(`Open this URL manually:`);
    console.error(authUrl);
    process.exit(error instanceof CliError ? error.exitCode : EXIT_CODES.AUTH_ERROR);
  }

  try {
    const { token } = await waitForCallback(port, site, state);
    await saveSiteConfig(site, token);
    console.log(`\n✅ Login successful`);
  } catch (error: unknown) {
    console.error(`\n❌ Login failed: ${getErrorMessage(error)}`);
    process.exit(error instanceof CliError ? error.exitCode : EXIT_CODES.AUTH_ERROR);
  }
}

async function httpPost(
  baseUrl: string,
  token: string,
  endpoint: string,
  body: object,
): Promise<HttpResponse> {
  const url = new URL(endpoint, baseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await new Promise<HttpResponse>((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = transport.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              responseBody += chunk;
            });
            res.on('end', () => {
              const parsed = parseJsonSafely(responseBody);
              const status = res.statusCode ?? 500;

              if (status < 200 || status >= 300) {
                reject(
                  new HttpError(
                    `Request failed with status ${status}`,
                    status,
                    parsed,
                    status === 401 || status === 403 ? EXIT_CODES.AUTH_ERROR : EXIT_CODES.API_ERROR,
                  ),
                );
                return;
              }

              resolve({ status, data: parsed });
            });
          },
        );

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          req.destroy(new CliError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, EXIT_CODES.NETWORK_ERROR));
        });

        req.on('error', (error) => {
          reject(
            error instanceof CliError
              ? error
              : new CliError(`Network request failed: ${getErrorMessage(error)}`, EXIT_CODES.NETWORK_ERROR),
          );
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      const shouldRetry = attempt < MAX_RETRIES && error instanceof CliError && error.exitCode === EXIT_CODES.NETWORK_ERROR;
      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw new CliError('Request failed after retries.', EXIT_CODES.NETWORK_ERROR);
}




async function showVersion(options: { latest?: boolean; json?: boolean }) {
  try {
    const payload: Record<string, unknown> = { current: CLI_VERSION };

    if (options.latest) {
      const latest = await getLatestReleaseInfo({ useCache: false });
      payload.latest = latest.version;
      payload.updateAvailable = compareVersions(latest.version, CLI_VERSION) > 0;
    }

    if (options.json) {
      printJson(payload);
      return;
    }

    console.log(`ship v${CLI_VERSION}`);
    if (options.latest && payload.latest) {
      console.log(`latest: v${payload.latest}`);
      if (payload.updateAvailable) {
        console.log('update available');
      }
    }
  } catch (error: unknown) {
    printCommandError(error, { json: options.json });
  }
}

async function selfUpdate(options: { json?: boolean }) {
  try {
    const latest = await getLatestReleaseInfo({ useCache: false });
    const runtimePlatform = process.env.TEST_SUBMIT_DIR_PLATFORM || process.platform;

    if (compareVersions(latest.version, CLI_VERSION) <= 0) {
      if (options.json) {
        printJson({ success: true, updated: false, current: CLI_VERSION, latest: latest.version });
      } else {
        console.log(`Already up to date (v${CLI_VERSION}).`);
      }
      return;
    }

    if (runtimePlatform === 'win32') {
      throw new CliError(
        `Self-update is not supported on Windows yet. Download v${latest.version} manually from https://github.com/${RELEASE_REPO}/releases/latest`,
      );
    }

    if (!latest.downloadUrl) {
      throw new CliError(`No downloadable asset found for ${process.platform}/${process.arch}.`);
    }

    const executablePath = getExecutablePath();
    const tempPath = `${executablePath}.download`;
    await downloadToFile(latest.downloadUrl, tempPath);
    await fs.chmod(tempPath, 0o755);
    await fs.move(tempPath, executablePath, { overwrite: true });
    await writeUpdateCheckCache({
      checkedAt: new Date().toISOString(),
      latestVersion: latest.version,
      downloadUrl: latest.downloadUrl,
    });

    if (options.json) {
      printJson({ success: true, updated: true, previous: CLI_VERSION, current: latest.version });
    } else {
      console.log(`Updated ship from v${CLI_VERSION} to v${latest.version}.`);
    }
  } catch (error: unknown) {
    printCommandError(error, { json: options.json });
  }
}

async function submit(targetUrl: string, options: { site?: string; json?: boolean; quiet?: boolean }) {
  try {
    await maybeNotifyUpdate({ json: options.json, quiet: options.quiet });
    const validUrl = validateUrl(targetUrl);
    const config = await loadConfig({ site: options.site });

    if (!options.json && !options.quiet) {
      console.log(`Submitting ${validUrl} to ${config.baseUrl}...`);
    }

    const result = await httpPost(config.baseUrl, config.token, '/api/submit', { link: validUrl });
    printResult(result, options);
  } catch (error: unknown) {
    printCommandError(error, options);
  }
}

async function fetchPreview(targetUrl: string, options: { site?: string; json?: boolean; quiet?: boolean }) {
  try {
    await maybeNotifyUpdate({ json: options.json, quiet: options.quiet });
    const validUrl = validateUrl(targetUrl);
    const config = await loadConfig({ site: options.site });

    if (!options.json && !options.quiet) {
      console.log(`Fetching preview for ${validUrl} from ${config.baseUrl}...`);
    }

    const result = await httpPost(config.baseUrl, config.token, '/api/fetch-website', { link: validUrl });
    printResult(result, options);
  } catch (error: unknown) {
    printCommandError(error, options);
  }
}

const program = new Command();

program
  .name('ship')
  .description('CLI for shipping, submitting, and managing site growth workflows')
  .version(CLI_VERSION);

program
  .command('login')
  .description('Login via browser (supports aidirs.org and backlinkdirs.com)')
  .option('--site <site>', `Site to login to (${SUPPORTED_SITES.join(', ')})`)
  .action(login);

program
  .command('submit <url>')
  .description('Submit a URL to the selected site')
  .option('--site <site>', `Override configured site (${SUPPORTED_SITES.join(', ')})`)
  .option('--json', 'Print machine-readable JSON output')
  .option('--quiet', 'Print only response payload')
  .action(submit);

program
  .command('fetch <url>')
  .description('Preview a URL without creating a record')
  .option('--site <site>', `Override configured site (${SUPPORTED_SITES.join(', ')})`)
  .option('--json', 'Print machine-readable JSON output')
  .option('--quiet', 'Print only response payload')
  .action(fetchPreview);

program
  .command('version')
  .description('Show current version information')
  .option('--latest', 'Fetch latest release information from GitHub')
  .option('--json', 'Print machine-readable JSON output')
  .action(showVersion);

program
  .command('self-update')
  .description('Download and install the latest release for this platform')
  .option('--json', 'Print machine-readable JSON output')
  .action(selfUpdate);

program.parse(process.argv);

if (process.argv.length === 2) {
  program.help();
}
