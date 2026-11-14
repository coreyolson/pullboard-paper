// proven.js — the person freezes the bar; the machine proves work against it with receipts anyone re-checks.
// Method: WHITEPAPER.md. Node 22, no dependencies. Read in order: hashing, checks, record, moves.

// Dependencies
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';


// =============================================================================
// 1. Hashing and canonical JSON
// SHA-256 over canonical JSON, and the person's ed25519 key.
// =============================================================================

// Receipt 0's prev: nothing comes before it
export const ZERO_HASH = '0'.repeat(64);

// PKCS#8 header so Node can load a raw ed25519 seed
const ED25519_SEED_PREFIX = '302e020100300506032b657004220420';

// Canonical JSON: one value, one text, so every port hashes alike
export function canon(value) {

    // These spell the same in every language
    if (value === null || typeof value === 'boolean') return String(value);

    // Numbers need a rule every language can follow
    if (typeof value === 'number') {

        // Fractions print differently per language, splitting the hash
        if (!Number.isSafeInteger(value)) throw new Error(`canonical JSON allows integers only: ${value}`);

        // A safe integer prints identically everywhere
        return String(value);
    }

    // JSON's escaping is already fixed, so reuse it
    if (typeof value === 'string') return JSON.stringify(value);

    // Order is meaning in a list, so never sort it
    if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;

    // Byte order, so every language sorts keys alike
    const keys = Object.keys(value).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));

    // No whitespace, so one value has one text
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
}

// SHA-256 as hex; the one hash function, kept in one place
export function sha256Hex(text) {

    // Fixed UTF-8, whatever the caller's default encoding
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Hash any value; trees, tests and receipts are all named by it
export function hashOf(value) {

    // Canonical text, not the raw value, so two implementations agree
    return sha256Hex(canon(value));
}

// The person's key from a seed; the person is the one trusted party
export function person(name, seedHex) {

    // Node can't load a bare seed, so add the PKCS#8 header
    const der = Buffer.concat([Buffer.from(ED25519_SEED_PREFIX, 'hex'), Buffer.from(seedHex, 'hex')]);

    // Signs the genesis, the person's one act of trust
    const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });

    // Verifiers need the bare 32 bytes, at the end of SPKI
    const pub = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

    // Name for receipts, key to sign, pub for others to check
    return { name, privateKey, pub };
}


// =============================================================================
// 2. The checks
// An item is proven on a tree when no check finds anything lacking.
// They read only facts the board recorded, never an agent's word about its own work.
// =============================================================================

// The rules these checks implement; the person signs this id
export const RULES_ID = 'pullboard-proven/1';

// Facts of one relation; each check reads only its own few
function factsOf(facts, relation) {

    // The relation is always the first string
    return facts.filter((fact) => fact[0] === relation);
}

// Was exactly this fact recorded? The checks ask nothing more
function hasFact(facts, wanted) {

    // Full match, so a fact with the same start doesn't count
    return facts.some((fact) => fact.length === wanted.length && fact.every((part, i) => part === wanted[i]));
}

// An item's frozen bar clauses; every per-clause check walks these
function barOf(facts, item) {

    // The bar comes only from freeze, in the person's name
    return factsOf(facts, 'bar')
        .filter((fact) => fact[1] === item)
        .map(([, , clause, path, testHash]) => ({ clause, path, testHash }));
}

// Was this tree submitted? Only submitted trees are judged
function wasSubmitted(facts, item, tree) {

    // Matching the tree stops one submission vouching for another
    return factsOf(facts, 'submit').some((fact) => fact[1] === item && fact[3] === tree);
}

// Dedupe and sort lacks pairs, so each reason shows once, in one order
function distinctSorted(pairs) {

    // One entry per canonical text removes repeats
    const byText = new Map(pairs.map((pair) => [canon(pair), pair]));

    // Sorted text, so every port prints the same list
    return [...byText.keys()].sort().map((text) => byText.get(text));
}

// Check 0: the item has a bar; empty proves anything
export function lacksBar(facts, item, tree) {

    // An unsubmitted tree makes no claim to check
    if (!wasSubmitted(facts, item, tree)) return [];

    // No clause means no test can fail, so nothing was met
    return barOf(facts, item).length ? [] : [['bar', item]];
}

// Check 1: frozen tests unchanged, or the builder sets the bar; lacks as [kind, what]
export function lacksFrozenTest(facts, item, tree) {

    // An unsubmitted tree makes no claim to check
    if (!wasSubmitted(facts, item, tree)) return [];

    // A different hash means the test was edited after freeze
    return barOf(facts, item)
        .filter(({ path, testHash }) => !hasFact(facts, ['test_hash', tree, path, testHash]))
        .map(({ clause }) => ['frozen_test', clause]);
}

