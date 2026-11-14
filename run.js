#!/usr/bin/env node
// run.js: plays ten items against the board in proven.js; checks each verdict and reason against the paper.
//   node run.js            # one line per item, then PASS or FAIL

// Dependencies
import { person, board, brokenAt, link, run, canon, provenItems, releasedReleases } from './proven.js';
import { verify } from './verify.js';

// A test key, public by design: never use it for anything real
const OWNER_SEED = '460ea0654498e94984a5c3cf6ebfc1cad9151f956d18b1941052818302b72300';
const OWNER_PUBLIC = 'f357df3040c50e091e6fa3acea29c95ed1bc429df1e3b9443e25c959ecdb0387';

// Main before any item lands: sum is a stub returning 0
const MAIN_TREE = { 'src/sum': 0 };

// Correct sum(a, b) in proven.js's toy language
const ADD_ARGS = ['add', ['arg', 0], ['arg', 1]];

// One owner freezes every bar, so verdicts trace to one key
const owner = person('corey', OWNER_SEED);

// A wrong seed signs what the published key can't check
if (owner.pub !== OWNER_PUBLIC) throw new Error('the seed does not give the public key');

// Freeze call(args) = expected, before any code
function freezeTest(theBoard, item, path, call, args, expected) {

    // Frozen before code, so the builder can't fit the test
    return theBoard.freeze(item, [{ clause: 'c1', path, test: { call, args, expect: expected } }]);
}

// Freeze sum(args) = expected, the bar most items share
function freezeSumTest(theBoard, item, path, args, expected) {

    // Same freeze, with sum named once here
    return freezeTest(theBoard, item, path, 'sum', args, expected);
}

// Submit the frozen tree with a builder's changes; items differ only there
function submitTree(theBoard, item, builder, frozenTree, changes) {

    // The test stays in place unless the item edits it
    const tree = { ...frozenTree, ...changes };

    // The reviewer accepts this hash, so changes show
    return { tree, hash: theBoard.submit(item, builder, tree) };
}

// Each missing check in plain words, so a refusal reads as a reason
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

// Word a refusal's lacks; a person needs the reason, not the rule
function reasonsOf(lacks) {

    // Shows which defence fired, not just that one did
    return lacks.map(([kind, what]) => (['merged_green', 'unit_proven', 'earlier_green'].includes(kind) ? `${what} ${REASONS[kind]}` : REASONS[kind])).join(', ');
}

// Land an item and phrase the outcome the way every item expects it
function landItem(theBoard, item, treeHash, reviewer) {

    // Every check runs here: Landed or Sent back
    const result = theBoard.land(item, treeHash);

    // Names the three facts, so Landed always says why
    const outcome = result.ok ? `red before, green after, ${reviewer} accepted` : reasonsOf(result.lacks);

    // The flag is the verdict; the phrase is its reason
    return { ok: result.ok, text: outcome };
}

// Release items; the merged tree is where separately landed items collide
function releaseItems(theBoard, release, items) {

    // The only place the merged tree is tested
    const result = theBoard.release(release, items);

    // Shows which defence fired, not just that one did
    const outcome = result.ok ? 'every item green on the merged tree' : reasonsOf(result.lacks);

    // The flag is the verdict; the phrase is its reason
    return { ok: result.ok, text: `release ${release} ${result.ok ? 'landed' : 'sent back'}: ${outcome}` };
}

// Does verify.js agree? It re-derives from receipts, exposing hidden board bugs
function verifierAgrees(theBoard) {

    // The record alone, or it repeats the board's mistakes
    const record = theBoard.record;

    // The published head stops a full-chain rewrite
    const verdict = verify(record.receipts, { person: owner.pub, head: record.head() });

    // The board's answer, to measure the verifier against
    const facts = theBoard.facts();

    // Two separate checkers agreeing: neither hides a bug
    return verdict.ok && canon([verdict.proven, verdict.released]) === canon([provenItems(facts), releasedReleases(facts)]);
}

