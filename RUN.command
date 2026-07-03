#!/bin/zsh
set -e

pause_before_close() {
  echo ""
  read -k 1 "reply?Press any key to close..."
}

TRAPERR() {
  local exit_code=$?
  echo ""
  echo "The pipeline failed before finishing."
  echo "Scroll up for the error. You can run RUN.command again after fixing it."
  pause_before_close
  exit $exit_code
}

SCRIPT_DIR="${0:a:h}"
cd "$SCRIPT_DIR"
MAX_CLIPS="${MAX_CLIPS:-6}"
PADDING_SECONDS="${PADDING_SECONDS:-2}"

echo "ClipCaptionAI"
echo "=============="
echo "Project folder: $SCRIPT_DIR"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on PATH."
  echo "Install Node.js, then double-click RUN.command again."
  pause_before_close
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing project dependencies. This only happens the first time..."
  npm install
  echo ""
fi

echo "Opening workflow menu..."
echo ""
npm run menu

echo ""
echo "Done."
pause_before_close
