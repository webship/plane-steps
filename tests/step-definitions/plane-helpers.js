'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions and no hooks. It holds the plumbing the steps use and that
// another pack can require instead of copying: the wait budget, presence assertions with friendly errors, URL
// building, the users registry, signing in (the two-step form, and a session put back), the site's own API as the
// managing account (the test content a scenario makes and removes), and the work items a scenario made, which go
// after it.
//
// Everything here builds on webship-js's own helpers (`gotoUrl`, `smartSettle`, `waitForPageLoad`, `friendly`) so the
// steps behave like the core webship-js steps.

const { gotoUrl, smartSettle, waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');

let playwright;
try { playwright = require('playwright'); } catch { playwright = require(require.resolve('playwright', { paths: [require.resolve('webship-js/package.json')] })); }

/**
 * The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 15 seconds (the site's screens load
 * their data after the page), so a slow screen does not fail an assertion that would pass a moment later. Kept below
 * webship-js's 45 second step timeout.
 *
 * @param {object} world
 * @returns {number}
 */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 15000);
}

/**
 * Escape a literal string for use in a RegExp.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A RegExp that matches the whole text (ignoring surrounding space and case), for exact names and labels.
 *
 * @param {string} text
 * @returns {RegExp}
 */
function exactly(text) {
  return new RegExp('^\\s*' + escapeRegExp(text) + '\\s*$', 'i');
}

/**
 * Collapse runs of white space and trim.
 *
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim();
}

/**
 * Run an action and rethrow its failure as a friendly error (action, target, cause and a hint) instead of
 * Playwright's raw timeout stack.
 *
 * @param {string} label
 * @param {string} target
 * @param {Function} fn
 * @param {string} hint
 */
async function actOrExplain(label, target, fn, hint) {
  try {
    return await fn();
  } catch (err) {
    if (err && err.stack === err.message && /Hint:/.test(err.message)) throw err;
    throw friendly({ action: label, target, cause: err, hint });
  }
}

/**
 * Wait until a locator has (or, with `notCase`, no longer has) a visible match and fail with a friendly error
 * otherwise: the wait and the assertion are one call, so content that arrives a moment late still passes.
 *
 * @param {import('playwright').Locator} locator
 * @param {string|null|undefined} notCase
 * @param {{label: string, hint: string, timeout: number}} options
 */
async function assertPresence(locator, notCase, { label, hint, timeout }) {
  try {
    await locator.first().waitFor({ state: notCase ? 'hidden' : 'visible', timeout });
  } catch {
    throw friendly({
      message: notCase ? `Expected not to see ${label}, but it is still on the page.` : `Expected to see ${label}, but it did not appear within ${timeout} ms.`,
      hint,
    });
  }
}

/**
 * Poll a reader until its value satisfies a test, and return the last value read, so a value that changes a moment
 * after the action (a state after a move) still passes.
 *
 * @param {Function} read - async () => value
 * @param {Function} test - (value) => boolean
 * @param {number} timeout
 * @returns {Promise<{ok: boolean, value: *}>}
 */
