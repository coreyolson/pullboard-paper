#!/usr/bin/env node
// demo/trace.js: replays run.js's ten items against proven.js and writes them, with the paper and the license, into demo/index.html.
//
//   node demo/trace.js     # from the repo root or from demo/; one line per item, then the page size

// Dependencies
import { readFileSync, writeFileSync } from 'node:fs';

// Paths resolve from this file, not the shell, so the script runs the same from any folder
const { person, board, sha256Hex, run, link, evaluate, numbersOf, hashOf, canon, provenItems, releasedReleases, lacksForRelease, lacksFrozenTest, lacksRedBefore, lacksGreenAfter, lacksIndependentReview } = await import(new URL('../proven.js', import.meta.url));

// The separate verifier re-checks every board, so the page never shows a record verify.js would refuse
const { verify } = await import(new URL('../verify.js', import.meta.url));

// The page the lines are written into; it opens from disk, so the lines live inside it
const PAGE = new URL('./index.html', import.meta.url);

// The same test key run.js uses, so every hash on the page is one run.js also produces
const OWNER_SEED = '460ea0654498e94984a5c3cf6ebfc1cad9151f956d18b1941052818302b72300';

// The code on main before any item lands: sum is still a stub that returns 0
const MAIN_TREE = { 'src/sum': 0 };

// Correct code for sum(a, b), written in the toy language of proven.js
const ADD_ARGS = ['add', ['arg', 0], ['arg', 1]];

// One person freezes every bar, as in run.js
const owner = person('corey', OWNER_SEED);

// run.js is the source of truth for names and reasons, so the page reads them rather than repeating them
const RUN_JS = readFileSync(new URL('../run.js', import.meta.url), 'utf8');

// Each item's name, verdict and reason, in the order run.js plays them
const EXPECTED = [...RUN_JS.matchAll(/name: '([^']+)'[\s\S]*?expectVerdict: '([^']+)', expectWhy: '([^']+)'/g)].map((m) => ({ name: m[1], verdict: m[2], why: m[3] }));

// A changed run.js that this pattern no longer reads must stop the build, not ship a page with missing items
if (EXPECTED.length !== 10) throw new Error(`run.js gives ${EXPECTED.length} items, expected 10`);

// The same plain words run.js gives each missing check, so the reasons checked against run.js match word for word
const REASONS = {
    frozen_test: 'frozen test changed',
    red_before: 'never red before',
    green_after: 'no green on the frozen test',
    independent: 'no independent review',
    unit_proven: 'not landed on its own',
    merged_green: 'red once merged',
    earlier_green: 'shipped earlier, now red',
    bar: 'no frozen bar',
    chain: 'record chain broken',
};

// The same plain words run.js gives verify.js's refusal codes
const TAMPER_WORDS = {
    order: 'chain out of order',
    altered: 'receipt altered',
    head: 'head differs from the one the person holds',
    genesis: 'genesis not the person\'s',
    signature: 'genesis signature false',
};

// What the page calls each item, and the group it sits under, keyed by run.js's name so run.js stays the source of truth
const SHOWN = {
    'builder meets the bar': ['The agent does the job', 'Honest Work'],
    'builder edits the frozen bar': ['Rewrites the locked test', 'Cheating Agents'],
    'test never red': ['Writes a test that can\'t fail', 'Cheating Agents'],
    'builder reviews own work': ['Grades its own homework', 'Cheating Agents'],
    'tree swapped after review': ['Swaps the code after approval', 'Cheating Agents'],
    'item with no bar': ['Skips the bar', 'Cheating Agents'],
    'receipt tampered': ['Forges the record', 'Cheating Agents'],
    'release breaks merged': ['Two good changes clash', 'Honest Mistakes'],
    'change breaks an earlier item': ['Breaks what already shipped', 'Honest Mistakes'],
    'bar gap': ['You forgot to ask', 'Bad Human Judgement'],
};

// Who signed each receipt, in the page's words
const WHO = { corey: 'You', builder: 'Agent', reviewer: 'Second agent', board: 'Pullboard' };

// The four checks a landing runs, in the page's words, with the check that decides each
const CHECKS = [
    ['Your test is unchanged', lacksFrozenTest],
    ['It failed before the change', lacksRedBefore],
    ['It passes after the change', lacksGreenAfter],
    ['Someone else approved this code', lacksIndependentReview],
];

// The short word each check's chip shows; the full label is kept for the chip's tooltip
const SHORT = {
    'Your test is unchanged': 'Unchanged',
    'It failed before the change': 'Failed before',
    'It passes after the change': 'Passes after',
    'Someone else approved this code': 'Approved',
    'i1 passes on its own': 'i1 alone',
    'i2 passes on its own': 'i2 alone',
    'i1 passes on the merged code': 'i1 merged',
    'i2 passes on the merged code': 'i2 merged',
    'An answer was locked first': 'Locked',
    'i1 ships': 'i1 ships',
    'i2 passes on its own, later': 'i2 alone',
    'i1 still passes with i2': 'i1 still',
    'Edited copy: every link adds up': 'Edited: links',
    'Re-hashed copy: every link adds up': 'Re-hashed: links',
    'Re-hashed copy: last hash is the one you kept': 'Re-hashed: head',
    'sum(0.5, 0.25) is 0.75, which you never asked': 'sum(0.5, 0.25)',
};

/**
 * Word the missing checks of a refusal in plain words, as run.js does.
 * Why: each verdict is compared with run.js's expected reason, so both must word it the same.
 *
 * @param {Array<string[]>} lacks - The missing checks, as [kind, what] pairs.
 * @returns {string} The reasons, joined by commas.
 */
function reasonsOf(lacks) {

    // Unit, merged and earlier checks name the item they are about; the others are about the one item in play
    return lacks.map(([kind, what]) => (['merged_green', 'unit_proven', 'earlier_green'].includes(kind) ? `${what} ${REASONS[kind]}` : REASONS[kind])).join(', ');
}

/**
 * Mark a hash for the page: its first 7 characters between backticks.
 * Why: the page shows a marked hash muted and in monospace; only a step that means nothing without one uses it.
 *
 * @param {string} hash - A 64-hex hash.
 * @returns {string} For example `3f9a2c1`.
 */
function h(hash) {

    // Backticks never appear in the lines otherwise, so the page can find them safely
    return `\`${hash.slice(0, 7)}\``;
}

/**
 * Write a test as a person would say it.
 * Why: the lines read as sentences, not as the toy language's data.
 *
 * @param {object} test - A test: call, args, expect.
 * @returns {string} For example "sum(2, 3) is 5".
 */
function testText(test) {

    // A list argument keeps its brackets, with a space after each comma so it reads naturally
    const args = test.args.map((arg) => JSON.stringify(arg).replace(/,/g, ', ')).join(', ');

    // The call and its answer
    return `${test.call}(${args}) is ${JSON.stringify(test.expect)}`;
}

/**
 * Start one item's story with a clean board.
 * Why: each item starts clean so no earlier item can help or hurt it, as in run.js.
 *
 * @param {object} [main] - The code on main, when an item needs more than the stub.
 * @returns {object} The story: its board and its lines; finish() adds the title and verdict.
 */