// Check 2: each test failed before; a test green on base proves nothing
export function lacksRedBefore(facts, item, tree) {

    // An unsubmitted tree makes no claim to check
    if (!wasSubmitted(facts, item, tree)) return [];

    // No red receipt: it already passed on main
    return barOf(facts, item)
        .filter(({ path, testHash }) => !hasFact(facts, ['red', item, path, testHash]))
        .map(({ clause }) => ['red_before', clause]);
}

// Check 3: each test passes on this exact tree; a pass can't move
export function lacksGreenAfter(facts, item, tree) {

    // An unsubmitted tree makes no claim to check
    if (!wasSubmitted(facts, item, tree)) return [];

    // Frozen hash plus tree hash, so no other pass counts
    return barOf(facts, item)
        .filter(({ path, testHash }) => !hasFact(facts, ['green', path, testHash, tree]))
        .map(({ clause }) => ['green_after', clause]);
}

// Check 4: someone other than the builder accepted this exact tree
export function lacksIndependentReview(facts, item, tree) {

    // An accept of another tree says nothing about this one
    const reviewers = factsOf(facts, 'accept').filter((fact) => fact[1] === item && fact[3] === tree).map((fact) => fact[2]);

    // This tree's builders can't be its only approvers
    const builders = factsOf(facts, 'submit').filter((fact) => fact[1] === item && fact[3] === tree).map((fact) => fact[2]);

    // Per builder: two builders each need someone else
    const unreviewed = builders.some((builder) => !reviewers.some((reviewer) => reviewer !== builder));

    // One pair: the reason is the same for any count
    return unreviewed ? [['independent', 'review']] : [];
}

// All five checks: a refusal's reason, computed
export function lacksForItem(facts, item, tree) {

    // Merging all five names every gap at once
    return distinctSorted([
        ...lacksBar(facts, item, tree),
        ...lacksFrozenTest(facts, item, tree),
        ...lacksRedBefore(facts, item, tree),
        ...lacksGreenAfter(facts, item, tree),
        ...lacksIndependentReview(facts, item, tree),
    ]);
}

// Proven on a tree: submitted and lacking nothing; landing's one guard
export function isProvenAt(facts, item, tree) {

    // Unsubmitted trees lack nothing, so would look proven
    return wasSubmitted(facts, item, tree) && lacksForItem(facts, item, tree).length === 0;
}

// Proven: landed on a tree it's proven on; only landed work is done
export function isProven(facts, item) {

    // Proof on an unlanded tree is only a claim
    return factsOf(facts, 'land').some((fact) => fact[1] === item && isProvenAt(facts, item, fact[2]));
}

// Releases built before this one, in build order
function releasesBefore(facts, release) {

    // First build fixes each release's place in line
    const order = [...new Set(factsOf(facts, 'release_tree').map((fact) => fact[1]))];

    // Unbuilt yet: every built release came before it
    const at = order.indexOf(release);

    // Strictly earlier, so the recursion always ends
    return at < 0 ? order : order.slice(0, at);
}

// Items on main: units of earlier releases that held
function itemsOnMain(facts, release) {

    // Only releases that held ever moved main
    const held = releasesBefore(facts, release).filter((earlier) => isReleased(facts, earlier));

    // Their units are what main now carries
    return factsOf(facts, 'in_release').filter((fact) => held.includes(fact[1])).map((fact) => fact[2]);
}

// Any frozen test of the item red on a merged tree?
function redOnAny(facts, item, mergedTrees) {

    // One red test on one built tree is enough to refuse
    return mergedTrees.some((tree) => barOf(facts, item)
        .some(({ path, testHash }) => !hasFact(facts, ['green', path, testHash, tree])));
}

// What a release lacks; units proven alone can break each other merged
export function lacksForRelease(facts, release) {

    // The units that must hold together
    const items = factsOf(facts, 'in_release').filter((fact) => fact[1] === release).map((fact) => fact[2]);

    // A release may have been built more than once
    const mergedTrees = factsOf(facts, 'release_tree').filter((fact) => fact[1] === release).map((fact) => fact[2]);

    // Else unproven work rides into main in a release
    const unproven = items.filter((item) => !isProven(facts, item)).map((item) => ['unit_proven', item]);

    // Green alone can be red merged; only merged green counts
    const brokenTogether = items.filter((item) => redOnAny(facts, item, mergedTrees)).map((item) => ['merged_green', item]);

    // Earlier bars still run, so shipped work stays done
    const brokenEarlier = itemsOnMain(facts, release).filter((item) => redOnAny(facts, item, mergedTrees)).map((item) => ['earlier_green', item]);

    // One dedupe and sort gives a single order
    return distinctSorted([...unproven, ...brokenTogether, ...brokenEarlier]);
}

