#!/usr/bin/env bash
# Sifaka Radio r3 bootstrap. Downloads the packaged app directly from GitHub.
set -Eeuo pipefail
RAW_BASE="https://raw.githubusercontent.com/CraigTheSpaceBum/SIFAKA.LIVE/sifaka-radio-distribution/sifaka-radio-dist"
ARCHIVE_NAME="sifaka-radio-pi5-fixed-r3.zip"
PART_COUNT=12
ARCHIVE_SHA256="6e1630f72b7ce806ca16836445bf2dd45092558a3c4bbb0e16e005e809dbb769"

ensure_tools() {
  local missing=() tool
  for tool in curl unzip base64 sha256sum python3; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  if (("${#missing[@]}")); then
    if ! command -v apt-get >/dev/null 2>&1; then
      echo "Missing commands: ${missing[*]}. Install them and rerun." >&2; exit 1
    fi
    if [[ $EUID -eq 0 ]]; then
      apt-get update; apt-get install -y curl unzip coreutils python3
    elif command -v sudo >/dev/null 2>&1; then
      sudo apt-get update; sudo apt-get install -y curl unzip coreutils python3
    else
      echo "Missing ${missing[*]}; install them with apt and rerun." >&2; exit 1
    fi
  fi
}
ensure_tools
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sifaka-radio-github.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
BASE64_FILE="$TMP_DIR/package.b64"
ARCHIVE_FILE="$TMP_DIR/$ARCHIVE_NAME"
: > "$BASE64_FILE"
printf 'Fetching Sifaka Radio %s directly from GitHub…\n' "$ARCHIVE_NAME"
for ((i=0; i<PART_COUNT; i++)); do
  part="$(printf '%02d' "$i")"
  curl --fail --location --silent --show-error --retry 3 --connect-timeout 15 --max-time 120 \
    "$RAW_BASE/$ARCHIVE_NAME.b64.$part" -o "$TMP_DIR/part.$part"
  tr -d '\r\n' < "$TMP_DIR/part.$part" >> "$BASE64_FILE"
done
base64 --decode "$BASE64_FILE" > "$ARCHIVE_FILE"
printf '%s  %s\n' "$ARCHIVE_SHA256" "$ARCHIVE_FILE" | sha256sum --check --status || {
  echo "GitHub package checksum failed; no application files were changed." >&2; exit 2
}
unzip -tq "$ARCHIVE_FILE"
mkdir -p "$TMP_DIR/extracted"
unzip -q "$ARCHIVE_FILE" -d "$TMP_DIR/extracted"
PACKAGE_DIR="$TMP_DIR/extracted/sifaka-radio"
if [[ ! -f "$PACKAGE_DIR/server.py" || ! -f "$PACKAGE_DIR/radio.py" || ! -f "$PACKAGE_DIR/update.sh" ]]; then
  echo "The GitHub package is missing required Sifaka Radio files." >&2; exit 3
fi
EXISTING_INSTALL="$(python3 - "$HOME" <<'PY_DISCOVER'
from pathlib import Path
import shlex, subprocess, sys
home = Path(sys.argv[1]).expanduser()
candidates = [home / ".local/share/applications/sifaka-radio.desktop", home / "Desktop/Sifaka Radio.desktop"]
try:
    proc = subprocess.run(["xdg-user-dir", "DESKTOP"], capture_output=True, text=True, timeout=2)
    if proc.returncode == 0 and proc.stdout.strip():
        candidates.insert(1, Path(proc.stdout.strip()) / "Sifaka Radio.desktop")
except (OSError, subprocess.SubprocessError):
    pass
for entry in candidates:
    try: lines = entry.read_text(encoding="utf-8").splitlines()
    except OSError: continue
    for line in lines:
        if not line.startswith("Exec="): continue
        try: tokens = shlex.split(line.split("=", 1)[1])
        except ValueError: continue
        for token in tokens:
            if token.endswith("launch-desktop.sh"):
                folder = Path(token).expanduser().resolve().parent
                if (folder / "server.py").is_file() and (folder / "radio.py").is_file():
                    print(folder); raise SystemExit(0)
fallback = home / "sifaka-radio"
print(fallback if (fallback / "server.py").is_file() else "")
PY_DISCOVER
)"
if [[ -n "$EXISTING_INSTALL" && -x "$EXISTING_INSTALL/.venv/bin/python" ]]; then
  echo "Updating existing installation: $EXISTING_INSTALL"
  bash "$PACKAGE_DIR/update.sh"
else
  TARGET_DIR="$HOME/sifaka-radio"
  if [[ -n "$EXISTING_INSTALL" ]]; then TARGET_DIR="$EXISTING_INSTALL"; echo "Repairing app environment at: $TARGET_DIR"
  else echo "Installing Sifaka Radio to: $TARGET_DIR"; fi
  mkdir -p "$TARGET_DIR"
  cp -a "$PACKAGE_DIR/." "$TARGET_DIR/"
  chmod +x "$TARGET_DIR/install.sh" "$TARGET_DIR/run.sh" "$TARGET_DIR/launch-desktop.sh" "$TARGET_DIR/install-desktop-shortcut.sh" "$TARGET_DIR/update.sh" "$TARGET_DIR/install-from-github.sh"
  bash "$TARGET_DIR/install.sh"
  bash "$TARGET_DIR/launch-desktop.sh"
fi
printf '\nSifaka Radio r3 installation/update finished. Saved settings, music, logs and the installed virtual environment are preserved during updates.\n'