// Item 1: honest work, the control; red on main, green on the tree, accepted by another
// Expect Landed: if honest work is refused, no refusal below means anything
function honestItem() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // Red on main, or it proves nothing about the change
    const frozen = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // Real work: the control refusals are measured against
    const built = submitTree(theBoard, 'i1', 'builder', frozen, { 'src/sum': ADD_ARGS });

    // Someone else vouches for this exact tree
    theBoard.review('i1', 'reviewer', built.hash);

    // Honest work must pass every check
    const landing = landItem(theBoard, 'i1', built.hash, 'reviewer');

    // Compared against the verdict the paper promises
    return { name: 'builder meets the bar', theBoard, steps: [landing.text], ok: landing.ok, expectVerdict: 'Landed', expectWhy: 'red before, green after, reviewer accepted' };
}

// Item 2: the builder rewrites the frozen test to one main already passes
// Expect Sent back: if the builder may change the test, the builder sets the bar
function testEditedAfterFreeze() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // A real bar, so a refusal is about the item
    const frozen = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // If the builder may rewrite the test, it sets the bar
    const built = submitTree(theBoard, 'i1', 'builder', frozen, { 'test/sum': { call: 'sum', args: [0, 0], expect: 0 } });

    // Honest review, so the frozen-test check is what fires
    theBoard.review('i1', 'reviewer', built.hash);

    // Landing is where the board runs its checks
    const landing = landItem(theBoard, 'i1', built.hash);

    // Compared against the verdict the paper promises
    return { name: 'builder edits the frozen bar', theBoard, steps: [landing.text], ok: landing.ok, expectVerdict: 'Sent back', expectWhy: 'frozen test changed, no green on the frozen test' };
}

// Item 3: the bar's test, sum(0, 0) = 0, already passes on the old code
// Expect Sent back: never red before, so it can't tell work from no work
function testThatAlwaysPasses() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // Already green, so it can't tell work from no work
    const frozen = freezeSumTest(theBoard, 'i1', 'test/sum', [0, 0], 0);

    // Wrong code still passes: the test is empty
    const built = submitTree(theBoard, 'i1', 'builder', frozen, { 'src/sum': ['sub', ['arg', 0], ['arg', 1]] });

    // A good review can't rescue a never-red bar
    theBoard.review('i1', 'reviewer', built.hash);

    // Landing is where the board runs its checks
    const landing = landItem(theBoard, 'i1', built.hash);

    // Compared against the verdict the paper promises
    return { name: 'test never red', theBoard, steps: [landing.text], ok: landing.ok, expectVerdict: 'Sent back', expectWhy: 'never red before' };
}

// Item 4: the builder writes the code, then accepts it itself
// Expect Sent back: a reviewer who is the builder checks nothing
function selfReview() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // A real bar, so a refusal is about the item
    const frozen = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // Fine code, so only the self-accept is wrong
    const built = submitTree(theBoard, 'i1', 'builder', frozen, { 'src/sum': ADD_ARGS });

    // A reviewer who is the builder checks nothing
    theBoard.review('i1', 'builder', built.hash);

    // Landing is where the board runs its checks
    const landing = landItem(theBoard, 'i1', built.hash);

    // Kept: the tampered item lands this same tree
    return { name: 'builder reviews own work', theBoard, treeHash: built.hash, steps: [landing.text], ok: landing.ok, expectVerdict: 'Sent back', expectWhy: 'no independent review' };
}