// Released: built and lacking nothing; main moves only then
export function isReleased(facts, release) {

    // Unmerged has no tree, yet would lack nothing
    const built = factsOf(facts, 'release_tree').some((fact) => fact[1] === release);

    // Built and lacking nothing is the whole bar for main
    return built && lacksForRelease(facts, release).length === 0;
}

// Proven item ids, sorted; anyone re-derives them from receipts
export function provenItems(facts) {

    // An item landed twice is listed once
    const landed = new Set(factsOf(facts, 'land').map((fact) => fact[1]));

    // Landing isn't enough, so re-judge; sort to repeat
    return [...landed].filter((item) => isProven(facts, item)).sort();
}

// Released release ids, sorted; re-derivable the same way
export function releasedReleases(facts) {

    // A release built twice is listed once
    const built = new Set(factsOf(facts, 'release_tree').map((fact) => fact[1]));

    // Building isn't enough, so re-judge; sort to repeat
    return [...built].filter((release) => isReleased(facts, release)).sort();
}


// =============================================================================
// 3. The record
// Receipts chained by hash: past receipts never change, so any edit shows as a break.
// The genesis also carries the person's signature over its hash.
// =============================================================================

// A receipt's hash; covering prev chains every later one to it
export function link(prev, by, fact) {

    // Hashing prev makes an old edit break every later hash
    return hashOf([prev, by, fact]);
}

// First broken receipt: where an edited record stops being the real one
export function brokenAt(receipts) {

    // The first failure is where the record broke
    const index = receipts.findIndex((receipt, n) => {

        // Wrong prev: inserted, removed or reordered
        const expectedPrev = n ? receipts[n - 1].hash : ZERO_HASH;

        // Hash off from content: this receipt was edited
        return receipt.prev !== expectedPrev || receipt.hash !== link(receipt.prev, receipt.by, receipt.fact);
    });

    // null, so -1 can't pass for an index
    return index < 0 ? null : index;
}

// An append-only record; nothing is ever removed or rewritten
export function newRecord() {

    // Readers get copies, so nothing else can reorder it
    const receipts = [];

    // Append one fact chained to the last; the only way in
    function append(by, fact, key) {

        // Chaining to the last hash makes it unmovable
        const prev = receipts.at(-1)?.hash ?? ZERO_HASH;

        // The position lets a verifier say which broke
        const receipt = { n: receipts.length, prev, by, fact, hash: link(prev, by, fact) };

        // Only the genesis is signed; the held head covers the rest
        if (key) receipt.sig = sign(null, Buffer.from(receipt.hash, 'utf8'), key).toString('hex');

        // Last, so a failed sign leaves no half receipt
        receipts.push(receipt);
    }

    // Every fact, in order; what the checks read
    function facts() {

        // Deep copies of facts only, so no caller edits a kept fact
        return structuredClone(receipts.map((receipt) => receipt.fact));
    }

    // Every receipt, in order, as a copy to change freely
    function copies() {

        // Deep, so an edit to a copy never reaches the chain
        return structuredClone(receipts);
    }

    // The last hash; the person holds it to expose a full re-hash
    function head() {

        // The newest hash covers every earlier one
        return receipts.at(-1).hash;
    }

    // Only append, so recording always goes through the chain
    return { get receipts() { return copies(); }, append, facts, head };
}


// =============================================================================
// 4. The moves
// Freeze the bar, red before, green after, accept, land, release.
// A tree maps path -> JSON; src/<name> holds a function, a test is {call, args, expect}.
// =============================================================================

// Operand count per expression operation
const ARITY = { arg: 1, add: 2, sub: 2, round: 1, sum: 1, table: 2, call: 2 };

// Compare results: numbers as doubles, lists by element; decides a test
function same(a, b) {

    // Two lists are never the same object
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));

    // Only numbers are values; nothing else ever matches
    return typeof a === 'number' && a === b;
}

// Insist on a number; arithmetic on anything else fails the test
function asNumber(value) {

    // Throw, so a string is never quietly added
    if (typeof value !== 'number') throw new Error('not a number');

    // Returning it lets the call sit inline
    return value;
}

