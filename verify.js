// verify.js — a second, separately written checker: re-derives "proven" from the receipts alone.
// Never imports proven.js; written from the paper's checks (WHITEPAPER.md, sections 3 and 4) and the record format (README.md).

// Dependencies
import { createHash, createPublicKey, verify as checkSignature } from 'node:crypto';

// The only rules this checker knows; any other genesis is refused
const KNOWN_RULES = 'pullboard-proven/1';

// DER prefix that wraps 32 key bytes as an SPKI key
const ED25519_PUBLIC_PREFIX = '302a300506032b6570032100';

// SHA-256 as hex; every receipt hash is this over canonical JSON
function sha256(text) {

    // Bytes, not characters, are hashed; pin them to UTF-8
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Canonical JSON, whole so it can be checked on its own
function encode(value) {

    // The type picks the canonical form
    switch (typeof value) {

        // Borrow JSON's string escapes; they never vary
        case 'string': return JSON.stringify(value);

        // Spelled out, not however the language prints it
        case 'boolean': return value ? 'true' : 'false';

        // Non-integers and giants have no portable spelling
        case 'number':

            // Refuse rather than guess a spelling
            if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error('not canonical');

            // Plain decimal, never an exponent
            return value.toFixed(0);

        // null, array or object: typeof can't tell them apart
        default:

            // typeof calls null an object, so catch it first
            if (value === null) return 'null';

            // Arrays keep their order: position carries meaning
            if (Array.isArray(value)) return '[' + value.map(encode).join(',') + ']';

            // Keys sorted by UTF-8 bytes, the one portable order
            return '{' + Object.keys(value)
                .map((key) => [Buffer.from(key), key])
                .sort((a, b) => Buffer.compare(a[0], b[0]))
                .map(([, key]) => JSON.stringify(key) + ':' + encode(value[key]))
                .join(',') + '}';
    }
}

// Index facts so each check is a lookup, not a scan
function indexFacts(facts) {

    // A Set compares text, so store each fact as JSON
    const whole = new Set(facts.map((fact) => JSON.stringify(fact)));

    // Grouped once, so checks never scan the record
    const byRelation = new Map();

    // A check already knows its relation, so split it off
    for (const [relation, ...rest] of facts) {

        // A relation's first fact needs its list made
        if (!byRelation.has(relation)) byRelation.set(relation, []);

        // Just the columns the checks read by position
        byRelation.get(relation).push(rest);
    }

    // The only two questions the checks ask
    return {

        // Every column must match, not just a prefix
        recorded: (...fact) => whole.has(JSON.stringify(fact)),

        // Empty list, so a check never meets undefined
        rows: (relation) => byRelation.get(relation) ?? [],
    };
}

// Re-derive proven items and releases; shares no code with the board
function deriveProven(facts) {

    // All reads go through these two lookups
    const { recorded, rows } = indexFacts(facts);

    // Path and hash of each test frozen for an item
    function frozenTests(item) {

        // Never judge one item by another's tests
        return rows('bar').filter(([barItem]) => barItem === item).map(([, , path, testHash]) => [path, testHash]);
    }

    // Does this tree meet the item's bar, by every check?
    function provenOn(item, tree) {

        // Who offered exactly this tree for this item
        const builders = rows('submit').filter(([i, , t]) => i === item && t === tree).map(([, builder]) => builder);

        // Never submitted, so never offered for judgment
        if (!builders.length) return false;

        // Every test frozen for this item, path and hash
        const tests = frozenTests(item);

        // Nothing frozen means nothing to meet, so refuse
        if (!tests.length) return false;

        // Any one gap on any frozen test sinks the tree
        for (const [path, testHash] of tests) {

            // The tree must carry the test as it was frozen
            if (!recorded('test_hash', tree, path, testHash)) return false;

            // A test that never failed can't show the change
            if (!recorded('red', item, path, testHash)) return false;

            // The pass must be on this tree, not a neighbour
            if (!recorded('green', path, testHash, tree)) return false;
        }

        // Only accepts naming this very tree count
        const reviewers = rows('accept').filter(([i, , t]) => i === item && t === tree).map(([, reviewer]) => reviewer);

        // Each builder needs an accept from someone else
        return builders.every((builder) => reviewers.some((reviewer) => reviewer !== builder));
    }

    // Done means landed, and landed on a tree that holds up
    function isProven(item) {

        // An unlanded tree, however good, is not done
        return rows('land').some(([i, tree]) => i === item && provenOn(item, tree));
    }

    // Walk releases in build order, tracking main
    function heldReleases() {

        // What main carries so far, which none may turn red
        const onMain = new Set();

        // Releases found to hold, in the order they were built
        const held = [];

        // Each release once, at the place of its first build
        for (const release of new Set(rows('release_tree').map(([r]) => r))) {

            // This release's own items
            const units = rows('in_release').filter(([r]) => r === release).map(([, item]) => item);

            // Built more than once? Every merged tree must hold
            const mergedTrees = rows('release_tree').filter(([r]) => r === release).map(([, tree]) => tree);

            // True when an item's whole bar is green on every build
            const greenEverywhere = (item) => mergedTrees.every((tree) =>
                frozenTests(item).every(([path, testHash]) => recorded('green', path, testHash, tree)));

            // Each item proven, and every bar green when combined
            const holds = units.every((item) => isProven(item) && greenEverywhere(item)) && [...onMain].every(greenEverywhere);

            // A release that fails leaves main as it was
            if (!holds) continue;

            // Kept, so the caller can list it
            held.push(release);

            // From now on its items count as shipped
            for (const item of units) onMain.add(item);
        }

        // Sorted by the caller, like the proven list
        return held;
    }

    // Dedupe repeat landings; sort so every run matches
    const proven = [...new Set(rows('land').map(([item]) => item))].filter(isProven).sort();

    // Never built means no merged tree to hold
    const released = heldReleases().sort();

    // The caller prints both
    return { proven, released };
}

// Check chain, head, genesis, signature, then re-derive; stops at the first refusal
export function verify(receipts, { person, head }) {

    // The chain starts from an all-zero link
    let previous = '0'.repeat(64);

    // In order, so the first break found is the earliest
    for (const [n, receipt] of receipts.entries()) {

        // A bad back-link: something added, dropped or moved
        if (receipt.prev !== previous) return { ok: false, why: 'order', at: n };

        // Content no longer matches its hash: rewritten
        if (sha256(encode([receipt.prev, receipt.by, receipt.fact])) !== receipt.hash) return { ok: false, why: 'altered', at: n };

        // Chain to this hash, not what the next claims
        previous = receipt.hash;
    }

    // A full re-hash passes the loop but can't match the person's head
    if (!receipts.length || previous !== head) return { ok: false, why: 'head' };

    // The first receipt names the rules and the signer
    const [kind, rulesId, key] = receipts[0].fact;

    // Other rules mean another proven; another key, another person
    if (kind !== 'genesis' || rulesId !== KNOWN_RULES || key !== person) return { ok: false, why: 'genesis' };

    // Wrap the raw key bytes so Node will accept them
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from(ED25519_PUBLIC_PREFIX, 'hex'), Buffer.from(key, 'hex')]), format: 'der', type: 'spki' });

    // A missing sig becomes empty bytes, failing not crashing
    const signed = checkSignature(null, Buffer.from(receipts[0].hash, 'utf8'), publicKey, Buffer.from(receipts[0].sig ?? '', 'hex'));

    // An unsigned genesis could be anyone's, so trust nothing after
    if (!signed) return { ok: false, why: 'signature' };

    // Facts on an untrusted chain prove nothing, so read them last
    return { ok: true, ...deriveProven(receipts.map((receipt) => receipt.fact)) };
}
