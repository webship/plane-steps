'use strict';

// Work item step definitions: the test content a scenario makes and removes (through the site's own API, as the
// managing account), the work item list, one work item and what a person changes on it (its state, a comment, its
// assignee), who last edited it, a new work item made through the form, and what a Guest may not do.
//
// What a scenario makes goes after it: the work items a Given step made and the ones a scenario created through the
// form are removed as the managing account, so a run leaves the site as it found it (the site keeps a removed work item
// marked as deleted, out of every list). Name test content "Webship test …": `cmd-tools-plane-cli.sh <site> --tidy`
// removes what a stopped run left.

const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');
const { smartSettle, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  exactly,
  escapeRegExp,
  tidy,
  open,
  actOrExplain,
  assertPresence,
  waitForValue,
  workspaceSlug,
  findProject,
  projectPath,
  findWorkItems,
  workItemNamed,
  remember,
  removeWorkItem,
  makeWorkItem,
  managerContexts,
} = require('./plane-helpers');

/** The project a step names, else the last one a scenario used, else the one of cucumber.js. */
async function projectOf(world, which) {
  const project = await findProject(world, which || (world.plane && world.plane.project));
  world.plane = Object.assign(world.plane || {}, { project: project.identifier });
  return project;
}

/** A control of the work item on screen, by the name the site gives it for tests (its state, its assignees…). */
function property(world, name) {
  return world.page.locator(`[data-testid="work-item-${name}-select"]`).first();
}

/** The work item on screen: its control of the state must be there, or the step says where the page is. */
async function onWorkItem(world) {
  const state = property(world, 'state');
  try {
    await state.waitFor({ state: 'visible', timeout: budget(world) });
  } catch {
    throw friendly({ message: `There is no work item on screen (${world.page.url()}).`, hint: 'Open it first with When I open the work item "…".' });
  }
  return state;
}

/** What a control of the work item says to a screen reader: "State, In Progress", "Assignees, member (You), owner". */
async function labelOf(locator) {
  return String((await locator.getAttribute('aria-label').catch(() => '')) || '');
}

/** The names a control of the work item lists after its kind ("Assignees, member (You), owner" → member, owner). */
function namesIn(label) {
  const at = label.indexOf(',');
  if (at < 0) return [];
  return label.slice(at + 1).split(',').map((s) => tidy(s.replace(/\(You\)/, ''))).filter(Boolean);
}

/** The rows of the work item list (or of a cycle) on screen whose title holds the text. */
function rowsOf(world, title) {
  return world.page.locator('a[href*="/browse/"]').filter({ hasText: title });
}

/** Wait until the list on screen has drawn its rows (or said it has none), so an absence means something. */
async function listDrawn(world) {
  await world.page.locator('a[href*="/browse/"], [data-testid="empty-state"]').first().waitFor({ state: 'attached', timeout: budget(world) }).catch(() => {});
  await smartSettle(world.page, 1000);
}

// ---------------------------------------------------------------------------
// Test content, as the managing account
// ---------------------------------------------------------------------------

/**
 * Make a work item through the site's own API, as the managing account (`worldParameters.manager`): the project's
 * default state, a line of text. A work item of that title left by a stopped run goes first. It goes after the
 * scenario. The project part is optional: the last project the scenario used, else the one of cucumber.js.
 *
 * Example #1: Given there is a work item "Webship test work" in the project "WEB"
 * Example #2: Given there is a work item "Webship test comment"
 * Example #3: And there is a work item "Webship test state" in the project "Webship site"
 * Example #4: Given there is a work item "Webship test assignee" in the project "WEB"
 * Example #5: Given there is a work item "Webship test list"
 *
 */
Given(/^there is a work item "([^"]*)"(?: in the project "([^"]*)")?$/, async function (title, which) {
  const project = await projectOf(this, which);
  for (const old of await findWorkItems(this, project, title)) await removeWorkItem(this, project, old.id);
  await makeWorkItem(this, project, title);
});

/**
 * Make sure a project holds no work item of that title: any is removed, as the managing account.
 *
 * Example #1: Given there is no work item "Webship test new" in the project "WEB"
 * Example #2: Given there is no work item "Webship test new"
 * Example #3: And there is no work item "Webship test form" in the project "Webship site"
 * Example #4: Given there is no work item "Webship test made" in the project "WEB"
 * Example #5: Given there is no work item "Webship test other"
 *
 */