// Evaluate the toy language; small enough that every port agrees
export function evaluate(expression, args, tree = {}) {

    // A literal needs no work
    if (typeof expression === 'number') return expression;

    // Fail loudly, or a typo passes as some other value
    if (!Array.isArray(expression) || ARITY[expression[0]] !== expression.length - 1) {
        throw new Error(`bad expression ${JSON.stringify(expression)}`);
    }

    // y is unused by one-operand operations
    const [operation, x, y] = expression;

    // Nested operands all read the call's own arguments
    const evaluateOperand = (operand) => evaluate(operand, args, tree);

    switch (operation) {

        // How a function reads its own input
        case 'arg':

            // A bad index is a bug, so the test must fail
            if (!Number.isInteger(x) || x < 0 || x >= args.length) throw new Error('no such arg');

            // From 0, like the argument list itself
            return args[x];

        // Forced to numbers so a string never concatenates
        case 'add': return asNumber(evaluateOperand(x)) + asNumber(evaluateOperand(y));

        // Same guard, so no string coercion here either
        case 'sub': return asNumber(evaluateOperand(x)) - asNumber(evaluateOperand(y));

        // Native rounding differs on halves, so one rule
        case 'round': return Math.floor(asNumber(evaluateOperand(x)) + 0.5);

        // The one way to reduce many inputs to one
        case 'sum': {

            // May be a list passed in as an argument
            const list = evaluateOperand(x);

            // Summing a number would give a wrong answer
            if (!Array.isArray(list)) throw new Error('not a list');

            // From 0, so an empty list sums to 0
            return list.reduce((total, value) => total + asNumber(value), 0);
        }

        // Listed cases with a fallback for the rest
        case 'table': {

            // First match wins, so earlier rows override
            for (const [rowArgs, output] of x) if (same(rowArgs, args)) return output;

            // No row matched, so the fallback decides
            return evaluateOperand(y);
        }

        // Code in one file can lean on code in another
        case 'call': {

            // A missing callee is a bug, so the test must fail
            if (typeof x !== 'string' || !Object.hasOwn(tree, `src/${x}`) || !Array.isArray(y)) throw new Error('no such function');

            // The callee sees only what this call passes it
            return evaluate(tree[`src/${x}`], y.map(evaluateOperand), tree);
        }
    }
}

