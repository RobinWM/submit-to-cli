#!/usr/bin/env bash
set -euo pipefail

BUMP_TYPE="${1:-}"
if [[ -z "$BUMP_TYPE" ]]; then
  echo "Usage: ./scripts/release.sh <patch|minor|major>"
  exit 1
fi

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Invalid release type: $BUMP_TYPE"
  echo "Use one of: patch, minor, major"
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required"
  exit 1
fi

REPO="RobinWM/submit-dir-cli"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "Release must be run from main. Current branch: $CURRENT_BRANCH"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash changes first."
  exit 1
fi

npm test

NEW_VERSION="$(npm version "$BUMP_TYPE" -m "chore: release v%s")"
TAG_NAME="$NEW_VERSION"
VERSION_NO_V="${TAG_NAME#v}"

# Keep manual workflow default aligned with latest version.
TAG_NAME_ENV="$TAG_NAME" python3 - <<'PY'
from pathlib import Path
import os, re
wf = Path('.github/workflows/release.yml')
s = wf.read_text()
tag = os.environ['TAG_NAME_ENV']
s = re.sub(r'default: v[0-9]+\.[0-9]+\.[0-9]+', f'default: {tag}', s)
wf.write_text(s)
PY

if ! git diff --quiet .github/workflows/release.yml; then
  git add .github/workflows/release.yml
  git commit --amend --no-edit
  git tag -d "$TAG_NAME" >/dev/null 2>&1 || true
  git tag "$TAG_NAME"
fi

git push origin main --follow-tags

gh release create "$TAG_NAME" \
  --repo "$REPO" \
  --target main \
  --title "$TAG_NAME" \
  --notes "Release $TAG_NAME"

echo "✅ Released $TAG_NAME"