Given(/^there is no work item "([^"]*)"(?: in the project "([^"]*)")?$/, async function (title, which) {
  const project = await projectOf(this, which);
  for (const old of await findWorkItems(this, project, title)) await removeWorkItem(this, project, old.id);
});

// ---------------------------------------------------------------------------
// The work item list
// ---------------------------------------------------------------------------

/**
 * Assert that the work item list on screen shows (or does not show) a work item whose title holds the text.
 *
 * Example #1: Then the work item list should show "The greeting script says Helo instead of Hello"
 * Example #2: Then the work item list should not show "The greeting script says Helo instead of Hello"
 * Example #3: And the work item list should show "Webship test list"
 * Example #4: But the work item list should not show "Webship test gone"
 * Example #5: Then the work item list should show "An issue opened by someone outside the project"
 *
 */
Then(/^the work item list should (not )?show "([^"]*)"$/, async function (notCase, title) {
  await listDrawn(this);
  await assertPresence(rowsOf(this, title), notCase, {
    label: `the work item "${title}" in the list`,
    timeout: budget(this),
    hint: notCase ? 'A Guest sees only the work items it created; a removed work item leaves every list.' : 'Open the project first (When I open the project "…"); a Guest sees only the work items it created.',
  });
});

/**
 * Create a work item through the form of the project's list ("Add work item"), as the account logged in: its title,
 * the project's default state. It goes after the scenario.
 *
 * Example #1: When I create a work item "Webship test new" in the project "WEB"
 * Example #2: When I create a work item "Webship test form"
 * Example #3: And we create a work item "Webship test made" in the project "Webship site"
 * Example #4: When I create a work item "Webship test other" in the project "WEB"
 * Example #5: When create a work item "Webship test new"
 *
 */
When(/^(I |we )*create a work item "([^"]*)"(?: in the project "([^"]*)")?$/, async function (pronounCase, title, which) {
  const project = await projectOf(this, which);
  const page = this.page;
  await open(this, projectPath(project));
  await actOrExplain('create the work item', title, async () => {
    const add = page.locator('main').getByRole('button', { name: 'Add work item', exact: true }).filter({ visible: true }).first();
    await add.waitFor({ state: 'visible', timeout: budget(this) });
    await add.click();
    const form = page.locator('[role="dialog"]').filter({ has: page.locator('input#name') }).first();
    await form.locator('input#name').fill(title);
    await form.locator('button[type="submit"]').first().click();
  }, 'The project\'s list has an "Add work item" button for an Admin and a Member; a Guest has none.');
  const found = await waitForValue(() => findWorkItems(this, project, title), (list) => list.length > 0, budget(this));
  if (!found.ok) throw friendly({ message: `The work item "${title}" was not made in ${project.name}.`, hint: 'Look at the form for a message: its title is the one field it needs.' });
  for (const item of found.value) remember(this, project, item.id);
  const still = page.locator('[role="dialog"]').filter({ has: page.locator('input#name') });
  if (await still.count()) await page.keyboard.press('Escape').catch(() => {});
  await assertPresence(rowsOf(this, title), null, { label: `the work item "${title}" in the list`, timeout: budget(this), hint: 'The list shows a new work item once the site has made it.' });
});

// ---------------------------------------------------------------------------
// One work item
// ---------------------------------------------------------------------------

/**
 * Open a work item by its title or its id ("WEB-1"), in the project the scenario used (else the one of cucumber.js).
 *
 * Example #1: When I open the work item "Webship test work"
 * Example #2: When I open the work item "WEB-1"
 * Example #3: And we open the work item "The greeting script says Helo instead of Hello"
 * Example #4: Given I open the work item "An issue opened by someone outside the project"
 * Example #5: When open the work item "WEB-3"
 *
 */
When(/^(I |we )*open the work item "([^"]*)"$/, async function (pronounCase, title) {
  const item = await workItemNamed(this, title);
  this.plane = Object.assign(this.plane || {}, { item: item.key });
  await open(this, `/${workspaceSlug(this)}/browse/${item.key}/`);
  await onWorkItem(this);
});