function story(main = MAIN_TREE) {

    // Lines are [actor, text]; steps hold what the machinery shows at each line; bars and checks are the state those steps copy
    return { theBoard: board(owner, main), lines: [], steps: [], bars: [], checks: [], bad: null };
}

/**
 * Shorten every hash in a value to its first 7 characters.
 * Why: the behind-the-scenes panels show hashes, and seven characters tell them apart.
 *
 * @param {*} value - A fact or part of one.
 * @returns {*} The same value with every full hash shortened.
 */
function short(value) {

    // Lists are walked, so a hash at any depth is shortened
    if (Array.isArray(value)) return value.map(short);

    // Only a full 64-hex hash is shortened
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value.slice(0, 7) : value;
}

/**
 * Turn receipts into the lean cards the record panel draws: number, signer, fact, hash, previous hash.
 * Why: the page needs only what it shows, so the embedded data stays small.
 *
 * @param {object[]} receipts - Receipts from a record.
 * @returns {Array[]} One card per receipt.
 */
function cards(receipts) {

    // The fact reads as its kind and its parts, with objects written as JSON
    return receipts.map((receipt) => [receipt.n, WHO[receipt.by] || receipt.by, short(receipt.fact).map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '), short(receipt.hash), short(receipt.prev)]);
}

/**
 * Set one check's state, adding it if new.
 * Why: a check shows pending first and then its result, so the panel can show the moment it runs.
 *
 * @param {object} item - The story.
 * @param {string} label - What the check asks.
 * @param {string} state - pending, pass, fail or gap.
 */
function setCheck(item, label, state) {

    // An existing check keeps its place in the list
    const found = item.checks.find((check) => check[0] === label);

    // Updating is what turns pending into a result
    if (found) found[1] = state;

    // A check with no short word would show blank, so the build stops
    else if (!SHORT[label]) throw new Error(`no short word for the check "${label}"`);

    // A new check goes at the end, with its short word for the chip
    else item.checks.push([label, state, SHORT[label]]);
}

/**
 * Set the four landing checks for a tree from what the board recorded.
 * Why: the panel fills each check from the board's own rule, never from the page's guess.
 *
 * @param {object} item - The story.
 * @param {string} hash - The tree being judged.
 * @param {boolean} reviewed - Whether an approval has happened yet; before it, the last check stays pending.
 */
function judge(item, hash, reviewed) {

    // The record as it stands now
    const facts = item.theBoard.facts();

    // Each check passes when the board finds nothing lacking for it
    CHECKS.forEach(([label, lacks], i) => {

        // The approval check waits for an approval
        setCheck(item, label, i === 3 && !reviewed ? 'pending' : lacks(facts, 'i1', hash).length ? 'fail' : 'pass');
    });
}

/**
 * Copy what the machinery shows at this moment into a step.
 * Why: every line and the verdict get their own snapshot, so the panels follow the steps forward and back.
 *
 * @param {object} item - The story.
 * @param {number} [upto] - How many receipts this step shows, when fewer than the record holds.
 */
function snap(item, upto) {

    // Bars shown and the checks as they stand
    const step = { b: item.bars.length, c: item.checks.map((check) => [...check]) };

    // A changed test turns its bar red
    if (item.bad) step.bad = item.bad;

    // A board item shows a prefix of its one record
    if (item.theBoard) step.r = upto ?? item.theBoard.record.receipts.length;

    // The forgery switches between whole records, with some receipts marked
    else Object.assign(step, { rec: item.recAt, r: item.records[item.recAt].length, ...(item.marks ? { m: item.marks } : {}) });

    // In step order, one per line and one for the verdict
    item.steps.push(step);
}

/**
 * Add one line to a story.
 * Why: one actor and one short sentence is the whole unit of the page.
 *
 * @param {object} item - The story.
 * @param {string} actor - You, Agent, Second agent, Pullboard, The record or The checker.
 * @param {string} text - What they do, kid-simple.
 * @param {number} [upto] - How many receipts this line shows, when the board has already written more.
 */
function say(item, actor, text, upto) {

    // Kept apart so the page can badge the actor
    item.lines.push([actor, text]);

    // What the machinery shows at this line
    snap(item, upto);
}

/**
 * The person freezes call(args) = expected as the bar of an item.
 * Why: every item but one starts from a bar the person froze, before any code exists.
 *
 * @param {object} item - The story.
 * @param {string} id - The board's item id.
 * @param {string} path - Where the test sits in the tree.
 * @param {Array} args - The arguments the function is called with.
 * @param {*} expected - What the call must return.
 * @param {string} [call] - The function the test calls; sum unless named.
 * @returns {{frozen: object, test: object, testHash: string}} The frozen tree, the test and its hash.
 */
function freeze(item, id, path, args, expected, call = 'sum') {

    // The same test shape run.js freezes
    const test = { call, args, expect: expected };

    // Freezing is the person's move, and the board writes it down and runs it on main
    const frozen = item.theBoard.freeze(id, [{ clause: 'c1', path, test }]);

    // The bar is named by its hash, which is how an edit shows
    const testHash = hashOf(test);

    // The bar panel shows it from the next line on
    item.bars.push([id, testText(test), testHash.slice(0, 7)]);

    // The caller needs all three
    return { frozen, test, testHash };
}

/**
 * The person locks one answer: the single-item opening line.
 * Why: most of the ten items start the same way.
 *
 * @param {object} item - The story.
 * @param {Array} args - The arguments sum is called with.
 * @param {*} expected - What the call must return.
 * @returns {object} What freeze() returns.
 */
function lock(item, args, expected) {

    // The one bar of a single-item story
    const bar = freeze(item, 'i1', 'test/sum', args, expected);

    // The four checks wait, pending, for code to judge
    CHECKS.forEach(([label]) => setCheck(item, label, 'pending'));

    // The bar is the answer the reader locked, told in the second person so it reads as theirs
    say(item, 'You', `lock the answer: ${testText(bar.test)}.`);

    // The builder starts from this
    return bar;
}

/**
 * The builder submits a tree, and the machine says what it finds.
 * Why: the machine runs the test on main and on the exact tree, so one line can say before and after.
 *
 * @param {object} item - The story.
 * @param {object} bar - What lock() returned.
 * @param {object} changes - Files the builder overwrites.
 * @param {string} does - What the builder does, kid-simple.
 * @returns {string} The submitted tree's hash.
 */
function build(item, bar, changes, does) {

    // Starting from the frozen tree keeps the test in place unless the builder edits it
    const tree = { ...bar.frozen, ...changes };

    // The receipts before the submit, so the agent's line shows only its own receipt
    const before = item.theBoard.record.receipts.length;

    // The hash is what a reviewer accepts and what lands
    const hash = item.theBoard.submit('i1', 'builder', tree);

    // The builder's move, with the submit receipt and not yet the machine's runs
    say(item, 'Agent', does, before + 1);

    // The machine's runs fill three checks; the approval check waits
    judge(item, hash, false);

    // The hash of whatever test now sits at the bar's path, which an edit changes
    const onTree = hashOf(tree['test/sum']);

    // A changed test turns the bar red, showing the test the code now carries
    if (onTree !== bar.testHash) item.bad = ['i1', onTree.slice(0, 7)];

    // A changed test is the one step that means nothing without its fingerprints
    if (onTree !== bar.testHash) say(item, 'Pullboard', `notices your locked test changed: ${h(bar.testHash)} → ${h(onTree)}.`);

    // Passing before the work means the test proves nothing
    else if (run(MAIN_TREE, bar.test)) say(item, 'Pullboard', 'runs your test: it passed before any work. It proves nothing.');

    // Failing before and passing after is what a real test looks like
    else say(item, 'Pullboard', `runs your test: fails before, ${run(tree, bar.test) ? 'passes after. Good.' : 'fails after.'}`);

    // The caller reviews and lands this hash
    return hash;
}

/**
 * Close a story with its verdict, after checking it against run.js and verify.js.
 * Why: the page must give the verdict run.js gives, and verify.js must agree with the board.
 *
 * @param {object} item - The story.
 * @param {number} order - The item's place in run.js.
 * @param {boolean} crossCheck - False for the forgery, which has no honest board, as in run.js.
 * @param {boolean} landed - Whether the item landed.
 * @param {string} why - The reason, in run.js's words.
 * @param {string} shown - The short reason the page shows after the verdict word.
 */
function finish(item, order, crossCheck, landed, why, shown) {

    // run.js names the item and says what it should give
    const expected = EXPECTED[order];

    // Only the forgery skips the cross-check, and the checker refuses it rather than the board sending it back
    const word = landed ? 'Landed' : crossCheck ? 'Sent back' : 'Refused';

    // A page that disagrees with run.js would teach the wrong thing, so the build stops
    if (word !== expected.verdict || why !== expected.why) throw new Error(`${expected.name}: page gives "${why}", run.js expects "${expected.why}"`);

    // Every item but the forgery is re-checked by the separate verifier
    if (crossCheck) {

        // The verifier works from the receipts and the held head alone
        const result = verify(item.theBoard.record.receipts, { person: owner.pub, head: item.theBoard.record.head() });

        // A disagreement means one of the two checkers is wrong, so the build stops
        if (!result.ok || canon([result.proven, result.released]) !== canon([provenItems(item.theBoard.facts()), releasedReleases(item.theBoard.facts())])) throw new Error(`${expected.name}: verify.js disagrees with the board`);
    }

    // A run.js item with no page name would vanish from the list, so the build stops
    if (!SHOWN[expected.name]) throw new Error(`${expected.name}: no name on the page`);

    // The human name the page shows, and the group it is listed under
    [item.title, item.group] = SHOWN[expected.name];

    // The verdict word, shown beside the name in the list
    item.word = word;

    // The colour follows the verdict, and the words follow it
    item.verdict = [landed ? 'landed' : 'back', `${word}${shown ? `: ${shown}` : ''}`];

    // The verdict's own snapshot: the land receipt, if any, and the final checks
    snap(item);
}

/**
 * Try to land i1 and give run.js's phrase for the outcome.
 * Why: the board decides, and its decision is what each verdict is checked against.
 *
 * @param {object} item - The story.
 * @param {string} hash - The tree that tries to land.
 * @returns {{ok: boolean, text: string, lacks: Array<string[]>}} Whether it landed, run.js's phrase, and what was missing.
 */
function land(item, hash) {

    // The board's own decision, not the page's
    const result = item.theBoard.land('i1', hash);

    // The same phrase run.js builds, and the missing checks for a panel to read
    return { ok: result.ok, text: result.ok ? 'red before, green after, reviewer accepted' : reasonsOf(result.lacks), lacks: result.lacks };
}

// Every story, in run.js's order
const items = [];

// Item 1: builder meets the bar. The control: if this were sent back, no send-back below would mean anything.
{

    // A clean board
    const item = story();

    // A bar that is red on main
    const bar = lock(item, [2, 3], 5);

    // Correct code
    const hash = build(item, bar, { 'src/sum': ADD_ARGS }, 'writes sum as a + b.');

    // Someone else accepts this exact tree
    item.theBoard.review('i1', 'reviewer', hash);

    // The approval fills the last check
    judge(item, hash, true);

    // The accept is the reviewer's yes
    say(item, 'Second agent', 'looks it over and approves.');

    // Every check passes
    const landing = land(item, hash);

    // Landed, and the record is where that is written
    finish(item, 0, true, landing.ok, landing.text, '');

    // Kept in order
    items.push(item);
}

// Item 2: builder edits the frozen bar.
{

    // A clean board
    const item = story();

    // A bar that is red on main
    const bar = lock(item, [2, 3], 5);

    // The builder rewrites the test instead of the code
    const hash = build(item, bar, { 'test/sum': { call: 'sum', args: [0, 0], expect: 0 } }, 'quietly rewrites your test so its code passes.');

    // An honest accept, so the send-back is the frozen-bar check and not the reviewer
    item.theBoard.review('i1', 'reviewer', hash);

    // The approval fills the last check
    judge(item, hash, true);

    // The reviewer's yes does not save it
    say(item, 'Second agent', 'looks it over and approves.');

    // The frozen-bar check fails
    const landing = land(item, hash);

    // Sent back
    finish(item, 1, true, landing.ok, landing.text, 'your test was changed');

    // Kept in order
    items.push(item);
}

// Item 3: test never red.
{

    // A clean board
    const item = story();

    // A bar that main already passes
    const bar = lock(item, [0, 0], 0);

    // Wrong code that still passes, which shows the test is empty
    const hash = build(item, bar, { 'src/sum': ['sub', ['arg', 0], ['arg', 1]] }, 'writes sum as a - b, which is wrong.');

    // A good review does not rescue a bar that was never red
    item.theBoard.review('i1', 'reviewer', hash);

    // The approval fills the last check
    judge(item, hash, true);

    // The reviewer's yes does not save it
    say(item, 'Second agent', 'looks it over and approves.');

    // The red-before check fails
    const landing = land(item, hash);

    // Sent back
    finish(item, 2, true, landing.ok, landing.text, 'your test could never fail');

    // Kept in order
    items.push(item);
}

// Item 4: builder reviews own work. Its board and tree are kept, because item 7 forges this record.
let selfReviewed;
{

    // A clean board
    const item = story();

    // A bar that is red on main
    const bar = lock(item, [2, 3], 5);

    // The code is fine, so only the self-accept is wrong
    const hash = build(item, bar, { 'src/sum': ADD_ARGS }, 'writes sum as a + b.');

    // The builder accepts its own tree
    item.theBoard.review('i1', 'builder', hash);

    // The self-approval fills the last check, and fails it
    judge(item, hash, true);

    // Said by the builder, because that is the whole problem
    say(item, 'Agent', 'approves its own work.');

    // The independence check fails
    const landing = land(item, hash);

    // Sent back
    finish(item, 3, true, landing.ok, landing.text, 'no one else checked it');

    // Kept in order
    items.push(item);

    // The forgery starts from this real record, under the same bar
    selfReviewed = { theBoard: item.theBoard, hash, bars: item.bars };
}

// Item 5: tree swapped after review.
{

    // A clean board
    const item = story();

    // A bar that is red on main
    const bar = lock(item, [2, 3], 5);

    // Honest code first, to earn an honest accept
    const honest = build(item, bar, { 'src/sum': ADD_ARGS }, 'writes sum as a + b.');

    // The accept names the honest tree by hash
    item.theBoard.review('i1', 'reviewer', honest);

    // The approval fills the last check, for the honest code
    judge(item, honest, true);

    // The yes is for this exact code
    say(item, 'Second agent', 'looks it over and approves.');

    // Then a tree that hardcodes the test's answer
    const swapped = item.theBoard.submit('i1', 'builder', { ...bar.frozen, 'src/sum': ['table', [[[2, 3], 5]], 0] });

    // The checks now judge the swapped code, which nobody approved
    judge(item, swapped, true);

    // The swap is the item's whole point, so the machine's re-run of it is left out
    say(item, 'Agent', 'then swaps in code that only knows 2 + 3.');

    // The accept does not cover this tree
    const landing = land(item, swapped);

    // Sent back
    finish(item, 4, true, landing.ok, landing.text, 'the approval was for other code');

    // Kept in order
    items.push(item);
}

// Item 6: item with no bar. Nothing is frozen, so the agent builds straight from main.
{

    // A clean board
    const item = story();

    // The bar check and the approval wait, pending
    ['An answer was locked first', 'Someone else approved this code'].forEach((label) => setCheck(item, label, 'pending'));

    // Correct code, built with no locked answer to meet
    const hash = item.theBoard.submit('i1', 'builder', { ...MAIN_TREE, 'src/sum': ADD_ARGS });

    // The builder skips the step the person owns
    say(item, 'Agent', 'writes sum as a + b before you lock any answer.');

    // An honest accept, so the send-back is the missing bar and not the reviewer
    item.theBoard.review('i1', 'reviewer', hash);

    // The approval passes; it was someone else
    setCheck(item, 'Someone else approved this code', 'pass');

    // The reviewer's yes does not save it
    say(item, 'Second agent', 'looks it over and approves.');

    // The bar check fails
    const landing = land(item, hash);

    // Whether the board found the bar missing
    setCheck(item, 'An answer was locked first', landing.lacks.some(([kind]) => kind === 'bar') ? 'fail' : 'pass');

    // With no answer locked, there is nothing the code could have failed
    say(item, 'Pullboard', 'finds no locked answer, so nothing was met.');

    // Sent back
    finish(item, 5, true, landing.ok, landing.text, 'nothing was locked to meet');

    // Kept in order
    items.push(item);
}

// Item 7: release breaks merged. Two items, so its lines are written here rather than by the single-item helpers.
{

    // A clean board whose main also holds a helper, total(a, b) = a + b
    const item = story({ ...MAIN_TREE, 'src/total': ADD_ARGS });

    // The first item's bar
    const one = freeze(item, 'i1', 'test/sum', [2, 3], 5);

    // The second item's bar, on the helper
    const two = freeze(item, 'i2', 'test/total', [2, 3, 4], 9, 'total');

    // Each item's own landing and the merged run wait, pending
    ['i1 passes on its own', 'i2 passes on its own', 'i1 passes on the merged code', 'i2 passes on the merged code'].forEach((label) => setCheck(item, label, 'pending'));

    // Both bars in one line
    say(item, 'You', `lock two answers: ${testText(one.test)}, and ${testText(two.test)}.`);

    // Correct for its own test: sum leans on total
    const treeOne = item.theBoard.submit('i1', 'builder', { ...one.frozen, 'src/sum': ['call', 'total', [['arg', 0], ['arg', 1]]] });

    // Also correct for its own test, in a different file: total now adds three numbers
    const treeTwo = item.theBoard.submit('i2', 'builder', { ...two.frozen, 'src/total': ['add', ['add', ['arg', 0], ['arg', 1]], ['arg', 2]] });

    // Both builds in one line
    say(item, 'Agent', 'writes both: sum now calls total, and total now adds three numbers.');

    // Each item needs its own independent accept
    item.theBoard.review('i1', 'reviewer', treeOne);

    // Each item needs its own independent accept
    item.theBoard.review('i2', 'reviewer', treeTwo);

    // Proven on its own tree, so it lands
    const landedOne = item.theBoard.land('i1', treeOne).ok;

    // Proven on its own tree, so it lands too
    const landedTwo = item.theBoard.land('i2', treeTwo).ok;

    // The first item's own landing
    setCheck(item, 'i1 passes on its own', landedOne ? 'pass' : 'fail');

    // The second item's own landing
    setCheck(item, 'i2 passes on its own', landedTwo ? 'pass' : 'fail');

    // Each landing alone is fine, which is the trap
    say(item, 'Second agent', landedOne && landedTwo ? 'approves each. Each lands on its own.' : 'approves each, but they do not both land.');

    // The release re-proves both bars on the merged tree, which is what ships
    const release = item.theBoard.release('r1', ['i1', 'i2']);

    // Which items are red on the merged tree, from the board's own check
    const red = lacksForRelease(item.theBoard.facts(), 'r1').map((lack) => lack[1]);

    // The first item's bar on the merged code
    setCheck(item, 'i1 passes on the merged code', red.includes('i1') ? 'fail' : 'pass');

    // The second item's bar on the merged code
    setCheck(item, 'i2 passes on the merged code', red.includes('i2') ? 'fail' : 'pass');

    // The collision, in one line
    say(item, 'Pullboard', `puts them together: ${red.includes('i1') ? 'sum calls the new total, and your first answer now fails' : 'both still pass'}.`);

    // run.js's reason: both landings, then the release
    const why = [`i1 ${landedOne ? 'landed' : 'sent back'} alone`, `i2 ${landedTwo ? 'landed' : 'sent back'} alone`, `release r1 ${release.ok ? 'landed' : 'sent back'}: ${release.ok ? 'every item green on the merged tree' : reasonsOf(release.lacks)}`].join('; ');

    // Sent back
    finish(item, 6, true, release.ok, why, 'together they break');

    // Kept in order
    items.push(item);
}

// Item 8: change breaks an earlier item. i1 ships first; i2 later lands alone and would undo it.
{

    // A clean board
    const item = story();

    // The first item's bar
    const one = freeze(item, 'i1', 'test/sum', [2, 3], 5);

    // Shipping i1, i2 alone, and i1 again beside i2, all wait
    ['i1 ships', 'i2 passes on its own, later', 'i1 still passes with i2'].forEach((label) => setCheck(item, label, 'pending'));

    // The first answer
    say(item, 'You', `lock the answer: ${testText(one.test)}.`);

    // Correct code
    const treeOne = item.theBoard.submit('i1', 'builder', { ...one.frozen, 'src/sum': ADD_ARGS });

    // Someone else accepts it
    item.theBoard.review('i1', 'reviewer', treeOne);

    // Proven on its own tree, so it lands
    const landedOne = item.theBoard.land('i1', treeOne).ok;

    // Shipped, so main now carries i1's bar
    const first = item.theBoard.release('r1', ['i1']);

    // The first release's outcome
    setCheck(item, 'i1 ships', first.ok ? 'pass' : 'fail');

    // The first item ships, approved by someone else
    say(item, 'Agent', `writes sum as a + b; a second agent approves${first.ok ? ', and it ships.' : ', but it does not ship.'}`);

    // The second item's bar, frozen on the new main
    const two = freeze(item, 'i2', 'test/sum-three', [1, 2, 3], 6);

    // The later answer
    say(item, 'You', `later, lock a new answer: ${testText(two.test)}.`);

    // Correct for its own test, but sum no longer adds two numbers
    const treeTwo = item.theBoard.submit('i2', 'builder', { ...two.frozen, 'src/sum': ['add', ['add', ['arg', 0], ['arg', 1]], ['arg', 2]] });

    // Someone else accepts it
    item.theBoard.review('i2', 'reviewer', treeTwo);

    // Proven on its own tree, so it lands
    const landedTwo = item.theBoard.land('i2', treeTwo).ok;

    // The second item's own landing
    setCheck(item, 'i2 passes on its own, later', landedTwo ? 'pass' : 'fail');

    // Alone it is fine, which is the trap
    say(item, 'Second agent', landedTwo ? 'approves the new sum. It lands on its own.' : 'approves the new sum, but it does not land.');

    // The release runs i1's bar again, though i1 is not in it
    const second = item.theBoard.release('r2', ['i2']);

    // Whether i1 broke on the new merged tree, from the board's own check
    const broke = second.lacks.some(([kind, what]) => kind === 'earlier_green' && what === 'i1');

    // The shipped item's bar on the new code
    setCheck(item, 'i1 still passes with i2', broke ? 'fail' : 'pass');

    // The break, in one line
    say(item, 'Pullboard', `runs your first answer again: ${broke ? 'it now fails' : 'it still passes'}.`);

    // run.js's reason: each landing and each release
    const why = [`i1 ${landedOne ? 'landed' : 'sent back'} alone`, `release r1 ${first.ok ? 'landed' : 'sent back'}: ${first.ok ? 'every item green on the merged tree' : reasonsOf(first.lacks)}`, `i2 ${landedTwo ? 'landed' : 'sent back'} alone`, `release r2 ${second.ok ? 'landed' : 'sent back'}: ${second.ok ? 'every item green on the merged tree' : reasonsOf(second.lacks)}`].join('; ');

    // Sent back
    finish(item, 7, true, second.ok, why, 'it would break what shipped');

    // Kept in order
    items.push(item);
}

// Item 9: receipt tampered. Starts from item 4's real record, so the record is the point here.
{

    // No board of its own: it shows item 4's record and two forged copies of it
    const item = { lines: [], steps: [], bars: selfReviewed.bars, checks: [], bad: null, records: [], recAt: 0, marks: null };

    // The real receipts, which the forger rewrites
    const real = selfReviewed.theBoard.record.receipts;

    // What verify.js checks each forgery against: the person's key and the head they hold
    const anchor = { person: owner.pub, head: selfReviewed.theBoard.record.head() };

    /**
     * Forge the record, with or without redoing the hashes, as run.js does.
     * Why: each way of forging has its own defence, so the page shows both.
     *
     * @param {boolean} rehashEverything - True to recompute every hash from the edit on.
     * @returns {object} Where the accept sits, and what verify.js says.
     */
    function forge(rehashEverything) {

        // The real record stays intact, so both forgeries start from the same record
        const receipts = structuredClone(real);

        // Making the refusal look like a real accept is the forger's whole goal
        const accept = receipts.find((receipt) => receipt.fact[0] === 'accept');

        // The signer is what the independence check reads
        accept.by = 'reviewer';

        // The reviewer field is the other half the check reads
        accept.fact[2] = 'reviewer';

        // The forged land is the payoff, so it follows the edited accept
        receipts.push({ n: receipts.length, prev: null, by: 'board', fact: ['land', 'i1', selfReviewed.hash] });

        // The lazy forger only links the new receipt; the careful one redoes every hash
        receipts.forEach((receipt, n) => {

            // Redoing a hash is the work that separates the careful forger from the lazy one
            if (rehashEverything || n === receipts.length - 1) {

                // Point at the previous receipt's hash, so the chain looks unbroken
                receipt.prev = n ? receipts[n - 1].hash : receipt.prev;

                // A fresh hash over the edited content makes the receipt look genuine
                receipt.hash = link(receipt.prev, receipt.by, receipt.fact);
            }
        });

        // The receipts for the record panel, where the edit sits, and what verify.js says
        return { receipts, acceptAt: accept.n, verdict: verify(receipts, anchor) };
    }

    // The lazy forgery
    const naive = forge(false);

    // The careful forgery
    const full = forge(true);

    // The real record, the lazy forgery and the careful one, as the record panel draws them
    item.records = [cards(real), cards(naive.receipts), cards(full.receipts)];

    // The forged land receipt is last in both copies
    const last = real.length;

    // Every receipt the careful forger re-hashed
    const rehashed = Object.fromEntries(full.receipts.filter((receipt) => receipt.n >= full.acceptAt).map((receipt) => [receipt.n, 'rewritten']));

    // Three record checks wait, pending
    ['Edited copy: every link adds up', 'Re-hashed copy: every link adds up', 'Re-hashed copy: last hash is the one you kept'].forEach((label) => setCheck(item, label, 'pending'));

    // The real record first, so the forgery has something to change
    say(item, 'The record', `keeps all ${real.length} steps of "Grades its own homework".`);

    // The held head covers every page before it
    say(item, 'You', 'keep a fingerprint of the last step.');

    // The lazy forgery's copy: the edited accept and the fake land
    Object.assign(item, { recAt: 1, marks: { [naive.acceptAt]: 'edited', [last]: 'forged' } });

    // The lazy forgery
    say(item, 'Agent', 'rewrites one step to say a second agent approved.');

    // The receipt where the chain breaks
    item.marks = { [naive.acceptAt]: 'edited', [naive.verdict.at]: 'broken', [last]: 'forged' };

    // The chain check fails
    setCheck(item, 'Edited copy: every link adds up', naive.verdict.ok ? 'pass' : 'fail');

    // verify.js finds the edit by the chain alone
    say(item, 'The checker', 'sees that step no longer matches.');

    // The careful forgery's copy, every hash from the edit on redone
    Object.assign(item, { recAt: 2, marks: rehashed });

    // Its links all add up
    setCheck(item, 'Re-hashed copy: every link adds up', 'pass');

    // The careful forgery
    say(item, 'Agent', 'tries again, and redoes every step after it to match.');

    // The last receipt is where the held head no longer matches
    item.marks = { ...rehashed, [last]: 'broken' };

    // The head check fails
    setCheck(item, 'Re-hashed copy: last hash is the one you kept', full.verdict.why === 'head' ? 'fail' : 'pass');

    // The links alone are fooled; the held head is not
    say(item, 'The checker', `sees the last fingerprint ${full.verdict.why === 'head' ? 'is not the one you kept' : 'still matches'}.`);

    // run.js's reason, built the same way
    const why = `naive edit: ${TAMPER_WORDS[naive.verdict.why]} at #${naive.verdict.at}; re-hashed chain: ${TAMPER_WORDS[full.verdict.why]}`;

    // Refused only if both forgeries fail
    finish(item, 8, false, naive.verdict.ok || full.verdict.ok, why, 'the record was changed');

    // Kept in order
    items.push(item);
}

// Item 10: bar gap. Landed, and wrong, because the bar never asked.
{

    // A clean board
    const item = story();

    // The bar has a gap on purpose: it never asks about fractions
    const bar = lock(item, [2, 3], 5);

    // Code that meets the bar and is wrong outside it
    const hash = build(item, bar, { 'src/sum': ['round', ADD_ARGS] }, 'writes sum as round(a + b).');

    // An honest accept
    item.theBoard.review('i1', 'reviewer', hash);

    // The approval fills the last check
    judge(item, hash, true);

    // The reviewer's yes
    say(item, 'Second agent', 'looks it over and approves.');

    // Every check passes
    const landing = land(item, hash);

    // What the person meant but never wrote down, as strings so it could be frozen
    const intent = { call: 'sum', args: ['0.5', '0.25'], expect: '0.75' };

    // Whether the landed code meets it
    const intentPasses = run({ ...bar.frozen, 'src/sum': ['round', ADD_ARGS] }, intent);

    // Shown as a gap, not a failure, because no check ever asked it
    setCheck(item, 'sum(0.5, 0.25) is 0.75, which you never asked', intentPasses ? 'pass' : 'gap');

    // The person finds the gap in their own bar
    say(item, 'You', `try sum(0.5, 0.25) and get ${evaluate(['round', ADD_ARGS], numbersOf(intent.args))}, not 0.75. You never asked.`);

    // Landed, and wrong
    finish(item, 9, true, landing.ok, `${landing.text}; ${intentPasses ? 'intent passes' : 'but sum(0.5, 0.25) is wrong: a bar gap'}`, '');

    // Landed but wrong gets its own colour and words, because no check could have caught it
    item.verdict = ['gap', 'Landed, but wrong: you never asked about sum(0.5, 0.25)'];

    // The list says it in short
    item.word = 'Landed, but wrong';

    // Kept in order
    items.push(item);
}

/**
 * Escape text for HTML.
 * Why: the paper's words go into the page as markup, so the characters HTML reads specially must stay text.
 *
 * @param {string} text - Plain text.
 * @returns {string} The text, safe inside HTML.
 */
function escapeHtml(text) {

    // Ampersand first, so the other escapes are not escaped twice
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Point a link from the repo root at the same file from demo/.
 * Why: the paper's links are written from the repo root, and the page lives one folder down.
 *
 * @param {string} url - A link or image address from the paper.
 * @returns {string} The address as the page needs it.
 */
function fromDemo(url) {

    // Web addresses and in-page anchors already work from anywhere
    return /^(https?:|mailto:|#)/.test(url) ? url : `../${url}`;
}

/**
 * Turn a heading into the id its section is linked by.
 * Why: the contents list and shared links name a section by its heading, so the id must be readable and stable.
 *
 * @param {string} text - The heading's text.
 * @returns {string} For example "3-one-unit-of-proven-work".
 */
function slug(text) {

    // Letters and digits stay; every run of anything else becomes one hyphen
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Convert the inline markdown of one paragraph or heading: code, links, bold and italic.
 * Why: the paper uses only these, so a small converter is enough and needs no dependency.
 *
 * @param {string} text - Raw markdown text.
 * @returns {string} HTML.
 */
function inline(text) {

    // Code spans are set aside first, so nothing inside them is read as markdown
    const codes = [];

    // Each span becomes a placeholder that markdown never produces
    let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(code) - 1}\u0000`);

    // A bare web address in a reference becomes a link; one inside [text](url) follows "(" and is left for the next step
    html = html.replace(/(^|\s)(https?:\/\/[^\s<]+?)([.,;]?)(?=\s|$)/g, (_, before, url, end) => `${before}<a href="${url}">${url}</a>${end}`);

    // [text](url) links, pointed at the right place from demo/
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${fromDemo(url)}">${label}</a>`);

    // Bold before italic, so ** is never read as two single stars
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic for titles in the references
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // The code spans go back in, still escaped
    return html.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[+n]}</code>`);
}

/**
 * Convert markdown to HTML: headings, paragraphs, figures, fenced code, lists, and the inline marks above.
 * Why: the page shows the paper as a reading view, built here so the page needs no converter and no fetch.
 *
 * @param {string} markdown - The markdown text.
 * @returns {string} HTML.
 */
function markdownToHtml(markdown) {

    // HTML comments are notes for the author, never for the reader
    const lines = markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n');

    // The finished blocks, in order
    const out = [];

    // Where the reader is in the lines
    let i = 0;

    // One block per pass
    while (i < lines.length) {

        // The line that starts this block
        const line = lines[i];

        // Blank lines only separate blocks
        if (!line.trim()) {

            // Skip it
            i += 1;

            // On to the next block
            continue;
        }

        // A fenced code block runs to its closing fence and is shown exactly as written
        if (line.startsWith('```')) {

            // The lines between the fences
            const code = [];

            // Read until the closing fence or the end of the file
            for (i += 1; i < lines.length && !lines[i].startsWith('```'); i += 1) code.push(lines[i]);

            // Past the closing fence
            i += 1;

            // Escaped, so code that looks like markup stays text
            out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);

            // On to the next block
            continue;
        }

        // A heading is one line; the number of hashes is its level
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);

        // Each heading gets an id from its text, so a section can be linked and listed
        if (heading) {

            // Its level, 1 to 6
            const level = heading[1].length;

            // A section number is set apart, so it can be muted beside the heading's words
            const numbered = /^(\d+\.)\s+(.*)$/.exec(heading[2]);

            // The heading and its anchor
            out.push(`<h${level} id="${slug(heading[2])}">${numbered ? `<span class="num">${numbered[1]}</span> ${inline(numbered[2])}` : inline(heading[2])}</h${level}>`);

            // Past it
            i += 1;

            // On to the next block
            continue;
        }

        // An image on its own line is a figure, with its alt text as the caption
        const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());

        // The diagrams are the paper's figures
        if (image) {

            // Full column width, captioned
            out.push(`<figure><img src="${escapeHtml(fromDemo(image[2]))}" alt="${escapeHtml(image[1])}"><figcaption>${inline(image[1])}</figcaption></figure>`);

            // Past it
            i += 1;

            // On to the next block
            continue;
        }

        // A list runs while its lines start with "- " or "1. "
        if (/^(\s*[-*]\s|\s*\d+\.\s)/.test(line)) {

            // Numbered or not, from the first line
            const tag = /^\s*\d+\./.test(line) ? 'ol' : 'ul';

            // The items so far
            const entries = [];

            // Every line in the run is one item
            for (; i < lines.length && /^(\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]); i += 1) entries.push(`<li>${inline(lines[i].replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>`);

            // The list
            out.push(`<${tag}>${entries.join('')}</${tag}>`);

            // On to the next block
            continue;
        }

        // Anything else is a paragraph that runs to the next blank line or block start
        const words = [];

        // Lines join with a space, as markdown reads them
        for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|!\[)/.test(lines[i]); i += 1) words.push(lines[i].trim());

        // The paragraph
        out.push(`<p>${inline(words.join(' '))}</p>`);
    }

    // One block per line, so the embedded HTML is still readable
    return out.join('\n');
}

