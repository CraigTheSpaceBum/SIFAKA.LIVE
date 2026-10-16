#!/usr/bin/env bash
# Sifaka Radio GitHub bootstrap: installs once or safely updates the existing install.
set -Eeuo pipefail

ROOT="https://raw.githubusercontent.com/CraigTheSpaceBum/SIFAKA.LIVE/sifaka-radio-source/radio-source"
for tool in curl base64 python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Sifaka Radio bootstrap requires $tool." >&2; exit 1; }
done

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sifaka-radio-github.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Fetching Sifaka Radio directly from GitHub..."
curl --fail --silent --show-error --location "$ROOT/package-manifest.txt" -o "$WORK_DIR/package-manifest.txt"
while IFS= read -r part; do
  [[ "$part" =~ ^package-[0-9]{2}\.b64$ ]] || { echo "Invalid package manifest entry: $part" >&2; exit 2; }
  curl --fail --silent --show-error --location "$ROOT/$part" -o "$WORK_DIR/$part"
done < "$WORK_DIR/package-manifest.txt"

# Decode and validate the source archive before extracting anything.
cat "$WORK_DIR"/package-*.b64 | base64 --decode > "$WORK_DIR/package.zip"
python3 - "$WORK_DIR/package.zip" "$WORK_DIR/unpacked" <<'PY_VALIDATE'
from pathlib import Path
import sys, zipfile
archive = Path(sys.argv[1])
destination = Path(sys.argv[2])
with zipfile.ZipFile(archive) as package:
    bad = package.testzip()
    if bad:
        raise SystemExit(f"Source archive failed CRC validation: {bad}")
    members = package.infolist()
    for member in members:
        name = Path(member.filename)
        if name.is_absolute() or ".." in name.parts:
            raise SystemExit(f"Unsafe archive path rejected: {member.filename}")
    if not any(m.filename.endswith("/server.py") for m in members):
        raise SystemExit("Downloaded package is missing server.py")
    package.extractall(destination)
PY_VALIDATE
SOURCE_DIR="$WORK_DIR/unpacked/sifaka-radio"
[[ -f "$SOURCE_DIR/server.py" && -f "$SOURCE_DIR/update.sh" && -f "$SOURCE_DIR/install.sh" ]] || {
  echo "The downloaded Sifaka Radio package is incomplete." >&2; exit 3;
}

# Detect the current application folder from the desktop entry, including paths with spaces.
TARGET_DIR="$(python3 - "$HOME" <<'PY_DISCOVER'
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
    try:
        lines = entry.read_text(encoding="utf-8").splitlines()
    except OSError:
        continue
    for line in lines:
        if not line.startswith("Exec="):
            continue
        try:
            tokens = shlex.split(line.split("=", 1)[1])
        except ValueError:
            continue
        for token in tokens:
            if token.endswith("launch-desktop.sh"):
                folder = Path(token).expanduser().resolve().parent
                if (folder / "server.py").is_file() and (folder / "radio.py").is_file():
                    print(folder)
                    raise SystemExit(0)
fallback = home / "sifaka-radio"
print(fallback if (fallback / "server.py").is_file() else "")
PY_DISCOVER
)"

if [[ -n "$TARGET_DIR" && -f "$TARGET_DIR/server.py" && -x "$TARGET_DIR/.venv/bin/python" ]]; then
  echo "Existing installation detected: $TARGET_DIR"
  SIFAKA_UPDATE_SOURCE_MODE=bundle bash "$SOURCE_DIR/update.sh"
else
  if [[ -z "$TARGET_DIR" ]]; then TARGET_DIR="$HOME/sifaka-radio"; fi
  echo "Installing Sifaka Radio to: $TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  cp -a "$SOURCE_DIR/." "$TARGET_DIR/"
  chmod +x "$TARGET_DIR/install.sh" "$TARGET_DIR/run.sh" "$TARGET_DIR/launch-desktop.sh" "$TARGET_DIR/install-desktop-shortcut.sh" "$TARGET_DIR/update.sh"
  (cd "$TARGET_DIR" && ./install.sh)
  echo "Sifaka Radio was installed. Open the desktop icon; the dashboard starts OFFLINE."
fi