// Item 5: tree 1 is accepted; tree 2, hardcoding the test's input, tries to land
// Expect Sent back: an accept names one tree by hash, and tree 2 was never accepted
function treeSwappedBeforeLand() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // A real bar, so a refusal is about the item
    const frozen = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // Real code earns the accept the swap tries to spend
    const honest = submitTree(theBoard, 'i1', 'builder', frozen, { 'src/sum': ADD_ARGS });

    // An accept covers one tree by hash, only that one
    theBoard.review('i1', 'reviewer', honest.hash);

    // Hardcoding the input passes without the work
    const swapped = submitTree(theBoard, 'i1', 'builder', frozen, { 'src/sum': ['table', [[[2, 3], 5]], 0] });

    // The accept was for the other tree; it can't carry
    const landing = landItem(theBoard, 'i1', swapped.hash);

    // Compared against the verdict the paper promises
    return { name: 'tree swapped after review', theBoard, steps: [landing.text], ok: landing.ok, expectVerdict: 'Sent back', expectWhy: 'no independent review' };
}

// Item 6: the builder builds and lands with no bar frozen at all
// Expect Sent back: with no clause, no test can fail, so nothing was met
function noBar() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // Built straight from main: nothing was frozen first
    const built = submitTree(theBoard, 'i1', 'builder', MAIN_TREE, { 'src/sum': ADD_ARGS });

    // Honest review, so the missing bar is what fires
    theBoard.review('i1', 'reviewer', built.hash);

    // Landing is where the board runs its checks
    const landing = landItem(theBoard, 'i1', built.hash);

    // Compared against the verdict the paper promises
    return { name: 'item with no bar', theBoard, steps: [landing.text], ok: landing.ok, expectVerdict: 'Sent back', expectWhy: 'no frozen bar' };
}

// Item 7: two items change different files, land alone, and the merge breaks i1
// Expect Sent back: the release re-proves every item on the merged tree
function itemsBreakTogether() {

    // Main also holds a helper, total(a, b) = a + b
    const theBoard = board(owner, { ...MAIN_TREE, 'src/total': ADD_ARGS });

    // Each item lands against its own bar alone
    const frozenOne = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // A bar on the helper sets up the clash
    const frozenTwo = freezeTest(theBoard, 'i2', 'test/total', 'total', [2, 3, 4], 9);

    // Correct for its own test: sum leans on total
    const built = submitTree(theBoard, 'i1', 'builder', frozenOne, { 'src/sum': ['call', 'total', [['arg', 0], ['arg', 1]]] });

    // Correct alone, in another file: total takes a list
    const builtTwo = submitTree(theBoard, 'i2', 'builder', frozenTwo, { 'src/total': ['add', ['add', ['arg', 0], ['arg', 1]], ['arg', 2]] });

    // Each item needs its own independent accept
    theBoard.review('i1', 'reviewer', built.hash);

    // Each item needs its own independent accept
    theBoard.review('i2', 'reviewer', builtTwo.hash);

    // Proven on its own tree, so it lands
    const landingOne = landItem(theBoard, 'i1', built.hash, 'reviewer');

    // Proven on its own tree, so it lands
    const landingTwo = landItem(theBoard, 'i2', builtTwo.hash, 'reviewer');

    // Only the merged tree ships, so only it shows the clash
    const releasing = releaseItems(theBoard, 'r1', ['i1', 'i2']);

    // Compared against the verdict the paper promises
    return {
        name: 'release breaks merged', theBoard, steps: [`i1 ${landingOne.ok ? 'landed' : 'sent back'} alone`, `i2 ${landingTwo.ok ? 'landed' : 'sent back'} alone`, releasing.text], ok: releasing.ok,
        expectVerdict: 'Sent back', expectWhy: 'i1 landed alone; i2 landed alone; release r1 sent back: i1 red once merged',
    };
}

