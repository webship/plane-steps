'use strict';

// Session and project step definitions: logging in with the users registry, the two-step login form and its refusal,
// logging out, who the session is, and a project an account may open or is refused.
//
// The other step files: plane-work-items.steps.js (the work item list, one work item, its state, comments and
// assignee, who last edited it, a new work item, a Guest's limits) and plane-cycles.steps.js (a cycle and its work
// items, the cycles of a project).
//
// Steps that webship-js already covers with its generic click, fill and see vocabulary are not duplicated here.
// Every assertion waits on its locator (the assertion is the wait), and every failure is a friendly error with a hint
// instead of a raw Playwright timeout stack.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  exactly,
  tidy,
  open,
  siteUrl,
  waitForValue,
  resolveUser,
  currentAccount,
  currentUser,
  dropSession,
  submitLogin,
  signInAs,
  findProject,
  projectPath,
} = require('./plane-helpers');

// ---------------------------------------------------------------------------
// Logging in (the first steps of the pack), then the rest of the session
// ---------------------------------------------------------------------------

/**
 * Log in with an account of the users registry in cucumber.js (`worldParameters.users`), by its handle, and make sure
 * the session is that account's. An account that is already logged in is kept. The first time in a run the account goes
 * through the login form; after that its session is put back, so switching accounts inside a scenario is quick.
 *
 * Example #1: Given I am a logged in user with the "member" user
 * Example #2: Given I am a logged in user with the "owner" user
 * Example #3: Given we are a logged in user with the "reader" user
 * Example #4: And I am a logged in user with the "stranger" user
 * Example #5: When I am a logged in user with the "member" user
 *
 */
Given(/^(I am|we are) a logged in user with the "([^"]*)" user$/, async function (pronounCase, handle) {
  await signInAs(this, handle);
});

/**
 * Log in through the form with the e-mail address and the password of an account of the users registry, without the
 * checks of "I am a logged in user with the … user": the step to use when the scenario is about the login itself.
 * Follow it with a step that says what should happen.
 *
 * Example #1: When I log in with the "member" user
 * Example #2: When I log in with the "owner" user
 * Example #3: When we log in with the "reader" user
 * Example #4: And I log in with the "stranger" user
 * Example #5: When log in with the "member" user
 *
 */
When(/^(I |we )*log in with the "([^"]*)" user$/, async function (pronounCase, handle) {
  const user = resolveUser(this, handle);
  await dropSession(this);
  await submitLogin(this, user.username, user.password);
});

/**
 * Fill in the login form with an e-mail address and a password as typed in the step, and submit it. It asserts
 * nothing: follow it with a step that says what should happen (logged in, or the login refused). For the accounts of
 * the registry use "I am a logged in user with the … user".
 *
 * Example #1: When I log in as "member@example.com" with the password "not-the-right-password"
 * Example #2: When I log in as "owner@example.com" with the password "wrong"
 * Example #3: When we log in as "reader@example.com" with the password "wrong"
 * Example #4: And I log in as "member@example.com" with the password "wrong-password"
 * Example #5: When I log in as "stranger@example.com" with the password "nope"
 *
 */
When(/^(I |we )*log in as "([^"]*)" with the password "([^"]*)"$/, async function (pronounCase, email, password) {
  await dropSession(this);
  await submitLogin(this, email, password);
});

/**
 * Make sure nobody is logged in: the browser forgets its session. (To end a session through the screens, use
 * "I log out".)
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: And I am not logged in
 * Example #4: When I am not logged in
 * Example #5: Given I am not logged in
 *
 */
Given(/^(I am|we are) not logged in$/, async function (pronounCase) {
  await dropSession(this);
});

/**
 * Log out through the site, the way its account menu does (Sign out), and wait until the session is a visitor's. An
 * account with no workspace has no such menu: the site's own sign-out is asked for instead.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: Then I log out
 * Example #5: When log out
 *
 */
When(/^(I |we )*log out$/, async function (pronounCase) {
  const page = this.page;
  if (!page.url().startsWith(siteUrl(this, '/'))) await open(this, '/');
  const menu = page.locator('button[aria-label="Open user menu"]').first();
  if (await menu.waitFor({ state: 'visible', timeout: budget(this) }).then(() => true).catch(() => false)) {
    await menu.click();
    await page.locator('[role="menuitem"]').filter({ hasText: /^\s*Sign out\s*$/ }).first().click();
  } else {
    const root = siteUrl(this, '');
    const token = await this.context.request.get(siteUrl(this, '/auth/get-csrf-token/'), { ignoreHTTPSErrors: true, failOnStatusCode: false });
    const csrf = String(((await token.json().catch(() => ({}))) || {}).csrf_token || '');
    await this.context.request.post(siteUrl(this, '/auth/sign-out/'), { form: { csrfmiddlewaretoken: csrf }, headers: { Referer: `${root}/`, Origin: root }, ignoreHTTPSErrors: true, maxRedirects: 0, failOnStatusCode: false });
  }
  const result = await waitForValue(() => currentUser(this), (email) => email === '', budget(this));
  if (!result.ok) {
    throw friendly({ message: `Logging out did not end the session: it is still ${result.value}'s.`, hint: 'The site logs out from its account menu (Sign out); a single sign-on provider may keep the session elsewhere.' });
  }
});

/**
 * Assert who the session is: the display name the site shows for the account ("member"), its e-mail address, or its
 * whole name ("Member Test").
 *
 * Example #1: Then I should be logged in as "member"
 * Example #2: Then I should be logged in as "member@example.com"
 * Example #3: Then we should be logged in as "Owner Test"
 * Example #4: And I should be logged in as "reader"
 * Example #5: Then should be logged in as "owner"
 *
 */
Then(/^(I |we )*should be logged in as "([^"]*)"$/, async function (pronounCase, who) {
  const result = await waitForValue(() => currentAccount(this), (me) => !!me && [me.display, me.email, me.full].some((x) => exactly(who).test(x)), budget(this));
  if (!result.ok) {
    const me = result.value;
    throw friendly({
      message: me ? `Expected the session to be "${who}", but it is ${me.display} (${me.email}).` : `Expected the session to be "${who}", but nobody is logged in.`,
      hint: 'Log in first with Given I am a logged in user with the "…" user, or with the login form.',
    });
  }
});

