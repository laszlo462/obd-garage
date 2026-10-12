# Security policy

## No built-in authentication

OBD Garage has no login. Anyone who can reach the app can read and delete all data. This is a design
decision, not a bug. Run the app behind a reverse proxy that does the authentication, and do not publish
the app port to the internet. See [docs/deployment.md](docs/deployment.md).

Do not report "the app has no login" as a vulnerability.

## Report a vulnerability

Use GitHub private vulnerability reporting. Open the **Security** tab of this repository and select
**Report a vulnerability**. Do not open a public issue for a vulnerability.

Include the steps to reproduce the problem and the version or image tag. Do not attach a real OBDLink
export. It contains the VIN.

Only the latest release and the `:develop` image get fixes.
