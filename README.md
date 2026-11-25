<p align="center"><img src="https://raw.githubusercontent.com/webship/plane-steps/2.0.x/assets/logo.svg" alt="Plane logo" width="96"></p>

# plane-steps

[![Test](https://github.com/webship/plane-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/plane-steps/actions/workflows/test.yml)

Cucumber step definitions for testing Plane, the open-source project and work management software (its Community
Edition), with [webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on
Playwright and Cucumber-js. The pack covers what a project's work goes through:

- **logging in and out**: an account of the users registry by its handle, the two-step login form (the address, then
  the password), a refused login, who the session is, logging out;
- **a project**: opened by its identifier or its name, and refused to an account with no membership;
- **the work item list** of a project, and **one work item**: its state, a comment, its assignee, each through its own
  control, and who last edited it;
- **a new work item** made through the form;
- **the cycles**: what a cycle holds, and the cycles page;
- **what an account may not do**: a Guest's state and new work items, and the work items it did not create.

The steps make and remove their test content through the site's own API, as a managing account (an Admin) signed in
the way the screens sign in: a work item a scenario makes goes after it, so a run leaves the site as it found it.

No step phrase names the platform: a scenario reads `When I set the state of the work item to "In Progress"` and
`Then the cycle should list the work item "…"`.

CI builds a real Plane site with [DDEV](https://ddev.com) on the runner (Plane's all-in-one image of the Community
Edition on the project's own PostgreSQL, with Valkey, RabbitMQ and an S3 store, the accounts of the suite, the sample
content), runs the whole suite against it twice on every push and pull request, checks after each run that the site
holds what it held before, then runs the assertions that must fail; see [The test site](#the-test-site) and
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## Logging in first

Every scenario starts by logging in, so these are the steps to know first:

| Step | What it does |
| --- | --- |
| `Given I am a logged in user with the "member" user` | Logs in as an account of the users registry, by its handle. The first time in a run through the login form, then its session is put back |
| `When I log in with the "member" user` | Fills and submits the login form with the account's address and password, and asserts nothing: for scenarios about the login itself |
| `When I log in as "member@example.com" with the password "wrong"` | The same with an address and a password as typed |
| `Given I am not logged in` | The browser forgets its session |
| `When I log out` | Logs out through the account menu (Sign out), and waits until the session is a visitor's |
| `Then I should be logged in as "member"` | The session is the account's: the display name the site shows, its address, or its whole name ("Member Test") |
| `Then I should not be logged in` | The session is a visitor's |
| `Then the login should be refused with "Authentication failed"` | The login form refused the last login with that message (give the scenario `@js-off`: the browser logs the refused request) |

```gherkin
Scenario: An account logs in through the form and out again
  Given I am not logged in
  When I log in with the "member" user
  Then I should be logged in as "member"
  When I log out
  Then I should not be logged in
```

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, python3, Node.js 24 or later with npm, and about 4 GB
of free memory for Plane. Plane and its services run in DDEV's containers.

**1. The site.** The pack's own build script (the one CI runs) makes the site in a DDEV project: Plane's all-in-one
image (`makeplane/plane-aio-community:v1.5.1`, `RELEASE` for another release) on PostgreSQL 15, with Valkey, RabbitMQ
and MinIO, its instance set up (sign-ups closed, logins by address and password), the four accounts of
[Test users](#test-users), and the sample content (see [The test site](#the-test-site)). It takes a few minutes once
the images are pulled (about 800 MB).

```bash
git clone https://github.com/webship/plane-steps.git
SITE_DIR="$PWD/plane-site" plane-steps/.github/scripts/build-ddev-site.sh
```

The site answers at `https://planesteps.ddev.site`. In the [Webship Workspace](https://github.com/webship/workspace),
its Plane plugin builds the same site in a sites folder, on DDEV, and wires this pack into the testing setup of the
site:

```bash
bash core/scripts/plugins.sh --require plane --with-needs
bash core/scripts/plugins.sh --activate plane --with-needs
bash core/scripts/plugins.sh --install plane
bash dev/cmd-plane-project.sh plsite --install --add-users --sample-content
bash dev/cmd-tools-testing.sh plsite --run
```

**2. A test project.**

```bash
mkdir plane-tests && cd plane-tests
npm init -y
npm install --save-dev webship-js @webship-js/plane-steps
npx init-webship-js
```

**3. `cucumber.js`.** Add the pack's step definitions after webship-js's own, and give the world its parameters:

```javascript
require: [
  'node_modules/webship-js/tests/step-definitions/**/*.js',
  'node_modules/@webship-js/plane-steps/tests/step-definitions/**/*.js',
],
tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
worldParameters: {
  launchUrl: process.env.LAUNCH_URL || 'https://planesteps.ddev.site',
  // The account that makes and removes test content through the site's API: an Admin of the projects used.
  manager: process.env.MANAGER || 'owner',
  // The workspace the projects are in (its slug), and the project a step works in when it names none (its identifier).
  workspace: process.env.WORKSPACE || 'webship',
  project: process.env.PROJECT || 'WEB',
  // Plane logs in with the address (username), and shows the display name (name).
  users: {
    owner: { username: process.env.PLANE_OWNER_USER || 'owner@example.com', password: process.env.PLANE_OWNER_PASSWORD, name: 'owner' },
    member: { username: process.env.PLANE_MEMBER_USER || 'member@example.com', password: process.env.PLANE_MEMBER_PASSWORD, name: 'member' },
    reader: { username: process.env.PLANE_READER_USER || 'reader@example.com', password: process.env.PLANE_READER_PASSWORD, name: 'reader' },
    stranger: { username: process.env.PLANE_STRANGER_USER || 'stranger@example.com', password: process.env.PLANE_STRANGER_PASSWORD, name: 'stranger' },
  },
  // … webship-js's own parameters (minWaitTime, screenshot, javascript …)
},
```

This repository's own [`cucumber.js`](cucumber.js) is a whole example.

**4. Run.**

```bash
npx cucumber-js                                      # every feature
npx cucumber-js tests/features/work-items.feature    # one feature
CUCUMBER_TAGS=@cycles npx cucumber-js                # one tag
```

## Steps

### Projects

| Step | What it does |
| --- | --- |
| `When I open the project "WEB"` | Opens the project, by its identifier or its name ("Webship site"): its work items, the page the site opens a project on |
| `Then I should be refused the project "WEB"` | The session may not open it: the site says the workspace is not found, or that the project is not open to it (`@js-off`) |

### Test content

| Step | What it does |
| --- | --- |
| `Given there is a work item "Webship test …" in the project "WEB"` | Makes it through the site's API as the managing account (one of the title left by a stopped run goes first). It goes after the scenario |
| `Given there is no work item "Webship test …" in the project "WEB"` | Removes any of the title |

The project part is optional in both: the last project the scenario used, else `worldParameters.project`.

### The work item list

| Step | What it does |
| --- | --- |
| `Then the work item list should show "…"` / `should not show "…"` | A row of the title is (not) in the list on screen |
| `When I create a work item "Webship test …" in the project "WEB"` | Through the form of the list ("Add work item"), created. It goes after the scenario |

### One work item

| Step | What it does |
| --- | --- |
| `When I open the work item "…"` | Opens it by its title, or by its id ("WEB-1") |
| `When I set the state of the work item to "In Progress"` | Through its state control and the list it opens |
| `Then the state of the work item should be "In Progress"` | The state it shows |
| `When I add the comment "…" to the work item` | Through its comment editor and its Comment button, and waits until it shows the comment |
| `Then the work item should show the comment "…"` (`… by "member"`) | It shows the comment, written by that account when one is named |
| `When I assign the work item to "owner"` | Through its assignees control: an Admin or a Member of the project, by the name the site shows |
| `Then the work item should be assigned to "owner"` | That account is among its assignees |
| `Then the work item should be last edited by "owner"` | "Last edited by …" under its description: the last account that changed its title or description, else the one that made it |

### What an account may not do

| Step | What it does |
| --- | --- |
| `Then I should not be able to change the state of the work item` | Its state control is closed (a Guest's) |
| `Then I should not be able to create a work item in the project "WEB"` | The project's list offers no open button for a new work item (a Guest's) |
| `Then I should be refused the work item "WEB-1"` | The site says the account has no access to it (a Guest, on a work item it did not create) (`@js-off`) |

### Cycles

| Step | What it does |
| --- | --- |
| `When I open the cycle "Sprint 1" of the project "WEB"` | The cycle's own page |
| `Then the cycle should list the work item "…"` / `should not list` | What it holds |
| `When I open the cycles of the project "WEB"` | The project's cycles page |
| `Then the cycles should list "Sprint 1"` / `should not list "…"` | The cycles on it |

Every step carries five example phrasings in its JSDoc, and `npm run test:examples` checks that each one matches its
own step only.

## Rules of a suite

- Log in by a handle of the users registry; never write a password into a feature.
- Never create or delete an account in a suite: accounts are configuration, made by the build of the site.
- Change only what the scenario made: a state, a comment and an assignee go on a work item of
  `Given there is a work item "…"`, which goes after the scenario.
- Name test content "Webship test …". A run that was stopped half way leaves its work items; the Workspace's
  `cmd-tools-plane-cli.sh <site> --tidy` deletes them for good (only work items of that title made by the test
  accounts), or delete them as the managing account.
- A refusal (a wrong password, a workspace or a work item an account may not see) makes the browser log the refused
  requests: give those scenarios `@js-off`.
- Plane allows a set number of logins a minute from one address: 10 by default (`AUTHENTICATION_RATE_LIMIT` of the
  site). A suite logs in more often than a person, so the test site allows 100, a setting for a test site only; the
  step that logs in says so when the site refuses for that. The pack signs each account in once a run and puts its
  session back after.
- Plane keeps a removed work item, marked as deleted: it leaves every list and every count the build script prints.

## Test users

The accounts the features log in as, each with the password `dD.123123ddd`:

| Handle | Address | Display name | Role in Webship site |
| --- | --- | --- | --- |
| `owner` | `owner@example.com` | owner | Admin (the managing account) |
| `member` | `member@example.com` | member | Member |
| `reader` | `reader@example.com` | reader | Guest: sees and comments on only the work items it created |
| `stranger` | `stranger@example.com` | stranger | No membership of the workspace |

## The test site

`.github/scripts/build-ddev-site.sh` builds it, and `COUNTS_ONLY=1` makes it print what the sample project holds (work
items, open ones, comments, assignees, labels on work items, work items in cycles, cycles, labels, states, members of
the project and of the workspace, users), leaving out what Plane keeps marked as deleted: CI compares them before and
after each run. The sample content, in the project Webship site (`WEB`) of the workspace `webship`:

- "The greeting script says Helo instead of Hello" (WEB-1): by the owner, In Progress, high, assigned to the member,
  labelled bug, in the cycle "Sprint 1", with the owner's comment;
- "The usage line spells greeting as greting" (WEB-2): by the member, Todo;
- "An issue opened by someone outside the project" (WEB-3): made as the Guest, Todo. A Guest makes no work items in
  the Community Edition 1.5.1: the build script makes it through Django to stand for a request from outside the
  project, as Plane's Intake would bring one.

The features read them and never change them. The site script (`site/plane-site.py`, run with Django's own shell in
Plane's container) and the start of Plane's container (`site/plane-start.sh`) are the ones of the Webship Workspace's
Plane plugin.

## The assertions that must fail

`tests/must-fail/` holds scenarios that assert something that is not true on the test site; `npm run test:must-fail`
runs them and checks that each fails at its last step with the message its description announces, and a hint. A step
that cannot fail proves nothing.

## Logo

The logo is Plane's, as [Simple Icons](https://simpleicons.org) 16.37.0 ships it (`plane.svg`), in the colour the set
lists for it (#121212). Simple Icons gives its icons under CC0 1.0 and lists no other licence for this one; its source
is https://plane.so/brand-logos/logo-with-wordmark.svg. It names the platform the pack tests.

## License

MIT (see `LICENSE`). Plane itself is AGPL-3.0: the pack drives a running site and carries none of its code.
