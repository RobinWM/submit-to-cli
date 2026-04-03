const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');

function runCli(args, extraEnv = {}) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-test-'));
  const env = {
    ...process.env,
    HOME: tempHome,
    ...extraEnv,
  };

  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    env,
    encoding: 'utf8',
  });

  return {
    ...result,
    home: tempHome,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

test('submit --help shows site/json/quiet options', () => {
  const output = execFileSync(process.execPath, [CLI_PATH, 'submit', '--help'], {
    encoding: 'utf8',
  });

  assert.match(output, /--site <site>/);
  assert.match(output, /--json/);
  assert.match(output, /--quiet/);
});

test('version command prints current version', () => {
  const result = runCli(['version']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ship v[0-9]+\.[0-9]+\.[0-9]+/);
});

test('package metadata uses scoped npm package name while keeping ship binary', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.name, '@brenn/ship');
  assert.equal(packageJson.bin.ship, './dist/index.js');
  assert.equal(packageJson.publishConfig.access, 'public');
});

test('self-update returns json on windows with manual upgrade guidance', () => {
  const result = runCli(['self-update', '--json'], {
    TEST_SUBMIT_DIR_LATEST_VERSION: '1.0.2',
    TEST_SUBMIT_DIR_DOWNLOAD_URL: 'https://example.com/fake-binary',
    TEST_SUBMIT_DIR_PLATFORM: 'win32',
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.success, false);
  assert.match(payload.error, /Self-update is not supported on Windows yet/);
});

test('invalid URL returns exit code 1', () => {
  const result = runCli(['submit', 'not-a-url']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid URL: not-a-url/);
});

test('invalid URL with --json returns structured error output', () => {
  const result = runCli(['submit', 'not-a-url', '--json']);

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.success, false);
  assert.equal(payload.exitCode, 1);
  assert.match(payload.error, /Invalid URL: not-a-url/);
});

test('legacy config is read for existing users', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-test-'));
  const configDir = path.join(tempHome, '.config', 'ship');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    JSON.stringify({ DIRS_TOKEN: 'legacy-token', DIRS_BASE_URL: 'https://backlinkdirs.com' }, null, 2),
  );

  const result = spawnSync(process.execPath, [CLI_PATH, 'submit', 'https://example.com', '--json'], {
    env: {
      ...process.env,
      HOME: tempHome,
      TEST_SUBMIT_DIR_SKIP_UPDATE_CHECK: '1',
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 1);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(combinedOutput, /No token configured/);
});

test('login on linux prints manual instructions without trying to open browser', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, 'login', '--site', 'aidirs.org'], {
    env: {
      ...process.env,
      TEST_SUBMIT_DIR_SKIP_UPDATE_CHECK: '1',
      TEST_SUBMIT_DIR_PLATFORM: 'linux',
      HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'ship-test-')),
      PATH: '',
    },
    input: '\n\n',
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.match(result.stdout, /Open this URL manually:/);
  assert.match(result.stdout, /required/i);
  assert.match(result.stderr, /Callback URL is required/);
  assert.doesNotMatch(result.stderr, /Failed to open browser automatically/);
});