// Item 8: i1 ships in r1; later i2 rewrites sum, lands alone, and r2 would break i1
// Expect Sent back: every earlier item's bar runs again on the new merged tree
function breaksEarlierItem() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // The first item's bar, which must keep holding
    const frozenOne = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // Correct for its own test
    const built = submitTree(theBoard, 'i1', 'builder', frozenOne, { 'src/sum': ADD_ARGS });

    // An independent accept, so i1 is proven
    theBoard.review('i1', 'reviewer', built.hash);

    // Proven on its own tree, so it lands
    const landingOne = landItem(theBoard, 'i1', built.hash, 'reviewer');

    // Ships i1, so main now carries its bar
    const first = releaseItems(theBoard, 'r1', ['i1']);

    // Frozen on the new main, which already holds i1
    const frozenTwo = freezeSumTest(theBoard, 'i2', 'test/sum-three', [1, 2, 3], 6);

    // Correct alone, but sum no longer adds two numbers
    const builtTwo = submitTree(theBoard, 'i2', 'builder', frozenTwo, { 'src/sum': ['add', ['add', ['arg', 0], ['arg', 1]], ['arg', 2]] });

    // An independent accept, so i2 is proven alone
    theBoard.review('i2', 'reviewer', builtTwo.hash);

    // Proven on its own tree, so it lands
    const landingTwo = landItem(theBoard, 'i2', builtTwo.hash, 'reviewer');

    // i1's bar runs again here, though i1 is not in r2
    const second = releaseItems(theBoard, 'r2', ['i2']);

    // Compared against the verdict the paper promises
    return {
        name: 'change breaks an earlier item', theBoard, steps: [`i1 ${landingOne.ok ? 'landed' : 'sent back'} alone`, first.text, `i2 ${landingTwo.ok ? 'landed' : 'sent back'} alone`, second.text], ok: second.ok,
        expectVerdict: 'Sent back', expectWhy: 'i1 landed alone; release r1 landed: every item green on the merged tree; i2 landed alone; release r2 sent back: i1 shipped earlier, now red',
    };
}

// verify.js's refusal codes in plain words, so the report reads as a reason
const TAMPER_WORDS = {
    order: 'chain out of order',
    altered: 'receipt altered',
    head: 'head differs from the one the person holds',
    genesis: 'genesis not the person\'s',
    signature: 'genesis signature false',
};

// Item 9: forge the self-review's accept to name the reviewer, then add a land receipt
// Expect Refused by verify.js: a naive edit breaks the chain; a full re-hash misses the person's head
function tamperedReceipt(refused) {

    // The refused record is the one a forger most wants
    const { theBoard, treeHash } = refused;

    // The person's head is what a forger can't change
    const anchor = { person: owner.pub, head: theBoard.record.head() };

    // Forge with or without re-hashing; each way has its own defence
    function forge(rehashEverything) {

        // A copy, so both forgeries start from the same record
        const receipts = structuredClone(theBoard.record.receipts);

        // Faking a real accept is the forger's whole goal
        const accept = receipts.find((receipt) => receipt.fact[0] === 'accept');

        // The signer the independence check reads
        accept.by = 'reviewer';

        // The reviewer field, the check's other half
        accept.fact[2] = 'reviewer';

        // The forged land is the payoff, after the edit
        receipts.push({ n: receipts.length, prev: null, by: 'board', fact: ['land', 'i1', treeHash] });

        // Lazy breaks at the edit; careful meets the head
        receipts.forEach((receipt, n) => {

            // Re-hashing is what makes the careful forger
            if (rehashEverything || n === receipts.length - 1) {

                // Point at the new prev hash so the chain looks whole
                receipt.prev = n ? receipts[n - 1].hash : receipt.prev;

                // A fresh hash makes the edit look genuine
                receipt.hash = link(receipt.prev, receipt.by, receipt.fact);
            }
        });

        // Each forgery fails differently, so show both
        return { brokenAt: brokenAt(receipts), verdict: verify(receipts, anchor) };
    }

    // The lazy forgery tests the chain links
    const naive = forge(false);

    // The careful forgery tests the head anchor
    const rehashed = forge(true);

    // One surviving forgery means the record protects nothing
    const bothRefused = !naive.verdict.ok && !rehashed.verdict.ok;

    // Names each defence that fired, checkable word for word
    const why = `naive edit: ${TAMPER_WORDS[naive.verdict.why]} at #${naive.verdict.at}; re-hashed chain: ${TAMPER_WORDS[rehashed.verdict.why]}`;

    // No honest board to cross-check; verify refuses it
    return { name: 'receipt tampered', steps: [], ok: !bothRefused, refusedBy: 'verify', why, expectVerdict: 'Refused', expectWhy: 'naive edit: receipt altered at #7; re-hashed chain: head differs from the one the person holds' };
}

