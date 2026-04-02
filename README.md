# submit-dir

CLI tool for submitting URLs to [aidirs.org](https://aidirs.org) and [backlinkdirs.com](https://backlinkdirs.com).

## Installation

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RobinWM/submit-dir-cli/main/install.sh)
```

Or from source:

```bash
git clone https://github.com/RobinWM/submit-dir-cli.git
cd submit-dir
bash install.sh
```

## Setup

> **Note:** Submitting URLs requires an active subscription plan.

```bash
submit-dir login
```

Select the site, browser opens automatically, login and done. Token is auto-saved. If you don't have an API token yet, one will be created automatically.

## Usage

### Login
```bash
submit-dir login
```

### Submit a URL
```bash
submit-dir submit https://example.com
```

### Preview a URL (no record created)
```bash
submit-dir fetch https://example.com
```

### Show help
```bash
submit-dir --help
```

## Commands

| Command | Description |
|---------|-------------|
| `login` | Browser-based OAuth login (supports aidirs.org & backlinkdirs.com) |
| `submit <url>` | Submit a URL to aidirs |
| `fetch <url>` | Preview a URL without creating a record |
| `--help` | Show help |

## Config Location

`~/.config/submit-dir/config.json`

```json
{
  "DIRS_TOKEN": "your-token-here",
  "DIRS_BASE_URL": "https://aidirs.org"
}
```

## Environment Variables

Config file takes priority. Environment variables serve as fallback:

```bash
export DIRS_TOKEN="your-token-here"
export DIRS_BASE_URL="https://aidirs.org"
submit-dir submit https://example.com
```
