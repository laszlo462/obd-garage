# Deploy OBD Garage

This page tells you how to run OBD Garage on your own server. OBD Garage is one Docker container. It
keeps all its data in one volume, `/data`.

> **Warning: OBD Garage has no login.** Anyone who can reach the app can read and delete your data.
> Put the app behind a reverse proxy that does the authentication. Do not publish the app port to the
> internet.

## What you need

- A server with Docker and Docker Compose.
- A reverse proxy with HTTPS. This page uses [SWAG](https://docs.linuxserver.io/general/swag/) as the
  example.
- An authentication layer in front of the proxy or in the proxy. This page uses Cloudflare Access as the
  example.
- A domain name. iOS needs HTTPS to add the app to the home screen.

## Install

1. Copy [`deploy/compose.yaml`](../deploy/compose.yaml) to a new folder on your server.
2. Set `PUID` and `PGID` to the user and group that must own the data files. Use `id <user>` on the host
   to get the two numbers.
3. Put the container on the same Docker network as your reverse proxy. Remove the comment marks from the
   `networks` lines and change `proxy` to the name of your network.
4. Start the container: `docker compose up -d`.
5. Set up the reverse proxy. See [Reverse proxy](#reverse-proxy).
6. Set up the authentication. See [Access](#access).
7. Open the app in Safari on your phone. Tap **Share**, then **Add to Home Screen**.

## Settings

All settings are environment variables. All of them are optional.

| Variable   | Default | Purpose                                                            |
| ---------- | ------- | ------------------------------------------------------------------ |
| `PUID`     | `1000`  | The user ID that the app runs as. This user owns the files in `/data`. |
| `PGID`     | `1000`  | The group ID that the app runs as.                                  |
| `PORT`     | `8080`  | The port that the app listens on in the container.                  |
| `DATA_DIR` | `/data` | The data root in the container.                                     |

The container starts as root. It makes `/data` writable for `PUID` and `PGID`, then runs the app as that
user. The app does not run as root.

The app does not need a time zone setting. It shows each recorded time as the local time that the OBDLink
app wrote in the file.

## Reverse proxy

The app speaks plain HTTP on port `8080`. The reverse proxy adds HTTPS.

The proxy must accept a request body of 25 MB or more. The app accepts files up to 25 MB. A smaller proxy
limit stops large uploads before they get to the app.

### SWAG

1. Copy [`deploy/swag/obd-garage.subdomain.conf`](../deploy/swag/obd-garage.subdomain.conf) to
   `/config/nginx/proxy-confs/` in your SWAG volume.
2. Make sure that the container name is `obd-garage`. If you change the name, change `server_name` and
   `$upstream_app` in the file.
3. Add a DNS record for the `obd-garage` subdomain that points to SWAG.
4. Restart SWAG: `docker restart swag`.

The example keeps SWAG's `client_max_body_size 0` (no limit). If you set a limit, make it `25m` or more.

### Other proxies

Any HTTPS reverse proxy works. Send all paths to `http://<container>:8080` and set the body limit to
25 MB or more.

## Access

The app has no users, passwords or sessions. The layer in front of the app decides who gets in. Every
person who gets past that layer has full access to the data.

### Cloudflare Access

This example uses a DNS record that Cloudflare proxies to SWAG.

1. In the Cloudflare dashboard, set the `obd-garage` DNS record to **Proxied**.
2. In Cloudflare Zero Trust, go to **Access** > **Applications**. Add a **Self-hosted** application.
3. Set the application domain to the full hostname of the app. An application that covers all your
   subdomains with a wildcard also works.
4. Add a policy with the action **Allow**. Include only your own email address or identity.
5. Open the app in a browser. Make sure that Cloudflare asks you to sign in.

Cloudflare accepts uploads up to 100 MB on the Free and Pro plans. That is more than the 25 MB that the app
needs.

If the iOS home-screen app asks you to sign in again, sign in there once. Set a long **Session Duration**
on the application to sign in less frequently.

Cloudflare Access protects only the traffic that goes through Cloudflare. Make sure that nobody can get to
SWAG or the app port directly from the internet.

## Data and backup

All data is in `/data`:

- `/data/originals/` holds every uploaded file, unchanged. These files are the **Originals**.
- The SQLite database holds the index, the derived data and your own data: Vehicles, assignments,
  Reference Report choices and Notes.
- `/data/tmp/` holds uploads that are not complete. The app cleans it at startup.

The app can rebuild the derived data from the Originals. It cannot rebuild your own data. Back up all of
`/data` together, the Originals and the database.

To make a consistent backup:

1. Stop the container: `docker compose stop`.
2. Copy all of the `data` folder.
3. Start the container: `docker compose start`.

Do not change, add or delete files in `/data/originals` by hand. Treat the folder as read-only:

- The app ignores files that you put there by hand.
- The app checks each Original against its stored hash. A changed or missing file becomes a Failed Upload.
- To remove a file, delete it in the app.

## Update

1. Get the new image: `docker compose pull`.
2. Start the new container: `docker compose up -d`.

After an update, the app rebuilds the derived data in the background. Your Originals and your own data
stay the same.
