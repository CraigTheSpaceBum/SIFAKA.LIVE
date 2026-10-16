# Sifaka Radio distribution branch

This branch contains a versioned, checksum-verified Sifaka Radio Raspberry Pi package and a bootstrap script.

Run on Raspberry Pi OS or a Debian-based Pi installation:

```bash
curl -fsSL https://raw.githubusercontent.com/CraigTheSpaceBum/SIFAKA.LIVE/sifaka-radio-distribution/sifaka-radio-dist/install-from-github.sh | bash
```

The distribution lives only on `sifaka-radio-distribution`; it is not merged into or deployed from the live website's `main` branch. The package is reconstructed from base64 text chunks, checked against the published SHA-256 hash, and tested before the installer modifies the application directory. Settings in `~/.config/sifaka-radio/`, music in `~/Music`, logs/state in `~/.local/state/sifaka-radio/`, and the existing `.venv` are preserved on updates.
