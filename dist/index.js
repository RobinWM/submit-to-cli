#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const inquirer_1 = __importDefault(require("inquirer"));
const DEFAULT_SITE = 'aidirs.org';
const SUPPORTED_SITES = ['aidirs.org', 'backlinkdirs.com'];
const SITE_BASE_URLS = {
    'aidirs.org': 'https://aidirs.org',
    'backlinkdirs.com': 'https://backlinkdirs.com',
};
const SITE_AUTH_URLS = {
    'aidirs.org': 'https://aidirs.org/auth/login',
    'backlinkdirs.com': 'https://backlinkdirs.com/auth/login',
};
const EXIT_CODES = {
    GENERAL_ERROR: 1,
    AUTH_ERROR: 2,
    NETWORK_ERROR: 3,
    API_ERROR: 4,
};
const CONFIG_PATH = path.join(process.env.HOME || '', '.config', 'submit-dir', 'config.json');
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
class CliError extends Error {
    constructor(message, exitCode = EXIT_CODES.GENERAL_ERROR) {
        super(message);
        this.exitCode = exitCode;
        this.name = 'CliError';
    }
}
class HttpError extends CliError {
    constructor(message, status, data, exitCode = EXIT_CODES.API_ERROR) {
        super(message, exitCode);
        this.status = status;
        this.data = data;
        this.name = 'HttpError';
    }
}
function normalizeSite(site) {
    if (!site)
        return DEFAULT_SITE;
    if (SUPPORTED_SITES.includes(site)) {
        return site;
    }
    throw new CliError(`Unsupported site '${site}'. Use one of: ${SUPPORTED_SITES.join(', ')}`, EXIT_CODES.GENERAL_ERROR);
}
function normalizeBaseUrl(baseUrl) {
    return baseUrl.replace(/\/$/, '');
}
function getErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
function parseJsonSafely(body) {
    try {
        return JSON.parse(body);
    }
    catch {
        return body;
    }
}
function getSiteFromBaseUrl(baseUrl) {
    if (!baseUrl)
        return DEFAULT_SITE;
    const normalized = normalizeBaseUrl(baseUrl);
    const matchedEntry = Object.entries(SITE_BASE_URLS).find(([, value]) => value === normalized);
    return matchedEntry?.[0] ?? DEFAULT_SITE;
}
async function readConfigFile() {
    if (!(await fs.pathExists(CONFIG_PATH))) {
        return null;
    }
    const rawConfig = (await fs.readJson(CONFIG_PATH));
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
async function writeConfig(config) {
    await fs.ensureFile(CONFIG_PATH);
    await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}
async function loadConfig(options = {}) {
    const envToken = process.env.DIRS_TOKEN;
    const envBaseUrl = process.env.DIRS_BASE_URL;
    const requestedSite = options.site ? normalizeSite(options.site) : undefined;
    const fileConfig = await readConfigFile();
    const site = requestedSite ?? fileConfig?.currentSite ?? getSiteFromBaseUrl(envBaseUrl);
    const siteFromFile = fileConfig?.sites?.[site];
    const token = siteFromFile?.token || envToken || '';
    const baseUrl = normalizeBaseUrl(siteFromFile?.baseUrl || envBaseUrl || SITE_BASE_URLS[site]);
    if (!token) {
        throw new CliError(`No token configured for ${site}. Run 'submit-dir login --site ${site}' first or set DIRS_TOKEN.`, EXIT_CODES.AUTH_ERROR);
    }
    return { site, token, baseUrl };
}
function tryOpen(command, args) {
    try {
        (0, child_process_1.execFileSync)(command, args, { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
function openBrowser(url) {
    const platform = process.platform;
    if (platform === 'darwin') {
        if (tryOpen('open', [url]))
            return;
        throw new CliError('Failed to open browser with macOS open command.');
    }
    if (platform === 'linux') {
        if (tryOpen('xdg-open', [url]))
            return;
        throw new CliError('Failed to open browser with xdg-open.');
    }
    if (platform === 'win32') {
        if (tryOpen('rundll32', ['url.dll,FileProtocolHandler', url]))
            return;
        if (tryOpen('cmd', ['/c', 'start', '', url]))
            return;
        throw new CliError('Failed to open browser on Windows. Try opening the login URL manually.');
    }
    throw new CliError(`Unsupported platform: ${platform}`);
}
function waitForCallback(port, expectedSite, expectedState) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
            if (settled)
                return;
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
function getAvailablePort(start) {
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
function validateUrl(input) {
    let parsed;
    try {
        parsed = new URL(input);
    }
    catch {
        throw new CliError(`Invalid URL: ${input}`, EXIT_CODES.GENERAL_ERROR);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new CliError(`Unsupported URL protocol: ${parsed.protocol}`, EXIT_CODES.GENERAL_ERROR);
    }
    return parsed.toString();
}
async function saveSiteConfig(site, token) {
    const existing = (await readConfigFile()) ?? {
        currentSite: site,
        sites: {},
    };
    const nextConfig = {
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
async function promptForSite() {
    const inq = inquirer_1.default.createPromptModule();
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
async function login(options) {
    const site = options.site
        ? normalizeSite(options.site)
        : await promptForSite();
    const port = await getAvailablePort(38492);
    const callbackUrl = `http://localhost:${port}/callback`;
    const state = (0, crypto_1.randomBytes)(24).toString('hex');
    const authUrl = `${SITE_AUTH_URLS[site]}?callback=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
    console.log(`\n🔐 Opening browser to login to ${site}...`);
    console.log(`   Waiting for callback on localhost:${port}\n`);
    try {
        openBrowser(authUrl);
    }
    catch (error) {
        console.error(`\n❌ Failed to open browser automatically.`);
        console.error(`Open this URL manually:`);
        console.error(authUrl);
        process.exit(error instanceof CliError ? error.exitCode : EXIT_CODES.AUTH_ERROR);
    }
    try {
        const { token } = await waitForCallback(port, site, state);
        await saveSiteConfig(site, token);
        console.log(`\n✅ Login saved to ${CONFIG_PATH}`);
    }
    catch (error) {
        console.error(`\n❌ Login failed: ${getErrorMessage(error)}`);
        process.exit(error instanceof CliError ? error.exitCode : EXIT_CODES.AUTH_ERROR);
    }
}
async function httpPost(baseUrl, token, endpoint, body) {
    const url = new URL(endpoint, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            return await new Promise((resolve, reject) => {
                const data = JSON.stringify(body);
                const req = transport.request({
                    hostname: url.hostname,
                    port: url.port,
                    path: `${url.pathname}${url.search}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data),
                        Authorization: `Bearer ${token}`,
                    },
                }, (res) => {
                    let responseBody = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => {
                        responseBody += chunk;
                    });
                    res.on('end', () => {
                        const parsed = parseJsonSafely(responseBody);
                        const status = res.statusCode ?? 500;
                        if (status < 200 || status >= 300) {
                            reject(new HttpError(`Request failed with status ${status}`, status, parsed, status === 401 || status === 403 ? EXIT_CODES.AUTH_ERROR : EXIT_CODES.API_ERROR));
                            return;
                        }
                        resolve({ status, data: parsed });
                    });
                });
                req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                    req.destroy(new CliError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, EXIT_CODES.NETWORK_ERROR));
                });
                req.on('error', (error) => {
                    reject(error instanceof CliError
                        ? error
                        : new CliError(`Network request failed: ${getErrorMessage(error)}`, EXIT_CODES.NETWORK_ERROR));
                });
                req.write(data);
                req.end();
            });
        }
        catch (error) {
            const shouldRetry = attempt < MAX_RETRIES && error instanceof CliError && error.exitCode === EXIT_CODES.NETWORK_ERROR;
            if (!shouldRetry) {
                throw error;
            }
        }
    }
    throw new CliError('Request failed after retries.', EXIT_CODES.NETWORK_ERROR);
}
function printJson(value) {
    console.log(JSON.stringify(value, null, 2));
}
function printResult(result, options) {
    if (options.json) {
        printJson({ success: true, status: result.status, data: result.data });
        return;
    }
    if (options.quiet) {
        if (typeof result.data === 'string') {
            console.log(result.data);
            return;
        }
        printJson(result.data);
        return;
    }
    console.log(`Status: ${result.status}`);
    console.log('Response:', JSON.stringify(result.data, null, 2));
}
function printCommandError(error, options) {
    if (options.json) {
        const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL_ERROR;
        const payload = {
            success: false,
            error: getErrorMessage(error),
            exitCode,
        };
        if (error instanceof HttpError) {
            payload.status = error.status;
            payload.data = error.data;
        }
        printJson(payload);
    }
    else {
        console.error(`❌ Error: ${getErrorMessage(error)}`);
        if (error instanceof HttpError && error.data) {
            console.error(JSON.stringify(error.data, null, 2));
        }
    }
    process.exit(error instanceof CliError ? error.exitCode : EXIT_CODES.GENERAL_ERROR);
}
async function submit(targetUrl, options) {
    try {
        const validUrl = validateUrl(targetUrl);
        const config = await loadConfig({ site: options.site });
        if (!options.json && !options.quiet) {
            console.log(`Submitting ${validUrl} to ${config.baseUrl}...`);
        }
        const result = await httpPost(config.baseUrl, config.token, '/api/submit', { link: validUrl });
        printResult(result, options);
    }
    catch (error) {
        printCommandError(error, options);
    }
}
async function fetchPreview(targetUrl, options) {
    try {
        const validUrl = validateUrl(targetUrl);
        const config = await loadConfig({ site: options.site });
        if (!options.json && !options.quiet) {
            console.log(`Fetching preview for ${validUrl} from ${config.baseUrl}...`);
        }
        const result = await httpPost(config.baseUrl, config.token, '/api/fetch-website', { link: validUrl });
        printResult(result, options);
    }
    catch (error) {
        printCommandError(error, options);
    }
}
const program = new commander_1.Command();
program
    .name('submit-dir')
    .description('CLI tool for submitting URLs to aidirs.org and backlinkdirs.com')
    .version('1.0.0');
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
program.parse(process.argv);
if (process.argv.length === 2) {
    program.help();
}
