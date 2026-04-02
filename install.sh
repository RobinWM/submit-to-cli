#!/bin/bash
set -e

REPO_URL="https://github.com/RobinWM/submit-dir-cli.git"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.submit-dir/bin}"
TEMP_DIR="$(mktemp -d)"
SHELL_RC="$HOME/.bashrc"

echo "Installing submit-dir..."

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# Determine download tool
if command -v curl &>/dev/null; then
  DL_CMD="curl -fsSL"
elif command -v wget &>/dev/null; then
  DL_CMD="wget -qO-"
else
  echo "Error: curl or wget is required"
  exit 1
fi

RELEASE_URL="https://github.com/RobinWM/submit-dir-cli/releases/latest/download/submit-dir-${OS}-${ARCH}"

# Try pre-built binary first
if $DL_CMD --head "$RELEASE_URL" &>/dev/null; then
  echo "Downloading binary for $OS/$ARCH..."
  mkdir -p "$INSTALL_DIR"
  $DL_CMD "$RELEASE_URL" -o "$INSTALL_DIR/submit-dir"
  chmod +x "$INSTALL_DIR/submit-dir"
  echo "✅ Installed to $INSTALL_DIR/submit-dir"
else
  echo "No pre-built binary for $OS/$ARCH. Building from source..."
  echo "Cloning repository..."

  if command -v git &>/dev/null; then
    git clone --depth=1 "$REPO_URL" "$TEMP_DIR/submit-dir-cli"
  else
    # Fallback: download zip
    $DL_CMD "https://github.com/RobinWM/submit-dir-cli/archive/refs/heads/main.zip" -o "$TEMP_DIR/main.zip"
    unzip -q "$TEMP_DIR/main.zip" -d "$TEMP_DIR"
  fi

  cd "$TEMP_DIR/submit-dir-cli"
  npm install
  npm run build
  mkdir -p "$INSTALL_DIR"
  cp dist/index.js "$INSTALL_DIR/submit-dir"
  chmod +x "$INSTALL_DIR/submit-dir"
  echo "✅ Built and installed to $INSTALL_DIR/submit-dir"
fi

# Add to PATH
if [ -f "$SHELL_RC" ] && ! grep -q "\.submit-dir/bin" "$SHELL_RC"; then
  echo "" >> "$SHELL_RC"
  echo "# submit-dir" >> "$SHELL_RC"
  echo 'export PATH="$HOME/.submit-dir/bin:$PATH"' >> "$SHELL_RC"
  echo "Added \`\$HOME/.submit-dir/bin\` to PATH in $SHELL_RC"
fi

rm -rf "$TEMP_DIR"
echo "✅ Done! Run 'submit-dir --help' to get started."