/**
 * Move the work item on screen to a state of its project, through its state control and the list it opens.
 *
 * Example #1: When I set the state of the work item to "In Progress"
 * Example #2: When I set the state of the work item to "Done"
 * Example #3: And we set the state of the work item to "Todo"
 * Example #4: When I set the state of the work item to "Cancelled"
 * Example #5: When set the state of the work item to "Backlog"
 *
 */
When(/^(I |we )*set the state of the work item to "([^"]*)"$/, async function (pronounCase, name) {
  const page = this.page;
  const state = await onWorkItem(this);
  if (exactly(`State, ${name}`).test(await labelOf(state))) return;
  await actOrExplain('set the state of the work item to', name, async () => {
    await state.click();
    await page.locator('[role="option"]').filter({ hasText: exactly(name) }).first().click({ timeout: budget(this) });
  }, 'The states are the project\'s (Backlog, Todo, In Progress, Done, Cancelled by default); a Guest may not change one.');
  const result = await waitForValue(() => labelOf(state), (label) => exactly(`State, ${name}`).test(label), budget(this));
  if (!result.ok) throw friendly({ message: `The state of the work item did not become "${name}": it reads "${result.value}".`, hint: 'Look at the page for a message: the site refuses a change the account may not make.' });
});

/**
 * Assert the state the work item on screen shows.
 *
 * Example #1: Then the state of the work item should be "In Progress"
 * Example #2: Then the state of the work item should be "Done"
 * Example #3: And the state of the work item should be "Todo"
 * Example #4: But the state of the work item should be "Backlog"
 * Example #5: Then the state of the work item should be "Cancelled"
 *
 */
Then(/^the state of the work item should be "([^"]*)"$/, async function (name) {
  const state = await onWorkItem(this);
  const result = await waitForValue(() => labelOf(state), (label) => exactly(`State, ${name}`).test(label), budget(this));
  if (!result.ok) {
    throw friendly({ message: `Expected the state of the work item to be "${name}", but it is "${namesIn(result.value || '').join(', ') || result.value}".`, hint: 'The state shows as the first control under the title; set it with When I set the state of the work item to "…".' });
  }
});

/**
 * Add a comment to the work item on screen, through its comment editor and its Comment button, and wait until the
 * work item shows it.
 *
 * Example #1: When I add the comment "Checked on the test site" to the work item
 * Example #2: When I add the comment "Done on a branch" to the work item
 * Example #3: And we add the comment "Looks right" to the work item
 * Example #4: When I add the comment "A comment of a test" to the work item
 * Example #5: When add the comment "Checked again" to the work item
 *
 */
When(/^(I |we )*add the comment "([^"]*)" to the work item$/, async function (pronounCase, text) {
  const page = this.page;
  await onWorkItem(this);
  await actOrExplain('add the comment', text, async () => {
    const editor = page.locator('.ProseMirror[contenteditable="true"]').filter({ has: page.locator('[data-placeholder="Add comment"]') }).first();
    await editor.waitFor({ state: 'visible', timeout: budget(this) });
    await editor.click();
    await editor.fill(text);
    const send = page.locator('main button').filter({ hasText: /^\s*Comment\s*$/ }).first();
    await send.click({ timeout: budget(this) });
  }, 'The comment editor ("Add comment") is under the work item\'s activity; a Guest comments only on the work items it created.');
  await assertPresence(page.locator('[id^="comment-"]').filter({ hasText: text }), null, { label: `the comment "${text}"`, timeout: budget(this), hint: 'The site shows a comment once it has saved it.' });
});

/**
 * Assert that the work item on screen shows a comment holding the text, written by that account when one is named (the
 * display name the site shows).
 *
 * Example #1: Then the work item should show the comment "Checked on the test site"
 * Example #2: Then the work item should show the comment "Checked on the test site" by "member"
 * Example #3: And the work item should show the comment "The script is in the project's repository" by "owner"
 * Example #4: But the work item should show the comment "Looks right" by "owner"
 * Example #5: Then the work item should show the comment "Done on a branch"
 *
 */
