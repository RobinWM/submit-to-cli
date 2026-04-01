# submit-to-cli

CLI tool for submitting URLs to [aidirs.org](https://aidirs.org) and [backlinkdirs.com](https://backlinkdirs.com).

## Installation

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RobinWM/submit-to-cli/main/install.sh)
```

Or from source:

```bash
git clone https://github.com/RobinWM/submit-to-cli.git
cd submit-to-cli
bash install.sh
```

## Setup

```bash
submit-to-cli login
```

Select the site, browser opens automatically, login and done. Token is auto-saved. If you don't have an API token yet, one will be created automatically.

## Usage

### Login
```bash
submit-to-cli login
```

### Submit a URL
```bash
submit-to-cli submit https://example.com
```

### Preview a URL (no record created)
```bash
submit-to-cli fetch https://example.com
```

### Show help
```bash
submit-to-cli --help
```

## Commands

| Command | Description |
|---------|-------------|
| `login` | Browser-based OAuth login (supports aidirs.org & backlinkdirs.com) |
| `submit <url>` | Submit a URL to aidirs |
| `fetch <url>` | Preview a URL without creating a record |
| `--help` | Show help |

## Config Location

`~/.config/submit-to-cli/config.json`

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
submit-to-cli submit https://example.com
```