async function waitForValue(read, test, timeout) {
  const deadline = Date.now() + timeout;
  let value;
  for (;;) {
    try { value = await read(); } catch { value = undefined; }
    if (value !== undefined && test(value)) return { ok: true, value };
    if (Date.now() >= deadline) return { ok: false, value };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * The site root without a trailing slash.
 *
 * @param {object} world
 * @returns {string}
 */
function siteRoot(world) {
  return String(world.launchUrl).replace(/\/+$/, '');
}

/**
 * Join the site root and a path with exactly one slash. Absolute URLs pass through.
 *
 * @param {object} world
 * @param {string} url
 * @returns {string}
 */
function siteUrl(world, url) {
  if (!url) return siteRoot(world);
  if (/^https?:\/\//i.test(url)) return url;
  return siteRoot(world) + '/' + String(url).replace(/^\/+/, '');
}

/**
 * The workspace the steps work in: its slug from cucumber.js (`worldParameters.workspace`).
 *
 * @param {object} world
 * @returns {string}
 */
function workspaceSlug(world) {
  return String((world.parameters && world.parameters.workspace) || 'webship');
}

/**
 * Open a page of the site and wait for it to settle. The site draws its screens after the page has loaded, so a step
 * waits on what it needs next.
 *
 * @param {object} world
 * @param {string} url
 */
async function open(world, url) {
  await gotoUrl(world.page, siteUrl(world, url));
  await world.page.waitForSelector('body', { state: 'attached', timeout: budget(world) });
  await waitForPageLoad(world.page, (world.minWaitTime && world.minWaitTime.page) || 3000);
}

/**
 * A user of the `users` registry in cucumber.js (`worldParameters.users`): its e-mail address (`username`, which the
 * site logs in with), its password, and the display name the site shows (`name`).
 *
 * @param {object} world
 * @param {string} handle
 * @returns {{username: string, password: string, name: string}}
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The account "${handle}" is not in the users registry. Known accounts: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '${handle}@example.com', password: process.env.PLANE_${handle.toUpperCase()}_PASSWORD, name: '${handle}' } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  const username = entry.username || handle;
  const password = typeof entry === 'string' ? entry : entry.password;
  if (!password) {
    throw friendly({
      message: `The account "${handle}" has no password in the users registry.`,
      hint: `Set worldParameters.users.${handle}.password in cucumber.js, from an environment variable.`,
    });
  }
  return { username, password, name: entry.name || handle };
}

/**
 * The account the browser's session is of, as the site's own API answers it (its e-mail address, its display name and
 * its whole name), or null for a visitor.
 *
 * @param {object} world
 * @returns {Promise<{email: string, display: string, full: string}|null>}
 */
async function currentAccount(world) {
  const r = await world.context.request.get(siteUrl(world, '/api/users/me/'), { ignoreHTTPSErrors: true, failOnStatusCode: false, maxRedirects: 0 }).catch(() => null);
  if (!r || r.status() !== 200) return null;
  const me = await r.json().catch(() => null);
  if (!me || !me.email) return null;
  return { email: String(me.email), display: String(me.display_name || ''), full: tidy(`${me.first_name || ''} ${me.last_name || ''}`) };
}

/**
 * The e-mail address of the account the browser's session is of; an empty string for a visitor.
 *
 * @param {object} world
 * @returns {Promise<string>}
 */
async function currentUser(world) {
  const me = await currentAccount(world);
  return me ? me.email : '';
}

/**
 * Forget the browser's session: the page is emptied first, so no request of the site brings a new session back.
 *
 * @param {object} world
 */
async function dropSession(world) {
  if (world.page.url() !== 'about:blank') await world.page.goto('about:blank').catch(() => {});
  await world.context.clearCookies();
}

/**
 * Fill and submit the login form, the way the site asks: the e-mail address, Continue, then the password. It asserts
 * nothing: an address the site refuses never gets to the password, and a wrong password comes back to the form with
 * the site's message.
 *
 * @param {object} world
 * @param {string} email
 * @param {string} password
 */
async function submitLogin(world, email, password) {
  const page = world.page;
  await open(world, '/');
  await actOrExplain('fill in the login form for', email, async () => {
    const field = page.locator('input#email');
    await field.waitFor({ state: 'visible', timeout: budget(world) });
    await field.fill(email);
    await field.press('Enter');
  }, 'The login form (its e-mail field, #email) did not show at the site\'s home page. A session that is already open goes to its workspace instead; a site that signs in through another provider only has no such form.');
  const secret = page.locator('input#password');
  const shown = await secret.waitFor({ state: 'visible', timeout: budget(world) }).then(() => true).catch(() => false);
  if (!shown) return;
  await secret.fill(password);
  await secret.press('Enter');
  await smartSettle(page, 2000);
}

const sessions = new Map();

/**
 * Sign in with an account of the users registry and make sure the session is that account's. An account that is
 * already signed in is kept; an account that signed in earlier in the run gets its session back; otherwise the account
 * goes through the login form.
 *
 * @param {object} world
 * @param {string} handle
 */
async function signInAs(world, handle) {
  const user = resolveUser(world, handle);
  const key = siteRoot(world) + '|' + handle;
  const same = (email) => String(email).toLowerCase() === String(user.username).toLowerCase();
  if (same(await currentUser(world))) {
    if (world.page.url() === 'about:blank' || !world.page.url().startsWith(siteRoot(world))) await open(world, '/');
    return;
  }
  await dropSession(world);
  const saved = sessions.get(key);
  if (saved) {
    await world.context.addCookies(saved);
    if (same(await currentUser(world))) {
      await open(world, '/');
      return;
    }
    sessions.delete(key);
    await dropSession(world);
  }
  await submitLogin(world, user.username, user.password);
  const result = await waitForValue(() => currentUser(world), same, budget(world));
  if (!result.ok) {
    const said = tidy(await world.page.locator('[role="alert"]').first().innerText({ timeout: 1500 }).catch(() => ''));
    throw friendly({
      message: `Logging in as "${handle}" (${user.username}) did not work${said ? `: the site says "${said}"` : `; the page is ${world.page.url()}`}.`,
      hint: /rate limit/i.test(said)
        ? 'The site allows a set number of logins a minute from one address (10 by default; AUTHENTICATION_RATE_LIMIT of the site, 100/minute on a test site), and a suite logs in more often than a person: raise it for the test site, or wait a minute.'
        : 'Check the e-mail address and the password of this account in worldParameters.users of cucumber.js, and that the account exists on the site and may log in.',
    });
  }
  sessions.set(key, await world.context.cookies());
}

// ---------------------------------------------------------------------------
// The site's own API, as the managing account
// ---------------------------------------------------------------------------

const managers = new Map();

/** The managing accounts' sessions of a run, all of them, and their end. */
const managerContexts = {
  async dispose() {
    for (const m of managers.values()) await m.ctx.dispose().catch(() => {});
    managers.clear();
  },
};

/** The value of a cookie of a request context. */
async function cookieOf(ctx, name) {
  const state = await ctx.storageState();
  const found = (state.cookies || []).find((c) => c.name === name);
  return found ? found.value : '';
}

/**
 * A session of its own for the managing account (`worldParameters.manager`, a handle of the users registry), for the
 * test content a scenario makes and removes: it signs in the way the site's screens do (its CSRF token, then the
 * e-mail address and the password) and calls the API the screens call, with the token Django asks for on a change.
 * It never touches the browser's session.
 *
 * @param {object} world
 * @returns {Promise<{ctx: import('playwright').APIRequestContext, csrf: string}>}
 */
async function managerSession(world) {
  const handle = (world.parameters && world.parameters.manager) || 'owner';
  const key = siteRoot(world) + '|' + handle;
  if (managers.has(key)) return managers.get(key);
  const user = resolveUser(world, handle);
  const root = siteRoot(world);
  const ctx = await playwright.request.newContext({ baseURL: root, ignoreHTTPSErrors: true, extraHTTPHeaders: { Accept: 'application/json', Referer: `${root}/`, Origin: root } });
  const refuse = async (said) => {
    await ctx.dispose();
    throw friendly({
      message: `The managing account "${handle}" could not sign in to ${root} for the test content: ${said}.`,
      hint: 'Check worldParameters.manager and the account in worldParameters.users of cucumber.js: an Admin of the projects the features use, who logs in with an e-mail address and a password.',
    });
  };
  const token = await ctx.get('/auth/get-csrf-token/', { failOnStatusCode: false });
  const csrf = token.status() === 200 ? String(((await token.json().catch(() => ({}))) || {}).csrf_token || '') : '';
  if (!csrf) return refuse(`the site gave no CSRF token (it answered ${token.status()})`);
  const signIn = await ctx.post('/auth/sign-in/', { form: { csrfmiddlewaretoken: csrf, email: user.username, password: user.password }, maxRedirects: 0, failOnStatusCode: false });
  const went = String(signIn.headers().location || '');
  if (/error_code=/.test(went)) return refuse(`the site said ${decodeURIComponent((went.match(/error_message=([^&]*)/) || [])[1] || 'no')}`);
  const me = await ctx.get('/api/users/me/', { failOnStatusCode: false });
  const email = me.status() === 200 ? String(((await me.json().catch(() => ({}))) || {}).email || '') : '';
  if (email.toLowerCase() !== String(user.username).toLowerCase()) return refuse(`its session is not the account's (the site answered ${me.status()})`);
  // Django gives a new CSRF token at the login: a change carries that one.
  const session = { ctx, csrf: await cookieOf(ctx, 'csrftoken') };
  managers.set(key, session);
  return session;
}

/**
 * One call of the site's own API as the managing account: its status and its JSON.
 *
 * @param {object} world
 * @param {string} method
 * @param {string} path - a path of the site, under /api/
 * @param {object} [data]
 * @returns {Promise<{status: number, data: *}>}
 */
async function api(world, method, path, data) {
  const { ctx, csrf } = await managerSession(world);
  const headers = method === 'GET' ? {} : { 'X-CSRFToken': csrf };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const r = await ctx.fetch(path, { method, headers, data: data === undefined ? undefined : JSON.stringify(data), failOnStatusCode: false });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status(), data: body };
}

/**
 * An answer of the API that is not a success, as a friendly error.
 *
 * @param {string} what
 * @param {{status: number, data: *}} r
 * @param {string} hint
 */
function apiFailure(what, r, hint) {
  const d = r.data || {};
  const said = typeof d === 'object' ? (d.error || d.detail || d.error_message || '') : '';
  return friendly({ message: `Could not ${what}: the site answered ${r.status}${said ? ` (${said})` : ''}.`, hint });
}

/**
 * A project of the workspace by its identifier ("WEB") or its name ("Webship site"): { id, identifier, name, slug }.
 * The step's project, else the one of cucumber.js.
 *
 * @param {object} world
 * @param {string} [which]
 */
async function findProject(world, which) {
  const wanted = String(which || (world.parameters && world.parameters.project) || '').trim();
  const slug = workspaceSlug(world);
  const r = await api(world, 'GET', `/api/workspaces/${encodeURIComponent(slug)}/projects/`);
  if (r.status !== 200) throw apiFailure(`read the projects of the workspace ${slug}`, r, 'The managing account must be a member of the workspace (worldParameters.workspace) and its projects.');
  const list = Array.isArray(r.data) ? r.data : ((r.data && r.data.results) || []);
  const found = list.find((p) => p.identifier === wanted.toUpperCase()) || list.find((p) => exactly(wanted).test(p.name));
  if (!found) throw friendly({ message: `There is no project "${wanted}" in the workspace ${slug} that the managing account can see.`, hint: 'Name the project by its identifier (WEB) or its name (Webship site); the managing account must be a member of it.' });
  return { id: String(found.id), identifier: String(found.identifier), name: String(found.name), slug };
}

/**
 * The page of a project's work items.
 *
 * @param {{id: string, slug: string}} project
 * @returns {string}
 */
function projectPath(project) {
  return `/${project.slug}/projects/${project.id}/issues/`;
}

/**
 * The work items of a project whose title is the text (or whose id is, as "WEB-1"), open or closed.
 *
 * @param {object} world
 * @param {{id: string, slug: string, identifier: string}} project
 * @param {string} title
 * @returns {Promise<object[]>}
 */
async function findWorkItems(world, project, title) {
  const r = await api(world, 'GET', `/api/workspaces/${project.slug}/projects/${project.id}/search-issues/?search=${encodeURIComponent(title)}`);
  if (r.status !== 200) throw apiFailure(`look for the work item "${title}"`, r, 'The managing account must see the project\'s work items.');
  const key = String(title).trim().toUpperCase();
  return (Array.isArray(r.data) ? r.data : []).filter((i) => exactly(title).test(i.name) || `${project.identifier}-${i.sequence_id}` === key);
}

/**
 * The one work item of a title or an id in a project (the step's, else the last one a scenario used):
 * { id, name, key } where key is its id as the site shows it ("WEB-1").
 *
 * @param {object} world
 * @param {string} title
 * @param {string} [projectName]
 * @returns {Promise<{id: string, name: string, key: string, project: object}>}
 */
async function workItemNamed(world, title, projectName) {
  const project = await findProject(world, projectName || (world.plane && world.plane.project));
  const found = await findWorkItems(world, project, title);
  if (!found.length) throw friendly({ message: `There is no work item "${title}" in the project ${project.name}.`, hint: 'Make it first with Given there is a work item "…" in the project "…", or name a work item of the sample content (its title, or its id as WEB-1).' });
  const item = found[0];
  return { id: String(item.id), name: String(item.name), key: `${project.identifier}-${item.sequence_id}`, project };
}

/**
 * Remember a work item a scenario made, so it goes after the scenario.
 *
 * @param {object} world
 * @param {{id: string, slug: string}} project
 * @param {string} id
 */
function remember(world, project, id) {
  world.plane = world.plane || {};
  world.plane.made = world.plane.made || new Map();
  world.plane.made.set(String(id), project);
}

/**
 * Remove a work item, as the managing account: the site keeps it marked as deleted, out of every list and count.
 *
 * @param {object} world
 * @param {{id: string, slug: string}} project
 * @param {string} id
 */
async function removeWorkItem(world, project, id) {
  const r = await api(world, 'DELETE', `/api/workspaces/${project.slug}/projects/${project.id}/issues/${id}/`);
  if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw apiFailure(`remove the work item ${id}`, r, 'The managing account must be allowed to delete work items in the project (an Admin).');
}

/**
 * Make a work item as the managing account: the project's default state, a line of text.
 *
 * @param {object} world
 * @param {{id: string, slug: string, identifier: string}} project
 * @param {string} title
 * @returns {Promise<object>}
 */
async function makeWorkItem(world, project, title) {
  const r = await api(world, 'POST', `/api/workspaces/${project.slug}/projects/${project.id}/issues/`, { name: title, description_html: '<p>Made by a test scenario; it goes after the scenario.</p>' });
  if (r.status !== 201) throw apiFailure(`make the work item "${title}"`, r, 'The managing account must be allowed to add work items in the project.');
  remember(world, project, r.data.id);
  return r.data;
}

/**
 * A cycle of a project by its name: { id, name }.
 *
 * @param {object} world
 * @param {{id: string, slug: string, name: string}} project
 * @param {string} name
 */
async function findCycle(world, project, name) {
  const r = await api(world, 'GET', `/api/workspaces/${project.slug}/projects/${project.id}/cycles/`);
  if (r.status !== 200) throw apiFailure(`read the cycles of ${project.name}`, r, 'The managing account must see the project\'s cycles.');
  const list = Array.isArray(r.data) ? r.data : ((r.data && r.data.results) || []);
  const found = list.find((c) => exactly(name).test(c.name));
  if (!found) throw friendly({ message: `There is no cycle "${name}" in the project ${project.name}. Its cycles: ${list.map((c) => `"${c.name}"`).join(', ') || 'none'}.`, hint: 'Name a cycle as the project\'s Cycles page shows it.' });
  return { id: String(found.id), name: String(found.name) };
}

module.exports = {
  budget,
  escapeRegExp,
  exactly,
  tidy,
  actOrExplain,
  assertPresence,
  waitForValue,
  siteRoot,
  siteUrl,
  workspaceSlug,
  open,
  resolveUser,
  currentAccount,
  currentUser,
  dropSession,
  submitLogin,
  signInAs,
  managerSession,
  managerContexts,
  api,
  apiFailure,
  findProject,
  projectPath,
  findWorkItems,
  workItemNamed,
  remember,
  removeWorkItem,
  makeWorkItem,
  findCycle,
};