Then(/^the work item should show the comment "([^"]*)"(?: by "([^"]*)")?$/, async function (text, author) {
  await onWorkItem(this);
  const read = () => this.page.evaluate((wanted) => {
    const found = [];
    for (const body of document.querySelectorAll('[id^="comment-"]')) {
      if (!(body.innerText || '').includes(wanted)) continue;
      let block = body.parentElement;
      while (block && !/\bcommented\b/.test(block.innerText || '')) block = block.parentElement;
      const head = block ? (block.innerText || '').split(/\bcommented\b/)[0] : '';
      found.push(head.trim().split(/\s+/).pop() || '');
    }
    return found;
  }, text);
  const result = await waitForValue(read, (authors) => authors.length > 0 && (!author || authors.some((a) => exactly(author).test(a))), budget(this));
  if (!result.ok) {
    const authors = result.value || [];
    throw friendly({
      message: authors.length ? `The work item shows the comment "${text}", but by ${authors.join(', ')}, not ${author}.` : `Expected the work item to show the comment "${text}", but it does not.`,
      hint: 'The comments are under the work item, in its activity (All or Comments).',
    });
  }
});

/**
 * Assign the work item on screen to an account of the project, by the display name the site shows ("owner"): through
 * its assignees control and the list it opens. An account that is already assigned stays.
 *
 * Example #1: When I assign the work item to "owner"
 * Example #2: When I assign the work item to "member"
 * Example #3: And we assign the work item to "owner"
 * Example #4: When I assign the work item to "member"
 * Example #5: When assign the work item to "owner"
 *
 */
When(/^(I |we )*assign the work item to "([^"]*)"$/, async function (pronounCase, name) {
  const page = this.page;
  await onWorkItem(this);
  const control = property(this, 'assignee');
  const has = async () => namesIn(await labelOf(control)).some((n) => exactly(name).test(n));
  if (await has()) return;
  await actOrExplain('assign the work item to', name, async () => {
    await control.click();
    const options = page.locator('[role="option"]');
    await options.first().waitFor({ state: 'visible', timeout: budget(this) });
    // An option shows the account's initial, then its display name (and "(You)" for the session's own).
    let chosen = null;
    for (const option of await options.all()) {
      const lines = String(await option.innerText()).split('\n').map((l) => tidy(l.replace(/\(You\)/, ''))).filter(Boolean);
      if (exactly(name).test(lines[lines.length - 1] || '')) { chosen = option; break; }
    }
    if (!chosen) throw new Error(`no option "${name}" in the list of assignees`);
    if ((await chosen.getAttribute('aria-selected')) !== 'true') await chosen.click();
    await page.keyboard.press('Escape');
  }, 'The list offers the Admins and Members of the project: a Guest takes no work items.');
  const result = await waitForValue(has, (yes) => yes, budget(this));
  if (!result.ok) throw friendly({ message: `The work item was not assigned to "${name}": its assignees read "${await labelOf(control)}".`, hint: 'Look at the page for a message: the site refuses an account that is not an Admin or a Member of the project.' });
});

/**
 * Assert that the work item on screen is assigned to an account (the display name the site shows), among others.
 *
 * Example #1: Then the work item should be assigned to "member"
 * Example #2: Then the work item should be assigned to "owner"
 * Example #3: And the work item should be assigned to "member"
 * Example #4: But the work item should be assigned to "owner"
 * Example #5: Then the work item should be assigned to "member"
 *
 */
Then(/^the work item should be assigned to "([^"]*)"$/, async function (name) {
  await onWorkItem(this);
  const control = property(this, 'assignee');
  const result = await waitForValue(() => labelOf(control), (label) => namesIn(label).some((n) => exactly(name).test(n)), budget(this));
  if (!result.ok) {
    const names = namesIn(result.value || '');
    throw friendly({ message: `Expected the work item to be assigned to "${name}", but ${names.length ? `it is assigned to ${names.join(', ')}` : 'it is assigned to nobody'}.`, hint: 'The assignees show as the third control under the title, after the state and the priority.' });
  }
});

/**
 * Assert who the work item on screen says last edited it ("Last edited by owner", under its description): the last
 * account that changed its title or description, else the account that made it.
 *
 * Example #1: Then the work item should be last edited by "owner"
 * Example #2: Then the work item should be last edited by "member"
 * Example #3: And the work item should be last edited by "reader"
 * Example #4: But the work item should be last edited by "owner"
 * Example #5: Then the work item should be last edited by "member"
 *
 */