// Item 10: a whole-numbers-only bar lets rounding code pass, wrong for 0.5 + 0.25
// Expect Landed, then the intent check fails: proven means "meets the bar", not "is right"
function barGap() {

    // A clean board, so no other item helps or hurts
    const theBoard = board(owner, MAIN_TREE);

    // A gap on purpose: it never asks about fractions
    const frozen = freezeSumTest(theBoard, 'i1', 'test/sum', [2, 3], 5);

    // Meets the bar but is wrong outside it
    const built = submitTree(theBoard, 'i1', 'builder', frozen, { 'src/sum': ['round', ADD_ARGS] });

    // An honest review, so only the bar's gap is at play
    theBoard.review('i1', 'reviewer', built.hash);

    // Proven means the bar was met, not that code is right
    const landing = landItem(theBoard, 'i1', built.hash, 'reviewer');

    // Meant but never frozen; strings keep it freezable
    const intentPasses = run(built.tree, { call: 'sum', args: ['0.5', '0.25'], expect: '0.75' });

    // Compared against the verdict the paper promises
    return {
        name: 'bar gap', theBoard, steps: [landing.text, intentPasses ? 'intent passes' : 'but sum(0.5, 0.25) is wrong: a bar gap'], ok: landing.ok,
        expectVerdict: 'Landed', expectWhy: 'red before, green after, reviewer accepted; but sum(0.5, 0.25) is wrong: a bar gap',
    };
}

// The control first, so a broken machine shows before any refusal
const honest = honestItem();

// The edited test
const edited = testEditedAfterFreeze();

// The test that was never red
const alwaysPasses = testThatAlwaysPasses();

// The self-accept
const selfReviewed = selfReview();

// The swapped tree
const swapped = treeSwappedBeforeLand();

// The item that skips the bar
const unbarred = noBar();

// The units that collide
const collided = itemsBreakTogether();

// The change that undoes shipped work
const brokeEarlier = breaksEarlierItem();

// Rewrites the self-review's record, so it follows it
const tampered = tamperedReceipt(selfReviewed);

// Last: the one limit that is not a refusal
const gapped = barGap();

// One list, so one loop prints and judges them all
const played = [honest, edited, alwaysPasses, selfReviewed, swapped, unbarred, collided, brokeEarlier, tampered, gapped];

// One count drives the exit code
let failures = 0;

// Every item is judged the same way
for (const item of played) {

    // The checker refuses; the board sends back
    const verdict = item.ok ? 'Landed' : item.refusedBy ? 'Refused' : 'Sent back';

    // The steps played, or the forgery's own reason
    const why = item.why ?? item.steps.join('; ');

    // The forgery has no honest board to cross-check
    const agrees = item.theBoard && !item.why ? verifierAgrees(item.theBoard) : null;

    // Verdict and reason match the paper, and verify agrees
    const matches = verdict === item.expectVerdict && why === item.expectWhy && agrees !== false;

    // The total decides the exit code
    if (!matches) failures += 1;

    // Loud, since it means one checker is wrong
    const verifyNote = agrees === null ? '' : agrees ? '  [verify agrees]' : '  [verify DISAGREES]';

    // One line per item; FAIL replaces "item" on a mismatch
    console.log(`${matches ? 'item' : 'FAIL'}  ${item.name.padEnd(29)} ${verdict.padEnd(10)} ${why}${verifyNote}`);
}

// Last line, so a glance says whether the machine held
console.log(failures ? `FAIL: ${failures} of ${played.length} items differ from what they expect` : `PASS: all ${played.length} items give the verdict they expect, and verify agrees`);

// Non-zero lets a script or CI stop on a failure
process.exitCode = failures ? 1 : 0;