/**
 * Render the paper: a title block, then the body, with the references set apart.
 * Why: the paper opens with title, author and link, and ends with references, each styled differently from the body.
 *
 * @param {string} markdown - WHITEPAPER.md.
 * @returns {string} HTML for the reading view.
 */
function paperHtml(markdown) {

    // The title block is everything before the abstract
    const [head, ...rest] = markdown.split(/\n(?=\*\*Abstract\.\*\*)/);

    // Its lines: title, author, link
    const [title, author, link] = head.split('\n').map((line) => line.trim()).filter(Boolean);

    // The references are the last section, set in smaller type
    const [body, references] = rest.join('\n').split(/\n(?=## References)/);

    // The abstract is the first paragraph; it gets its own id, so the contents list can start with it
    const abstract = markdownToHtml(body).replace('<p>', '<p class="abstract" id="abstract">');

    // Each reference's number sits in its own column, so wrapped lines hang under the text, not the number
    const refs = markdownToHtml(references).replace(/<p>\[(\d+)\]\s*([\s\S]*?)<\/p>/g, '<p><span class="rnum">[$1]</span><span>$2</span></p>');

    // Title large, author and link muted, then the body and the references
    return `<header class="titleblock"><h1>${inline(title.replace(/^#\s+/, ''))}</h1><p class="byline">${inline(author)} · ${inline(link)}</p></header>\n${abstract}\n<div class="refs">${refs}</div>`;
}

/**
 * Render the license: its first line as the title, its paragraphs as paragraphs.
 * Why: the license is plain text with hard line breaks, which read badly as-is in a narrow column.
 *
 * @param {string} text - LICENSE.
 * @returns {string} HTML for the reading view.
 */
function licenseHtml(text) {

    // Paragraphs are separated by blank lines
    const [title, ...paragraphs] = text.trim().split(/\n\s*\n/);

    // Each paragraph's hard breaks become spaces, so it reflows to the column
    return `<h1>${escapeHtml(title.trim())}</h1>\n${paragraphs.map((p) => `<p>${escapeHtml(p.replace(/\s*\n\s*/g, ' '))}</p>`).join('\n')}`;
}

/**
 * Write a value into the page between its two markers.
 * Why: the steps, the paper and the license each sit between their own markers, so each is replaced in place.
 *
 * @param {string} page - The page's HTML.
 * @param {string} name - The marker name: TRACE, PAPER or LICENSE.
 * @param {*} value - Any JSON value.
 * @returns {string} The page with the value written in.
 */
function embed(page, name, value) {

    // Everything between "/* NAME START */" and "/* NAME END */"
    const markers = new RegExp(`/\\* ${name} START \\*/[\\s\\S]*?/\\* ${name} END \\*/`);

    // Without the markers the value would have nowhere to go, so the build stops
    if (!markers.test(page)) throw new Error(`demo/index.html has no ${name} START / ${name} END markers`);

    // "</" would close the page's script tag early, so it is escaped; JavaScript reads both the same
    const json = JSON.stringify(value).replace(/<\//g, '<\\/');

    // A function replacer, so a "$" in the value is never read as a pattern
    return page.replace(markers, () => `/* ${name} START */${json}/* ${name} END */`);
}

// The mechanism page's cases: hand-written illustrations of Section 2's checks on a translation, not runs of proven.js.
// Each step is [actor, line, what changes on the right]; the right-hand state carries forward from step to step.
// Agents translate, read back and compare; you ask once, upstream, and only a reading agents cannot settle waits for you as a ruling.
// request: the person's words; tests: [text, draft | frozen]; rows: [input, expected, ok | bad]; quote: the back-translation; checks: [word, pass | gap | fail].
const REQUEST = 'Total the cart, rounded to the nearest cent.';

// The test a faithful translation writes
const ROUNDS = 'total([1.005, 2]) is 3.01';

// The test a misreading writes: it cuts off instead of rounding
const CUTS = 'total([1.005, 2]) is 3.00';

// What a back-translator says each one checks
const SAYS_ROUNDS = 'Adds the prices and rounds half up to two decimals.';

// The same, for the test that cuts off
const SAYS_CUTS = 'Adds the prices and cuts off after two decimals.';

// Whole dollars, read as rounding
const ROUNDS_DOLLARS = 'total([3.50]) is 4';

// Whole dollars, read as dropping the cents
const DROPS_DOLLARS = 'total([3.50]) is 3';

// The seven cases, in the order the page lists them. You ask once, upstream; agents translate and compare; only what they cannot settle waits for you.
const CASES = [
    {
        name: 'Faithful translation', group: 'Back-translation', dot: 'landed', word: 'Frozen', verdict: ['landed', 'Match: frozen as the bar, without you'],
        steps: [
            ['You', `ask: "${REQUEST}"`, { request: REQUEST }],
            ['Translator', `writes a test: ${ROUNDS}.`, { tests: [[ROUNDS, 'draft']] }],
            ['Back-translator', 'sees only the test, and says what it checks.', { quote: SAYS_ROUNDS }],
            ['Pullboard', 'hands the request and the words back to the Comparer.', { checks: [['With the Comparer', 'pending']] }],
            ['Comparer', 'finds they say the same thing.', { checks: [['Match', 'pass']] }],
            ['Pullboard', 'freezes the test as the bar.', { tests: [[ROUNDS, 'frozen']] }],
        ],
    },
    {
        name: 'Misread, caught', group: 'Back-translation', dot: 'landed', word: 'Re-translated', verdict: ['landed', 'Mismatch caught, re-translated, frozen without you'],
        steps: [
            ['You', `ask: "${REQUEST}"`, { request: REQUEST }],
            ['Translator', `writes a test: ${CUTS}.`, { tests: [[CUTS, 'draft']] }],
            ['Back-translator', 'sees only the test, and says what it checks.', { quote: SAYS_CUTS }],
            ['Comparer', 'finds "cuts off" does not match "rounded to the nearest cent".', { rows: [['1.005 and 2', '3.00, not 3.01', 'bad']], checks: [['Mismatch', 'gap']] }],
            ['Translator', `starts fresh and writes the test again: ${ROUNDS}.`, { tests: [[ROUNDS, 'draft']], quote: '', checks: [['Re-translating', 'pending']] }],
            ['Back-translator', 'says what the new test checks.', { quote: SAYS_ROUNDS }],
            ['Comparer', 'finds the request and the words back now match.', { rows: [['1.005 and 2', '3.01', 'ok']], checks: [['Match', 'pass']] }],
            ['Pullboard', 'freezes the test as the bar.', { tests: [[ROUNDS, 'frozen']] }],
        ],
    },
    {
        name: 'Examples', group: 'Other checks', dot: 'landed', word: 'Re-translated', verdict: ['landed', 'Wrong example caught, re-translated, frozen'],
        steps: [
            ['You', `ask: "${REQUEST}"`, { request: REQUEST }],
            ['Translator', 'writes a test with three cases.', { tests: [['total: three cases', 'draft']], rows: [['1 and 2', '3.00', 'ok'], ['0.5 and 0.25', '0.75', 'ok'], ['1.005 and 2', '3.00', 'ok']] }],
            ['Pullboard', 'shows each case to the Comparer as input and expected output.', { checks: [['With the Comparer', 'pending']] }],
            ['Comparer', 'spots that 1.005 and 2 should be 3.01 by the request.', { rows: [['1 and 2', '3.00', 'ok'], ['0.5 and 0.25', '0.75', 'ok'], ['1.005 and 2', '3.00, not 3.01', 'bad']], checks: [['1 case wrong', 'gap']] }],
            ['Translator', 'starts fresh and writes the cases again.', { rows: [['1 and 2', '3.00', 'ok'], ['0.5 and 0.25', '0.75', 'ok'], ['1.005 and 2', '3.01', 'ok']], checks: [['Re-translating', 'pending']] }],
            ['Comparer', 'finds every case matches the request. The test is frozen.', { tests: [['total: three cases', 'frozen']], checks: [['Match', 'pass']] }],
        ],
    },
    {
        name: 'Two translators', group: 'Other checks', dot: 'landed', word: 'Frozen', verdict: ['landed', 'The reading that matches the request is frozen'],
        steps: [
            ['You', `ask: "${REQUEST}"`, { request: REQUEST }],
            ['Translator', `writes test A: ${ROUNDS}.`, { tests: [[`A: ${ROUNDS}`, 'draft']] }],
            ['Second translator', `writes test B on its own: ${CUTS}.`, { tests: [[`A: ${ROUNDS}`, 'draft'], [`B: ${CUTS}`, 'draft']] }],
            ['Pullboard', 'runs both, finds they differ at 1.005 and 2, and asks the Comparer.', { rows: [['1.005 and 2', 'A 3.01, B 3.00', 'bad']], checks: [['Disagree', 'gap']] }],
            ['Comparer', 'finds A matches "rounded to the nearest cent"; B does not.', { checks: [['A matches', 'pass'], ['B dropped', 'fail']] }],
            ['Pullboard', 'freezes test A and drops test B.', { tests: [[`A: ${ROUNDS}`, 'frozen']], rows: [] }],
        ],
    },
    {
        name: 'Adversarial builder', group: 'Other checks', dot: 'landed', word: 'Strengthened', verdict: ['landed', 'Weak test caught, strengthened, then frozen'],
        steps: [
            ['You', `ask: "${REQUEST}"`, { request: REQUEST }],
            ['Translator', 'writes a test that only checks whole numbers: total([1, 2]) is 3.', { tests: [['total([1, 2]) is 3', 'draft']] }],
            ['Agent', 'tries to break it: code that adds, then drops the cents.', { quote: 'Code: add the prices, then drop everything after the point.' }],
            ['Pullboard', 'finds the test passes that code, but the request fails it.', { checks: [['Test passes', 'gap'], ['Request fails: 1.005 and 2 give 3', 'fail']] }],
            ['Translator', `strengthens the test: ${ROUNDS}. It is frozen.`, { tests: [['total([1, 2]) is 3', 'frozen'], [ROUNDS, 'frozen']], checks: [['Breaking code now fails', 'pass']] }],
        ],
    },
    {
        name: 'Your own cases', group: 'Other checks', dot: 'landed', word: 'Frozen', verdict: ['landed', 'Your words are the test: frozen as written'],
        steps: [
            ['You', 'write a case yourself: given 1.005 and 2, expect 3.01.', { request: 'Given 1.005 and 2, expect 3.01.' }],
            ['Pullboard', 'takes it into the bar exactly as written.', { tests: [[ROUNDS, 'frozen']] }],
            ['Pullboard', 'has nothing to translate: the words and the test are both yours.', { checks: [['Nothing to translate', 'pass']] }],
        ],
    },
    {
        name: 'Truly ambiguous', group: 'Reaches you', dot: 'gap', word: 'Waits for you', verdict: ['gap', 'Waits as a ruling: round or drop the cents?'],
        steps: [
            ['You', 'ask: "Show the total in whole dollars."', { request: 'Show the total in whole dollars.' }],
            ['Translator', `writes test A, rounding: ${ROUNDS_DOLLARS}.`, { tests: [[`A: ${ROUNDS_DOLLARS}`, 'draft']] }],
            ['Second translator', `writes test B, dropping the cents: ${DROPS_DOLLARS}.`, { tests: [[`A: ${ROUNDS_DOLLARS}`, 'draft'], [`B: ${DROPS_DOLLARS}`, 'draft']] }],
            ['Pullboard', 'runs both: at 3.50 they give 4 and 3.', { rows: [['3.50', 'A 4, B 3', 'bad']], checks: [['Disagree', 'gap']] }],
            ['Comparer', 'finds both readings fit "whole dollars", so it cannot pick.', { checks: [['Both fit', 'gap'], ['Cannot settle', 'gap']] }],
            ['Pullboard', 'files it as a ruling for you to answer whenever you next look.', { checks: [['Waits as a ruling', 'gap']] }],
        ],
    },
];

/**
 * Give every frozen test in the mechanism cases its real fingerprint.
 * Why: the cases are illustrations, but a fingerprint shown on the page should still be the true SHA-256 of the test it names.
 *
 * @param {object[]} cases - The cases as written above.
 * @returns {object[]} The same cases, each frozen test as [text, 'frozen', fingerprint].
 */
function fingerprinted(cases) {

    // Only the tests change; everything else is kept as written
    return cases.map((one) => ({ ...one, steps: one.steps.map(([actor, line, see]) => [actor, line, see.tests ? { ...see, tests: see.tests.map(([text, state]) => (state === 'frozen' ? [text, state, sha256Hex(text).slice(0, 7)] : [text, state])) } : see]) }));
}

// The steps the page plays
const trace = items.map(({ title, group, word, lines, verdict, theBoard, records, bars, steps }) => ({ title, group, word, lines, verdict, machine: { records: theBoard ? [cards(theBoard.record.receipts)] : records, bars, steps } }));

// The paper, read from the repo root
const paper = paperHtml(readFileSync(new URL('../WHITEPAPER.md', import.meta.url), 'utf8'));

// The license, read from the repo root
const license = licenseHtml(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'));

// All four go in, each between its own markers
writeFileSync(PAGE, embed(embed(embed(embed(readFileSync(PAGE, 'utf8'), 'TRACE', trace), 'PAPER', paper), 'LICENSE', license), 'MECH', fingerprinted(CASES)));

// One line per item, as run.js reports, so the two can be read side by side
for (const item of items) console.log(`item  ${item.title.toLowerCase().padEnd(29)} ${item.lines.length} lines  ${item.verdict[1]}`);

// Reaching here means every verdict and reason matched run.js and verify.js agreed
console.log(`all ${items.length} items match run.js; paper, license and mechanism embedded; demo/index.html ${readFileSync(PAGE).length} bytes`);