Then(/^the work item should be last edited by "([^"]*)"$/, async function (name) {
  await onWorkItem(this);
  const line = this.page.locator('button').filter({ hasText: /^\s*Last edited by\b/ }).first();
  const read = async () => tidy(await line.innerText({ timeout: 1000 }));
  const result = await waitForValue(read, (text) => new RegExp(`^Last edited by ${escapeRegExp(name)}(\\s|$)`, 'i').test(text), budget(this));
  if (!result.ok) {
    throw friendly({ message: `Expected the work item to be last edited by "${name}", but ${result.value ? `it says "${result.value}"` : 'it says nothing of who last edited it'}.`, hint: 'The line is under the description: the last account that changed the title or the description, else the one that made the work item.' });
  }
});

// ---------------------------------------------------------------------------
// What a Guest may not do
// ---------------------------------------------------------------------------

/**
 * Assert that the session may not move the work item on screen: its state control is disabled (a Guest's, on the work
 * items it created).
 *
 * Example #1: Then I should not be able to change the state of the work item
 * Example #2: Then we should not be able to change the state of the work item
 * Example #3: And I should not be able to change the state of the work item
 * Example #4: But I should not be able to change the state of the work item
 * Example #5: Then should not be able to change the state of the work item
 *
 */
Then(/^(I |we )*should not be able to change the state of the work item$/, async function (pronounCase) {
  const state = await onWorkItem(this);
  const result = await waitForValue(() => state.isDisabled(), (disabled) => disabled === true, budget(this));
  if (!result.ok) throw friendly({ message: 'Expected the state of the work item to be closed to this account, but its control is open.', hint: 'An Admin and a Member move work items; a Guest may not.' });
});

/**
 * Assert that the session may not make a work item in a project: its list offers no button that is open for it (a
 * Guest's).
 *
 * Example #1: Then I should not be able to create a work item in the project "WEB"
 * Example #2: Then we should not be able to create a work item in the project "Webship site"
 * Example #3: And I should not be able to create a work item in the project "WEB"
 * Example #4: But I should not be able to create a work item in the project "WEB"
 * Example #5: Then should not be able to create a work item in the project "WEB"
 *
 */
Then(/^(I |we )*should not be able to create a work item in the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await projectOf(this, which);
  await open(this, projectPath(project));
  const buttons = this.page.getByRole('button', { name: /^\s*(New work item|Add work item)\s*$/ });
  await buttons.first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  await smartSettle(this.page, 1000);
  const open_ = [];
  for (const b of await buttons.all()) if ((await b.isVisible()) && !(await b.isDisabled())) open_.push(tidy(await b.innerText()));
  if (!(await buttons.count())) throw friendly({ message: `The project ${project.name} shows no button for a new work item at all (${this.page.url()}).`, hint: 'Open a project the account is a member of: the page shows the button, closed for a Guest.' });
  if (open_.length) throw friendly({ message: `Expected no open button for a new work item, but "${open_[0]}" is open to this account.`, hint: 'An Admin and a Member make work items; a Guest may not.' });
});

/**
 * Assert that the session may not open a work item: the site says the account has no access to it (a Guest, on a work
 * item it did not create), or that the workspace is not found (no membership). Give such a scenario @js-off: the
 * browser logs the refused requests.
 *
 * Example #1: Then I should be refused the work item "WEB-1"
 * Example #2: Then we should be refused the work item "The greeting script says Helo instead of Hello"
 * Example #3: And I should be refused the work item "WEB-2"
 * Example #4: But I should be refused the work item "WEB-1"
 * Example #5: Then should be refused the work item "WEB-2"
 *
 */
Then(/^(I |we )*should be refused the work item "([^"]*)"$/, async function (pronounCase, title) {
  const item = await workItemNamed(this, title);
  await open(this, `/${workspaceSlug(this)}/browse/${item.key}/`);
  const refusal = this.page.getByText(/don't have access to this work item|Workspace not found|lack authorization/i).first();
  try {
    await refusal.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    throw friendly({
      message: `Expected the work item ${item.key} to be refused, but the site shows no refusal (${this.page.url()}).`,
      hint: 'An Admin and a Member see every work item of the project; a Guest only the ones it created.',
    });
  }
});

After(async function () {
  const made = (this.plane && this.plane.made) || new Map();
  for (const [id, project] of made) {
    try { await removeWorkItem(this, project, id); } catch (e) { console.warn(`  could not remove the work item ${id} a scenario made: ${e.message}`); }
  }
  if (this.plane) this.plane.made = new Map();
});

AfterAll(async function () {
  await managerContexts.dispose();
});