// A test's number strings as numbers, at any depth
export function numbersOf(value) {

    // Lists may hold numbers at any depth
    if (Array.isArray(value)) return value.map(numbersOf);

    // Fractions come as strings, so canon() stays integer
    return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

// Run one test: 'pass', 'fail' on its assertion, or 'error'; never throws
export function outcome(tree, test) {

    // Not shaped like a call: it never reaches an assertion
    if (!test || typeof test !== 'object' || Array.isArray(test) || typeof test.call !== 'string' || !Array.isArray(test.args)) return 'error';

    // How a test finds the code it names
    const path = `src/${test.call}`;

    // Missing code is a crash, not an answer
    if (!Object.hasOwn(tree, path)) return 'error';

    // Malformed builder code must not stop the board
    try {

        // The code produced an answer; the assertion compares it
        return same(evaluate(tree[path], numbersOf(test.args), tree), numbersOf(test.expect)) ? 'pass' : 'fail';
    } catch {

        // No answer was produced, so the assertion never ran
        return 'error';
    }
}

// Whether a test passes; a fail and an error both mean no
export function run(tree, test) {
    return outcome(tree, test) === 'pass';
}

// Freeze a value all the way down, so nothing stored can change under its hash
function deepFreeze(value) {
    if (value && typeof value === 'object') Object.values(Object.freeze(value)).forEach(deepFreeze);
    return value;
}

// Paths a tree changed from its base; a release merges only changes
function changedPaths(base, tree) {

    // Canonical text, so untouched paths stay out of the merge
    return Object.fromEntries(Object.entries(tree).filter(([path, value]) => !Object.hasOwn(base, path) || canon(base[path]) !== canon(value)));
}

// The board: record, trees and moves; it trusts no builder or reviewer
export function board(owner, main) {

    // The board's own frozen copy, so the caller can't change main later
    main = deepFreeze(structuredClone(main));

    // One record, so no fact bypasses the chain
    const record = newRecord();

    // Facts name trees by hash; this gets them back
    const trees = new Map();

    // A release needs each base to see what changed
    const bases = new Map();

    // Items on main; every later release re-runs their bars
    const shipped = [];

    // Keep a private frozen copy under its hash, so facts can name it
    function store(tree) {

        // A copy, so the submitter can't change what a hash names after review
        const copy = deepFreeze(structuredClone(tree));

        // Derived from content, never chosen
        const hash = hashOf(copy);

        // A later release reads what a landed hash held
        trees.set(hash, copy);

        // Callers put it into facts
        return hash;
    }

    // One relation's facts for one item
    function itemFacts(relation, item) {

        // Relations are shared, so match the item too
        return record.facts().filter((fact) => fact[0] === relation && fact[1] === item);
    }

    // Run the frozen tests on exactly this tree and record the results
    function gate(treeHash, tree, paths) {

        // Clauses may share a test; one run is enough
        for (const path of new Set(paths)) {

            // A deleted test hashes as null, not passing by absence
            const test = Object.hasOwn(tree, path) ? tree[path] : null;

            // Hash what's there, so an edit shows
            const testHash = hashOf(test);

            // The board records it, not the builder's claim
            record.append('board', ['test_hash', treeHash, path, testHash]);

            // Names hash and tree, so it can't be reused
            if (outcome(tree, test) === 'pass') record.append('board', ['green', path, testHash, treeHash]);
        }
    }

    // Signed receipt 0 fixes the rules, so nobody swaps them quietly
    record.append(owner.name, ['genesis', RULES_ID, owner.pub], owner.privateKey);

    return {
        record,

        // Every fact, in order; what the checks read
        facts() {

            // A deep copy, so callers can't change the record
            return record.facts();
        },

        // The person freezes the bar before any code; red before runs at once
        freeze(item, clauses) {

            // A release later needs what this item changed
            bases.set(item, main);

            // Shows which main this bar was set against
            record.append(owner.name, ['base', item, store(main)]);

            for (const { clause, path, test } of clauses) {

                // The hash makes a later test edit visible
                record.append(owner.name, ['bar', item, clause, path, hashOf(test)]);

                // Only a wrong answer on main counts; a pass or a crash proves nothing
                if (outcome(main, test) === 'fail') record.append('board', ['red', item, path, hashOf(test)]);
            }

            // Builder starts with the exact frozen tests in place
            return { ...main, ...Object.fromEntries(clauses.map((clause) => [clause.path, clause.test])) };
        },

        // A builder submits; its word is never a fact, only what the board ran
        submit(item, builder, tree) {

            // The tree's hash, once its code proves hashable
            let treeHash;

            // Malformed builder code must not stop the board
            try {

                // Stored first so the submit fact names it
                treeHash = store(tree);
            } catch {

                // Unhashable code can't be named, so it goes back unrecorded
                return null;
            }

            // Named, so the builder can't approve this tree
            record.append(builder, ['submit', item, builder, treeHash]);

            // Only what the board runs is evidence, on the copy it stored
            gate(treeHash, trees.get(treeHash), itemFacts('bar', item).map((fact) => fact[3]));

            // Needed to review and land this exact tree
            return treeHash;
        },

        // A reviewer accepts one exact tree, so the accept can't move
        review(item, reviewer, treeHash) {

            // Named, so independence can be checked
            record.append(reviewer, ['accept', item, reviewer, treeHash]);
        },

        // Land only a proven tree; a refusal says what is lacking
        land(item, treeHash) {

            // A broken chain can't be trusted to judge anything
            if (brokenAt(record.receipts) !== null) return { ok: false, lacks: [['chain', 'record']] };

            // Refusal appends nothing, so no fake trace
            if (!isProvenAt(record.facts(), item, treeHash)) {
                return { ok: false, lacks: lacksForItem(record.facts(), item, treeHash) };
            }

            // Only the board records a landing, after the guard
            record.append('board', ['land', item, treeHash]);

            // Nothing stood in the way
            return { ok: true, lacks: [] };
        },

        // Release: every unit, and every earlier bar, proven merged
        release(release, items) {

            // Unlanded falls back to base, changing nothing
            const landedTree = (item) => trees.get(itemFacts('land', item).at(-1)?.[2]) ?? bases.get(item);

            // Only changes overlay, so no unit undoes another's
            const merged = items.reduce((tree, item) => ({ ...tree, ...changedPaths(bases.get(item), landedTree(item)) }), main);

            // The facts and the gate name it by hash
            const mergedHash = store(merged);

            // Anyone can re-derive which units it answers for
            for (const item of items) record.append('board', ['in_release', release, item]);

            // On the record before it is tested
            record.append('board', ['release_tree', release, mergedHash]);

            // Units proven alone can break each other or shipped work
            gate(mergedHash, trees.get(mergedHash), [...shipped, ...items].flatMap((item) => itemFacts('bar', item).map((fact) => fact[3])));

            // The derivation anyone runs decides, not a flag
            const ok = isReleased(record.facts(), release);

            // A failed release leaves main on proven code
            if (ok) main = merged;

            // Their bars now run in every later release
            if (ok) shipped.push(...items);

            // Computed reasons, so a refusal explains itself
            return { ok, lacks: lacksForRelease(record.facts(), release) };
        },
    };
}
