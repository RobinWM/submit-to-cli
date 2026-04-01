#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as http from 'http';
import { execSync } from 'child_process';
import inquirer from 'inquirer';

const CONFIG_PATH = path.join(process.env.HOME || '', '.config', 'submit-to-cli', 'config.json');

interface Config {
  DIRS_TOKEN: string;
  DIRS_BASE_URL: string;
}

async function loadConfig(): Promise<Config> {
  if (!(await fs.pathExists(CONFIG_PATH))) {
    throw new Error(`Not logged in. Run 'submit-to-cli login' first.`);
  }
  const config = await fs.readJson(CONFIG_PATH);
  if (!config.DIRS_TOKEN) {
    throw new Error(`DIRS_TOKEN not found in config. Run 'submit-to-cli login' first.`);
  }
  return config;
}

function openBrowser(url: string) {
  const platform = process.platform;
  if (platform === 'darwin') {
    execSync(`open "${url}"`, { stdio: 'ignore' });
  } else if (platform === 'linux') {
    execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } else {
    execSync(`start "" "${url}"`, { stdio: 'ignore' });
  }
}

function waitForCallback(port: number): Promise<{ token: string; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url!, `http://localhost:${port}`);
      const token = url.searchParams.get('token');
      const site = url.searchParams.get('site') || 'aidirs.org';

      if (token) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#22c55e;">✅ Login successful</h2>
          <p style="color:#666;">Token saved. You can close this window.</p>
          <script>window.close()</script>
        </body></html>`);
        server.close();
        const baseUrl = site === 'backlinkdirs.com' ? 'https://backlinkdirs.com' : 'https://aidirs.org';
        resolve({ token, baseUrl });
      } else {
        const error = url.searchParams.get('error') || 'Unknown error';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#ef4444;">❌ Login failed</h2>
          <p style="color:#666;">${error}</p>
        </body></html>`);
        server.close();
        reject(new Error(error));
      }
    });

    server.listen(port, '127.0.0.1', () => {});

    setTimeout(() => {
      server.close();
      reject(new Error('Login timeout (5 minutes). Please try again.'));
    }, 5 * 60 * 1000);
  });
}

function getAvailablePort(start: number): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(start, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(getAvailablePort(start + 1)));
  });
}

async function login() {
  const inq = (inquirer as any).createPromptModule();
  const { site } = await inq([
    {
      type: 'list',
      name: 'site',
      message: 'Which site do you want to login to?',
      choices: [
        { name: 'aidirs.org', value: 'aidirs.org' },
        { name: 'backlinkdirs.com', value: 'backlinkdirs.com' },
      ],
    },
  ]);

  const authUrls: Record<string, string> = {
    'aidirs.org': 'https://aidirs.org/auth/login',
    'backlinkdirs.com': 'https://backlinkdirs.com/auth/login',
  };

  const port = await getAvailablePort(38492);
  const callbackUrl = `http://localhost:${port}/callback`;
  const authUrl = `${authUrls[site]}?callback=${encodeURIComponent(callbackUrl)}`;

  console.log(`\n🔐 Opening browser to login to ${site}...`);
  console.log(`   Waiting for callback on localhost:${port}\n`);

  openBrowser(authUrl);

  try {
    const { token, baseUrl } = await waitForCallback(port);

    const config: Config = {
      DIRS_TOKEN: token,
      DIRS_BASE_URL: baseUrl,
    };

    await fs.ensureFile(CONFIG_PATH);
    await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
    console.log(`\n✅ Login saved to ${CONFIG_PATH}`);
  } catch (err: any) {
    console.error(`\n❌ Login failed: ${err.message}`);
    process.exit(1);
  }
}

async function httpPost(baseUrl: string, token: string, endpoint: string, body: object): Promise<unknown> {
  const url = new URL(endpoint, baseUrl);
  const httpMod = url.protocol === 'https:' ? require('https') : require('http');

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = httpMod.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`,
      },
    }, (res: any) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function submit(url: string) {
  const config = await loadConfig();
  console.log(`Submitting ${url} to ${config.DIRS_BASE_URL}...`);
  try {
    const result = await httpPost(config.DIRS_BASE_URL, config.DIRS_TOKEN, '/api/submit', { link: url }) as any;
    console.log(`Status: ${result.status}`);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

async function fetch(url: string) {
  const config = await loadConfig();
  console.log(`Fetching preview for ${url} from ${config.DIRS_BASE_URL}...`);
  try {
    const result = await httpPost(config.DIRS_BASE_URL, config.DIRS_TOKEN, '/api/fetch-website', { link: url }) as any;
    console.log(`Status: ${result.status}`);
    console.log('Response:', JSON.stringify(result.data, null, 2));
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

const program = new Command();

program
  .name('submit-to-cli')
  .description('CLI tool for submitting URLs to aidirs.org and backlinkdirs.com')
  .version('1.0.0');

program
  .command('login')
  .description('Login via browser (supports aidirs.org and backlinkdirs.com)')
  .action(login);

program
  .command('submit <url>')
  .description('Submit a URL to aidirs')
  .action(submit);

program
  .command('fetch <url>')
  .description('Preview a URL without creating a record')
  .action(fetch);

program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}
