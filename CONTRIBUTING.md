# Contributing

Thanks for wanting to help. RaptorTracker is a small self-hosted app with one maintainer, so the
best contributions are focused: a bug fix with a test, a correction to reference data with its
source, or a feature that was discussed in an issue first.

## Before you start

- **Bugs:** open an issue with the bug template. The version (shown in the footer of every page)
  and how you installed it (Docker, `install.sh`, or from source) save a lot of back-and-forth.
- **Features:** open an issue describing the problem before writing code, so we can agree on the
  shape of it.
- **Reference data** (AUX layouts, fuse ratings, fluid capacities, engine specs): cite the source.
  Ford owner's manuals and Ford's media site are preferred. Forum posts are fine as a lead but not
  as the source.
- **Security problems:** don't open an issue; see [SECURITY.md](SECURITY.md).

## Setting up

You need Node.js 22.12 or newer (24 recommended) on a 64-bit system.

```bash
git clone https://github.com/breed007/RaptorTracker.git
cd RaptorTracker
npm install
npm install --prefix client
cp .env.example .env          # set SESSION_SECRET and ADMIN_PASSWORD
npm run db:init
npm run dev                   # API on :3000, Vite dev server on :5173
```

`npm install` doesn't run install scripts (see `.npmrc`): SQLite and bcrypt load prebuilt
binaries, so no compiler is needed.

## Tests

Run all of them before opening a pull request. Each uses a throwaway database and never touches
`data/`.

```bash
npm test                 # schema, migrations, reference data, accessibility basics in the JSX
npm run test:api         # boots the app and exercises the routes over HTTP
npm run test:upgrade     # rebuilds every released version's database and migrates it forward
npm run test:security    # path traversal, hostile archives, unauthenticated access
npx playwright install chromium   # once
npm run test:e2e         # the built app in a real browser, including an accessibility scan
```

CI runs the first four on Node 22 and 24, on x64 and arm64 (the same architecture as a Raspberry
Pi), plus the browser tests and a Docker build for both architectures.

A change that touches the database needs a migration in `server/db/index.js` that's safe to run
twice, and the upgrade test has to keep passing. A new column that holds a distance, volume, or
pressure goes into `COLUMNS` in `server/services/units.js`; the smoke test fails if it's missing.

## Conventions

- **US English** in code, comments, UI text, and docs (color, behavior, canceled). Leave other
  people's spellings alone in names you don't own, like an API's field names.
- **Accessible by default:** every input has a label tied to it (`htmlFor` and `id`), icon-only
  buttons have an `aria-label`, and modals use the `Dialog` component. The smoke test and the
  browser tests check for these.
- **Units:** format numbers shown to the owner through `useUnits()` or `currentUnits()` in
  `client/src/lib/units.js`, never with a hard-coded "mi", "gal", or "$".
- **Commit messages** in the imperative ("Fix fuel economy after partial fills"), with a body that
  explains why when it isn't obvious.
- **No secrets** in commits: `.env` files, keys, and real credentials stay out of the repo.

## Pull requests

Keep each one to a single change, describe what it fixes and how you tested it, and include
screenshots for anything visible. By submitting a pull request you agree that your contribution is
licensed under the project's [MIT license](LICENSE).
