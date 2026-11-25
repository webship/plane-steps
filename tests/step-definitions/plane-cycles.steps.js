'use strict';

// Cycle step definitions: a cycle's page and the work items it holds, and the cycles page of a project with the
// cycles it lists. They only read: a cycle is configuration of the project, made by the build of the site.

const { When, Then } = require('@cucumber/cucumber');
const { smartSettle, friendly } = require('webship-js/tests/step-definitions/webship');
const { budget, exactly, open, assertPresence, findProject, findCycle } = require('./plane-helpers');

/** The project a step names, else the last one a scenario used, else the one of cucumber.js. */
async function projectOf(world, which) {
  const project = await findProject(world, which || (world.plane && world.plane.project));
  world.plane = Object.assign(world.plane || {}, { project: project.identifier });
  return project;
}

/**
 * Open a cycle's own page, by its name, in a project: the work items it holds.
 *
 * Example #1: When I open the cycle "Sprint 1" of the project "WEB"
 * Example #2: When I open the cycle "Sprint 1" of the project "Webship site"
 * Example #3: And we open the cycle "Sprint 1" of the project "WEB"
 * Example #4: Given I open the cycle "Sprint 2" of the project "WEB"
 * Example #5: When open the cycle "Sprint 1" of the project "WEB"
 *
 */
When(/^(I |we )*open the cycle "([^"]*)" of the project "([^"]*)"$/, async function (pronounCase, name, which) {
  const project = await projectOf(this, which);
  const cycle = await findCycle(this, project, name);
  this.plane = Object.assign(this.plane || {}, { cycle: cycle.name });
  await open(this, `/${project.slug}/projects/${project.id}/cycles/${cycle.id}/`);
  const crumb = this.page.locator('nav[aria-label="Breadcrumb"]').filter({ hasText: cycle.name }).first();
  await crumb.waitFor({ state: 'visible', timeout: budget(this) }).catch(() => {});
});

/**
 * Assert that the cycle on screen holds (or does not hold) a work item whose title holds the text.
 *
 * Example #1: Then the cycle should list the work item "The greeting script says Helo instead of Hello"
 * Example #2: Then the cycle should not list the work item "The usage line spells greeting as greting"
 * Example #3: And the cycle should list the work item "The greeting script says Helo instead of Hello"
 * Example #4: But the cycle should not list the work item "An issue opened by someone outside the project"
 * Example #5: Then the cycle should not list the work item "Webship test work"
 *
 */
Then(/^the cycle should (not )?list the work item "([^"]*)"$/, async function (notCase, title) {
  if (!/\/cycles\/[0-9a-f-]{36}/.test(this.page.url())) {
    throw friendly({ message: `There is no cycle on screen (${this.page.url()}).`, hint: 'Open it first with When I open the cycle "…" of the project "…".' });
  }
  await this.page.locator('a[href*="/browse/"]').first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  await smartSettle(this.page, 1000);
  await assertPresence(this.page.locator('a[href*="/browse/"]').filter({ hasText: title }), notCase, {
    label: `the work item "${title}" in the cycle ${(this.plane && this.plane.cycle) || ''}`.trim(),
    timeout: budget(this),
    hint: 'A cycle lists the work items added to it; a work item is added from its own page (its Cycle) or from the cycle.',
  });
});

/**
 * Open the cycles page of a project: its active, upcoming and completed cycles.
 *
 * Example #1: When I open the cycles of the project "WEB"
 * Example #2: When I open the cycles of the project "Webship site"
 * Example #3: And we open the cycles of the project "WEB"
 * Example #4: Given I open the cycles of the project "WEB"
 * Example #5: When open the cycles of the project "WEB"
 *
 */
When(/^(I |we )*open the cycles of the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await projectOf(this, which);
  await open(this, `/${project.slug}/projects/${project.id}/cycles/`);
});

/**
 * Assert that the cycles page on screen lists (or does not list) a cycle by its name.
 *
 * Example #1: Then the cycles should list "Sprint 1"
 * Example #2: Then the cycles should not list "Sprint 9"
 * Example #3: And the cycles should list "Sprint 1"
 * Example #4: But the cycles should not list "Sprint 0"
 * Example #5: Then the cycles should list "Sprint 1"
 *
 */
Then(/^the cycles should (not )?list "([^"]*)"$/, async function (notCase, name) {
  const links = this.page.locator('main a[href*="/cycles/"]');
  await links.first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  await smartSettle(this.page, 1000);
  await assertPresence(links.filter({ hasText: exactly(name) }), notCase, {
    label: `the cycle "${name}"`,
    timeout: budget(this),
    hint: 'Open the cycles first (When I open the cycles of the project "…"); the page lists the active cycle, then the upcoming and the completed ones.',
  });
});
