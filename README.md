# OBD Garage

OBD Garage is a self-hosted web app for your phone. It shows the files that an OBDLink adapter exports:
**Diagnostic Reports** (HTML) and **drive logs** (CSV). It runs as one Docker container.

The first target is a 2012 Ford F-250 6.7L Power Stroke with a P0401 (EGR flow insufficient) fault. The
design lets it grow to other vehicles and other logged PIDs.

<!-- Screenshot: add one here when the first screens exist. -->

> **Warning: OBD Garage has no built-in login.** Anyone who can reach the app can read and delete your
> data. Run it behind a reverse proxy that does the authentication. Do not publish the app port to the
> internet. See [docs/deployment.md](docs/deployment.md).

## Project state

The project is early. The current state, the decisions and the next steps are in the
[wayfinder map](https://github.com/laszlo462/obd-garage/issues/1). This README does not copy them.

## About this project

This project is vibe-coded. An AI assistant (Claude) writes most of the code and the docs. A human owner
sets the direction and reviews the work. The tests and the CI checks are there to catch mistakes. Read the
code before you trust it with data that matters.

## Quick start

Save this as `compose.yaml`:

```yaml
services:
  obd-garage:
    image: ghcr.io/laszlo462/obd-garage:latest
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./data:/data
    ports:
      - 127.0.0.1:8080:8080
    restart: unless-stopped
```

Then run `docker compose up -d` and open <http://localhost:8080>. The `:develop` tag follows the `main`
branch. The `:latest` tag follows the newest release. No release image exists until the first release.

For a real install, with a reverse proxy and authentication, use the
[deployment guide](docs/deployment.md) and the example in [deploy/](deploy/).

## Development

You need Node 24 (see `.node-version`).

```sh
npm ci
npm run dev        # start the dev loop
npm run typecheck  # tsc --noEmit
npm run lint       # Biome
npm test           # Vitest
npm run build      # build the web client
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request. See [DESIGN.md](DESIGN.md) for the
UI design and [GLOSSARY.md](GLOSSARY.md) for the domain terms.

## Reference

[reference/](reference/) is a frozen copy of the original single-file viewers and the layout prototype. It
is the source to port from. Do not edit it.

## Licence

[MIT](LICENSE)
