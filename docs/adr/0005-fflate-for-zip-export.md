# fflate for streaming the Bundle zip

A Bundle (Export) is a zip that must stream, because it can hold many Originals and building it in memory would not scale on a small server. We use `fflate`, a small library with no dependencies of its own whose `Zip` class writes entries as chunks arrive, so Originals go from disk to the response a piece at a time.

The alternative was a minimal zip writer on `node:zlib`: no new dependency, but we would own CRC-32, data descriptors and ZIP64 limits for a format that is not part of what makes this app useful. We did not think that was worth it.

## Status

Accepted (2026-10-12). Pinned to an exact version in `package.json`, like the other dependencies.
