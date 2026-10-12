# Contributing

Thank you for your interest. Read [GLOSSARY.md](GLOSSARY.md) first. It defines the words this project
uses. [CLAUDE.md](CLAUDE.md) has the rules for the code.

## Set up

1. Install Node 24 (see `.node-version`).
2. Run `npm ci`.
   - On Windows without the Visual Studio C++ build tools, run `npm ci --ignore-scripts` instead.
     `better-sqlite3` ships a prebuilt Windows binary, but npm still tries to compile it from source,
     and a failed compile aborts the install. Skipping install scripts makes it use the prebuilt binary.
3. Run `npm run dev` to start the dev loop.

## Checks

Run these before you open a pull request. CI runs the same checks.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Pull requests

- Open a pull request against `main`. Merges are squash-only.
- The **PR title** must be a Conventional Commit title: `type: description` or `type(scope): description`.
  Use one of these types: `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `build`, `ci`, `test`,
  `chore`, `revert`. A check rejects other titles.
- Use `feat` or `fix` for a change that users can see, including UI changes. `style` means formatting only.
- The squash commit gets the PR title and the PR description. To mark a breaking change, put a line that
  starts with `BREAKING CHANGE:` in the PR description.
- Release notes and version numbers come from these titles. release-please makes the releases.

## Test data

OBDLink reports and logs contain the vehicle identification number (VIN). **Scrub the VIN before you
commit a fixture.** Also remove any other personal data, such as locations. Put scrubbed fixtures in
`test/fixtures/`. Never put real exports in a commit, an issue or a pull request.

Use the scrub script to make a fixture from a real export:

```sh
node scripts/scrub-fixture.ts --out test/fixtures/<name> [--deny "word,word"] <export files>...
```

It fakes the VIN serial in a Diagnostic Report, checks a Drive Log for a VIN, and removes free text
(`note`, `subtitle`, `text`) from annotation JSON. `--deny` lists words, such as a place name, that
must not appear in any output. Give them on the command line only; never store them in the repo.
If anything fails, the script writes nothing. Run it with `--help` for details. Check the output by
eye before you commit it. Do not name a fixtures folder `data`: `.gitignore` ignores that name.

## Code layout

`src/core` must not import from `src/profiles` or `src/rule-packs`. A test enforces this. Put
vehicle-specific logic in a Vehicle Profile or a Rule Pack.
