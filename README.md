# Autonomous Development Without Trusted Agents

How to trust agent-made work without trusting any agent.

- **What's correct belongs to the person.** That's the bar.
- **The machine holds agents to it.** So agents no one trusts can still do correct work.

![Pullboard at a glance](diagrams/0-at-a-glance.svg)

## Definitions

- **Bar:** what the person said. Agents can't change it.
- **Validate:** is the bar correct? The person's judgements.
- **Verify:** does the work meet the bar? The machine checks.

Any remaining ambiguity is a lack of clear definitions: specs, defined words, and so on.

## References

- Demo: https://coreyolson.github.io/pullboard-paper/demo/
- Paper: [WHITEPAPER.md](WHITEPAPER.md)
- Code: [proven.js](proven.js), checked by a separately written [verify.js](verify.js)
- Pullboard: https://pullboard.dev · https://github.com/pullboard-dev/pullboard

## Run

```
node run.js
```

Step through it: open [demo/index.html](demo/index.html); `node demo/trace.js` rebuilds it.

One function, `sum`, starts out returning 0, and the person freezes one clause: "sum(2, 3) is 5".
A builder changes the code, a reviewer checks it, and each item plays one way the work goes right or wrong.

| Item | Verdict | Why |
|---|---|---|
| Builder meets the bar | Landed | Red before, green after, accepted |
| Builder edits the frozen bar | Sent back | Frozen test changed |
| Test never red | Sent back | Passes whatever the code does |
| Builder reviews own work | Sent back | No independent review |
| Tree swapped after review | Sent back | Review was for another tree |
| Item with no bar | Sent back | Nothing was frozen to meet |
| Release breaks merged | Sent back | Fails once merged |
| Change breaks an earlier item | Sent back | An earlier item's test fails on the merged tree |
| Receipt tampered | Refused by verify | Chain no longer adds up |
| Bar gap | Landed, and wrong | Bar never asked about sum(0.5, 0.25) |

## Record format

The record is a list of receipts `{n, prev, by, fact, hash}`.
`hash` is SHA-256 of the canonical JSON of `[prev, by, fact]`; `prev` is the previous hash, or 64 zeros for receipt 0.
Canonical JSON: no whitespace, keys sorted by UTF-8 bytes, integers only (fractions as decimal strings).
Receipt 0 also carries `sig`, the person's ed25519 signature over its hash.
Each `fact` is a list named by its first entry:

| Fact | Fields |
|---|---|
| `genesis` | rules id, person's public key (hex) |
| `base` | item, base tree hash |
| `bar` | item, clause, test path, frozen test hash |
| `red` | item, test path, test hash (failed on the base) |
| `submit` | item, builder, tree hash |
| `test_hash` | tree hash, test path, hash of the test found there |
| `green` | test path, test hash, tree hash (passed on that tree) |
| `accept` | item, reviewer, tree hash |
| `land` | item, tree hash |
| `in_release` | release, item |
| `release_tree` | release, merged tree hash |
