# Sifaka Radio — GitHub installer source

This branch hosts the source package used by the one-line Raspberry Pi install/update script.

Run on Raspberry Pi OS Desktop:

```bash
curl -fsSL https://raw.githubusercontent.com/CraigTheSpaceBum/SIFAKA.LIVE/sifaka-radio-source/radio-source/bootstrap.sh | bash
```

The bootstrap fetches the versioned package chunks directly from GitHub, verifies the archive, and then installs the app or updates the path referenced by the existing Sifaka Radio desktop shortcut. It preserves local settings, music, logs and `.venv` during updates. No user-managed ZIP download/extraction is needed.

Package chunks are Base64 text only because the GitHub file API writes UTF-8 content; the bootstrap reconstructs and CRC-validates the ZIP in a temporary directory, then removes it after installation/update. Do not edit package chunk content independently; rebuild all chunks plus `package-manifest.txt` from the same audited package.