/**
 * Assert that nobody is logged in: the session is a visitor's.
 *
 * Example #1: Then I should not be logged in
 * Example #2: Then we should not be logged in
 * Example #3: And I should not be logged in
 * Example #4: But I should not be logged in
 * Example #5: Then should not be logged in
 *
 */
Then(/^(I |we )*should not be logged in$/, async function (pronounCase) {
  const result = await waitForValue(() => currentUser(this), (email) => email === '', budget(this));
  if (!result.ok) {
    throw friendly({ message: `Expected nobody to be logged in, but the session is ${result.value}'s.`, hint: 'A refused login keeps the visitor\'s session; a login that worked opens the account\'s.' });
  }
});

/**
 * Assert that the login form refused the last login with a message that holds the text (the site's error banner above
 * the form). Give such a scenario @js-off: the browser logs the refused request.
 *
 * Example #1: Then the login should be refused with "Authentication failed"
 * Example #2: Then the login should be refused with "Please try again"
 * Example #3: And the login should be refused with "Authentication failed. Please try again."
 * Example #4: But the login should be refused with "Authentication failed"
 * Example #5: Then the login should be refused with "try again"
 *
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (text) {
  const page = this.page;
  const banner = page.locator('[role="alert"], [class*="error"], [class*="danger"]').filter({ hasText: text }).first();
  try {
    await banner.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    const shown = tidy(await page.locator('[role="alert"]').first().innerText({ timeout: 1000 }).catch(() => ''));
    throw friendly({
      message: `Expected the login to be refused with "${text}", but ${shown ? `the page says "${shown}"` : 'the page shows no error'} (${page.url()}).`,
      hint: 'Use it right after "I log in as … with the password …". A login that worked shows no error.',
    });
  }
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/**
 * Open a project of the workspace, by its identifier ("WEB") or its name ("Webship site"): its work items, the page the
 * site opens a project on.
 *
 * Example #1: When I open the project "WEB"
 * Example #2: When I open the project "Webship site"
 * Example #3: And we open the project "WEB"
 * Example #4: Given I open the project "WEB"
 * Example #5: When open the project "Webship site"
 *
 */
When(/^(I |we )*open the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await findProject(this, which);
  this.plane = Object.assign(this.plane || {}, { project: project.identifier });
  await open(this, projectPath(project));
});

/**
 * Assert that the session may not open a project: the site says the workspace is not found (no membership of it), or
 * that the project is not open to the account. Give such a scenario @js-off: the browser logs the refused requests.
 *
 * Example #1: Then I should be refused the project "WEB"
 * Example #2: Then we should be refused the project "Webship site"
 * Example #3: And I should be refused the project "WEB"
 * Example #4: But I should be refused the project "WEB"
 * Example #5: Then should be refused the project "Webship site"
 *
 */
Then(/^(I |we )*should be refused the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await findProject(this, which);
  await open(this, projectPath(project));
  const refusal = this.page.locator('main, body').getByText(/Workspace not found|not a member of this project|don't have access|lack authorization/i).first();
  try {
    await refusal.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    throw friendly({
      message: `Expected the project ${project.name} to be refused, but the site shows no refusal (${this.page.url()}).`,
      hint: 'A member of the project (an Admin, a Member or a Guest) may open it; log in as an account with no membership of the workspace.',
    });
  }
});
