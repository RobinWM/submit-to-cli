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
const errors_1 = require("./lib/errors");
const config_1 = require("./lib/config");
const output_1 = require("./lib/output");
const sites_1 = require("./lib/sites");
const CLI_VERSION = require('../package.json').version;
const RELEASE_REPO = 'RobinWM/ship-cli';
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
const UPDATE_CHECK_PATH = path.join(process.env.HOME || '', '.config', 'ship', 'update-check.json');
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
function parseJsonSafely(body) {
    try {
        return JSON.parse(body);
    }
    catch {
        return body;
    }
}
function compareVersions(left, right) {
    const parse = (value) => value.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
    const leftParts = parse(left);
    const rightParts = parse(right);
    const maxLength = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < maxLength; index += 1) {
        const leftValue = leftParts[index] ?? 0;
        const rightValue = rightParts[index] ?? 0;
        if (leftValue > rightValue)
            return 1;
        if (leftValue < rightValue)
            return -1;
    }
    return 0;
}
function detectPlatformAssetName() {
    const platform = process.env.TEST_SUBMIT_DIR_PLATFORM || process.platform;
    const arch = process.env.TEST_SUBMIT_DIR_ARCH || process.arch;
    if (platform === 'linux') {
        if (arch === 'x64')
            return 'ship-linux-x64';
        if (arch === 'arm64')
            return 'ship-linux-arm64';
    }
    if (platform === 'darwin') {
        if (arch === 'x64')
            return 'ship-darwin-x64';
        if (arch === 'arm64')
            return 'ship-darwin-arm64';
    }
    return null;
}
function getExecutablePath() {
    return fs.realpathSync(process.argv[1]);
}
function getReleaseAssetUrl(assets) {
    const assetName = detectPlatformAssetName();
    if (!assetName)
        return undefined;
    return assets.find((asset) => asset.name === assetName)?.browser_download_url;
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
        throw new errors_1.CliError('Failed to open browser with macOS open command.');
    }
    if (platform === 'linux') {
        if (tryOpen('xdg-open', [url]))
            return;
        throw new errors_1.CliError('Failed to open browser with xdg-open.');
    }
    if (platform === 'win32') {
        if (tryOpen('rundll32', ['url.dll,FileProtocolHandler', url]))
            return;
        if (tryOpen('cmd', ['/c', 'start', '', url]))
            return;
        throw new errors_1.CliError('Failed to open browser on Windows. Try opening the login URL manually.');
    }
    throw new errors_1.CliError(`Unsupported platform: ${platform}`);
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
            const site = (0, sites_1.normalizeSite)(requestUrl.searchParams.get('site') || expectedSite);
            const state = requestUrl.searchParams.get('state');
            if (state !== expectedState) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<html><body><h2>Invalid login state</h2></body></html>');
                finish(() => reject(new errors_1.CliError('Login failed: invalid callback state.', errors_1.EXIT_CODES.AUTH_ERROR)));
                return;
            }
            if (site !== expectedSite) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<html><body><h2>Login site mismatch</h2></body></html>');
                finish(() => reject(new errors_1.CliError('Login failed: callback site mismatch.', errors_1.EXIT_CODES.AUTH_ERROR)));
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
            finish(() => reject(new errors_1.CliError(error, errors_1.EXIT_CODES.AUTH_ERROR)));
        });
        server.listen(port, '127.0.0.1');
        setTimeout(() => {
            finish(() => reject(new errors_1.CliError('Login timeout (5 minutes). Please try again.', errors_1.EXIT_CODES.AUTH_ERROR)));
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
        throw new errors_1.CliError(`Invalid URL: ${input}`, errors_1.EXIT_CODES.GENERAL_ERROR);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new errors_1.CliError(`Unsupported URL protocol: ${parsed.protocol}`, errors_1.EXIT_CODES.GENERAL_ERROR);
    }
    return parsed.toString();
}
async function promptForSite() {
    const inq = inquirer_1.default.createPromptModule();
    const { site } = await inq([
        {
            type: 'list',
            name: 'site',
            message: 'Which site do you want to login to?',
            choices: sites_1.SUPPORTED_SITES.map((value) => ({ name: value, value })),
        },
    ]);
    return site;
}
async function httpGetJson(urlString) {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = transport.request({
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': `ship/${CLI_VERSION}`,
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
                    reject(new errors_1.HttpError(`Request failed with status ${status}`, status, parsed));
                    return;
                }
                resolve(parsed);
            });
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new errors_1.CliError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, errors_1.EXIT_CODES.NETWORK_ERROR));
        });
        req.on('error', (error) => {
            reject(error instanceof errors_1.CliError
                ? error
                : new errors_1.CliError(`Network request failed: ${(0, errors_1.getErrorMessage)(error)}`, errors_1.EXIT_CODES.NETWORK_ERROR));
        });
        req.end();
    });
}
async function downloadToFile(urlString, destination) {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    await fs.ensureDir(path.dirname(destination));
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(destination, { mode: 0o755 });
        const req = transport.get({
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            headers: {
                'User-Agent': `ship/${CLI_VERSION}`,
            },
        }, (res) => {
            if ((res.statusCode ?? 500) >= 300 && (res.statusCode ?? 500) < 400 && res.headers.location) {
                fileStream.close();
                fs.remove(destination).catch(() => undefined).finally(() => {
                    downloadToFile(res.headers.location, destination).then(resolve).catch(reject);
                });
                return;
            }
            if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
                fileStream.close();
                fs.remove(destination).catch(() => undefined).finally(() => {
                    reject(new errors_1.CliError(`Download failed with status ${res.statusCode ?? 500}`, errors_1.EXIT_CODES.NETWORK_ERROR));
                });
                return;
            }
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new errors_1.CliError(`Download timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, errors_1.EXIT_CODES.NETWORK_ERROR));
        });
        req.on('error', (error) => {
            fileStream.close();
            fs.remove(destination).catch(() => undefined).finally(() => {
                reject(error instanceof errors_1.CliError
                    ? error
                    : new errors_1.CliError(`Download failed: ${(0, errors_1.getErrorMessage)(error)}`, errors_1.EXIT_CODES.NETWORK_ERROR));
            });
        });
    });
}
async function fetchLatestReleaseInfo() {
    if (process.env.TEST_SUBMIT_DIR_LATEST_VERSION) {
        return {
            version: process.env.TEST_SUBMIT_DIR_LATEST_VERSION,
            downloadUrl: process.env.TEST_SUBMIT_DIR_DOWNLOAD_URL,
            assets: [],
        };
    }
    const response = await httpGetJson(RELEASE_API_URL);
    const version = response.tag_name.replace(/^v/, '');
    const assets = response.assets ?? [];
    return {
        version,
        assets,
        downloadUrl: getReleaseAssetUrl(assets),
    };
}
async function readUpdateCheckCache() {
    if (!(await fs.pathExists(UPDATE_CHECK_PATH))) {
        return null;
    }
    try {
        return await fs.readJson(UPDATE_CHECK_PATH);
    }
    catch {
        return null;
    }
}
async function writeUpdateCheckCache(cache) {
    await fs.ensureFile(UPDATE_CHECK_PATH);
    await fs.writeJson(UPDATE_CHECK_PATH, cache, { spaces: 2 });
}
async function getLatestReleaseInfo(options = {}) {
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
async function maybeNotifyUpdate(options = {}) {
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
    }
    catch {
        // Ignore update check failures silently.
    }
}
async function login(options) {
    await maybeNotifyUpdate();
    const site = options.site
        ? (0, sites_1.normalizeSite)(options.site)
        : await promptForSite();
    const port = await getAvailablePort(38492);
    const callbackUrl = `http://localhost:${port}/callback`;
    const state = (0, crypto_1.randomBytes)(24).toString('hex');
    const callbackWithState = `${callbackUrl}?state=${encodeURIComponent(state)}`;
    const authUrl = `${sites_1.SITE_AUTH_URLS[site]}?callback=${encodeURIComponent(callbackWithState)}`;
    console.log(`\n🔐 Opening browser to login to ${site}...`);
    console.log(`   Waiting for callback on localhost:${port}\n`);
    try {
        openBrowser(authUrl);
    }
    catch (error) {
        console.error(`\n❌ Failed to open browser automatically.`);
        console.error(`Open this URL manually:`);
        console.error(authUrl);
        process.exit(error instanceof errors_1.CliError ? error.exitCode : errors_1.EXIT_CODES.AUTH_ERROR);
    }
    try {
        const { token } = await waitForCallback(port, site, state);
        await (0, config_1.saveSiteConfig)(site, token);
        console.log(`\n✅ Login successful`);
    }
    catch (error) {
        console.error(`\n❌ Login failed: ${(0, errors_1.getErrorMessage)(error)}`);
        process.exit(error instanceof errors_1.CliError ? error.exitCode : errors_1.EXIT_CODES.AUTH_ERROR);
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
                            reject(new errors_1.HttpError(`Request failed with status ${status}`, status, parsed, status === 401 || status === 403 ? errors_1.EXIT_CODES.AUTH_ERROR : errors_1.EXIT_CODES.API_ERROR));
                            return;
                        }
                        resolve({ status, data: parsed });
                    });
                });
                req.setTimeout(REQUEST_TIMEOUT_MS, () => {
                    req.destroy(new errors_1.CliError(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, errors_1.EXIT_CODES.NETWORK_ERROR));
                });
                req.on('error', (error) => {
                    reject(error instanceof errors_1.CliError
                        ? error
                        : new errors_1.CliError(`Network request failed: ${(0, errors_1.getErrorMessage)(error)}`, errors_1.EXIT_CODES.NETWORK_ERROR));
                });
                req.write(data);
                req.end();
            });
        }
        catch (error) {
            const shouldRetry = attempt < MAX_RETRIES && error instanceof errors_1.CliError && error.exitCode === errors_1.EXIT_CODES.NETWORK_ERROR;
            if (!shouldRetry) {
                throw error;
            }
        }
    }
    throw new errors_1.CliError('Request failed after retries.', errors_1.EXIT_CODES.NETWORK_ERROR);
}
async function showVersion(options) {
    try {
        const payload = { current: CLI_VERSION };
        if (options.latest) {
            const latest = await getLatestReleaseInfo({ useCache: false });
            payload.latest = latest.version;
            payload.updateAvailable = compareVersions(latest.version, CLI_VERSION) > 0;
        }
        if (options.json) {
            (0, output_1.printJson)(payload);
            return;
        }
        console.log(`ship v${CLI_VERSION}`);
        if (options.latest && payload.latest) {
            console.log(`latest: v${payload.latest}`);
            if (payload.updateAvailable) {
                console.log('update available');
            }
        }
    }
    catch (error) {
        (0, output_1.printCommandError)(error, { json: options.json });
    }
}
async function selfUpdate(options) {
    try {
        const latest = await getLatestReleaseInfo({ useCache: false });
        const runtimePlatform = process.env.TEST_SUBMIT_DIR_PLATFORM || process.platform;
        if (compareVersions(latest.version, CLI_VERSION) <= 0) {
            if (options.json) {
                (0, output_1.printJson)({ success: true, updated: false, current: CLI_VERSION, latest: latest.version });
            }
            else {
                console.log(`Already up to date (v${CLI_VERSION}).`);
            }
            return;
        }
        if (runtimePlatform === 'win32') {
            throw new errors_1.CliError(`Self-update is not supported on Windows yet. Download v${latest.version} manually from https://github.com/${RELEASE_REPO}/releases/latest`);
        }
        if (!latest.downloadUrl) {
            throw new errors_1.CliError(`No downloadable asset found for ${process.platform}/${process.arch}.`);
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
            (0, output_1.printJson)({ success: true, updated: true, previous: CLI_VERSION, current: latest.version });
        }
        else {
            console.log(`Updated ship from v${CLI_VERSION} to v${latest.version}.`);
        }
    }
    catch (error) {
        (0, output_1.printCommandError)(error, { json: options.json });
    }
}
async function submit(targetUrl, options) {
    try {
        await maybeNotifyUpdate({ json: options.json, quiet: options.quiet });
        const validUrl = validateUrl(targetUrl);
        const config = await (0, config_1.loadConfig)({ site: options.site });
        if (!options.json && !options.quiet) {
            console.log(`Submitting ${validUrl} to ${config.baseUrl}...`);
        }
        const result = await httpPost(config.baseUrl, config.token, '/api/submit', { link: validUrl });
        (0, output_1.printResult)(result, options);
    }
    catch (error) {
        (0, output_1.printCommandError)(error, options);
    }
}
async function fetchPreview(targetUrl, options) {
    try {
        await maybeNotifyUpdate({ json: options.json, quiet: options.quiet });
        const validUrl = validateUrl(targetUrl);
        const config = await (0, config_1.loadConfig)({ site: options.site });
        if (!options.json && !options.quiet) {
            console.log(`Fetching preview for ${validUrl} from ${config.baseUrl}...`);
        }
        const result = await httpPost(config.baseUrl, config.token, '/api/fetch-website', { link: validUrl });
        (0, output_1.printResult)(result, options);
    }
    catch (error) {
        (0, output_1.printCommandError)(error, options);
    }
}
const program = new commander_1.Command();
program
    .name('ship')
    .description('CLI for shipping, submitting, and managing site growth workflows')
    .version(CLI_VERSION);
program
    .command('login')
    .description('Login via browser (supports aidirs.org and backlinkdirs.com)')
    .option('--site <site>', `Site to login to (${sites_1.SUPPORTED_SITES.join(', ')})`)
    .action(login);
program
    .command('submit <url>')
    .description('Submit a URL to the selected site')
    .option('--site <site>', `Override configured site (${sites_1.SUPPORTED_SITES.join(', ')})`)
    .option('--json', 'Print machine-readable JSON output')
    .option('--quiet', 'Print only response payload')
    .action(submit);
program
    .command('fetch <url>')
    .description('Preview a URL without creating a record')
    .option('--site <site>', `Override configured site (${sites_1.SUPPORTED_SITES.join(', ')})`)
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
