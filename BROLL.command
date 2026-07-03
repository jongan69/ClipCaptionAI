#!/bin/zsh
set -e

pause_before_close() {
  echo ""
  read -k 1 "reply?Press any key to close..."
}

TRAPERR() {
  local exit_code=$?
  echo ""
  echo "The B-roll finder failed before finishing."
  echo "Scroll up for the error. You can run BROLL.command again after fixing it."
  pause_before_close
  exit $exit_code
}

SCRIPT_DIR="${0:a:h}"
cd "$SCRIPT_DIR"

MAX_RESULTS="${MAX_RESULTS:-8}"
MAX_DOWNLOADS="${MAX_DOWNLOADS:-3}"
MAX_DURATION_SECONDS="${MAX_DURATION_SECONDS:-60}"

echo "ClipCaptionAI B-roll Finder"
echo "==========================="
echo "Project folder: $SCRIPT_DIR"
echo "Prompt file: $SCRIPT_DIR/broll-prompts.txt"
echo "Max downloads per prompt: $MAX_DOWNLOADS"
echo "Max duration seconds: $MAX_DURATION_SECONDS"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on PATH."
  echo "Install Node.js, then double-click BROLL.command again."
  pause_before_close
  exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp is required but was not found on PATH."
  echo "Install it with: brew install yt-dlp"
  pause_before_close
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe is required but was not found on PATH."
  echo "Install it with: brew install ffmpeg"
  pause_before_close
  exit 1
fi

if [ ! -f "broll-prompts.txt" ]; then
  cat > broll-prompts.txt <<'EOF'
# Put one B-roll search idea per line.
# Blank lines and lines starting with # are ignored.
EOF
fi

if ! grep -Eq '^[[:space:]]*[^#[:space:]]' broll-prompts.txt; then
  echo "No B-roll prompts found in broll-prompts.txt."
  echo "Opening broll-prompts.txt now. Add one phrase per line, save it, then run again."
  open -a TextEdit broll-prompts.txt
  pause_before_close
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing project dependencies. This only happens the first time..."
  npm install
  echo ""
fi

echo "Finding B-roll from broll-prompts.txt..."
echo ""
npm run broll:find -- \
  --prompts "$SCRIPT_DIR/broll-prompts.txt" \
  --out-dir "$SCRIPT_DIR/outputs" \
  --scene-library "$SCRIPT_DIR/scene-library" \
  --max-results "$MAX_RESULTS" \
  --max-downloads "$MAX_DOWNLOADS" \
  --max-duration-seconds "$MAX_DURATION_SECONDS"

echo ""
echo "Done. Opening output folder..."
open "$SCRIPT_DIR/outputs"
pause_before_close
