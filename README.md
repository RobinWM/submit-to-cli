# submit-to-cli

CLI tool for submitting URLs to [aidirs.org](https://aidirs.org).

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

First, log in with your API token:

```bash
submit-to-cli login
```

You'll be prompted for:
- `DIRS_TOKEN` — your API token from aidirs.org
- `DIRS_BASE_URL` — API base URL (defaults to `https://aidirs.org`)

Config is saved to `~/.config/submit-to-cli/config.json`.

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
| `login` | Interactive login to save your API token |
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
