#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v brew >/dev/null 2>&1; then
  echo '请先从 https://brew.sh 安装 Homebrew，再运行本脚本。'
  exit 1
fi
if [[ ! -d '/Applications/Visual Studio Code.app' ]]; then
  brew install --cask visual-studio-code
fi
brew install node@24 python@3.13 go
export PATH="$(brew --prefix node@24)/bin:$(brew --prefix python@3.13)/bin:$(brew --prefix go)/bin:$PATH"
npm ci --omit=dev
node scripts/setup.mjs "$@"
