# Pullboard: Autonomous Software Development Without Trusted Agents

Corey Olson

[pullboard.dev](https://pullboard.dev)

**Abstract.** Software agents write code faster than a person can read it, so neither reading every change nor trusting the agents' reports scales. A method is described in which no agent's report about its own work is trusted: before any code exists, the person states what the work must do, and that statement is frozen as tests. The frozen tests must fail before the change and pass after it on the exact tree that lands, someone other than the builder must accept that tree, and one declarative rule over a hash-chained record derives whether the work is proven. Proven units combine only when proven again together, and because the record names the fixed rules it is judged by, anyone can re-derive the verdict. Whether the person asked for the right thing is the one judgement the method leaves to the person.

## Definitions

- **Item:** a bar, a change, and the facts that connect them.
- **Clause:** one plain statement of what the work must do.
- **Bar:** an item's clauses as frozen tests, changed only by the person.
- **Builder, reviewer:** the agent that makes the change; a different agent that accepts it.
- **Proven:** meets its frozen tests under Section 3's checks; not formal verification.
- **Landed, sent back:** proven and accepted; or refused, each missing fact a reason.
- **Release:** landed items proven again together; only a release moves main.
- **Record:** the append-only, hash-linked log of what the board ran.

## 1. Introduction

Agents produce changes faster than anyone can check them, and tests do not close the gap, because agents write those too. An agent can edit a test until it agrees with its code, write a test that passes whatever the code does, approve its own work, get one tree approved and land another, or pass on a retry what failed the first time. Two changes that each pass can break each other, and the record of all of this can be edited afterwards. None of it needs malice.

The method moves trust onto the one input only a person can supply, freezes it, and measures everything after it against that input, mechanically and re-checkably.

## 2. The bar

Every piece of work raises two questions, and each has its own owner. Validation belongs to the person; verification belongs to the machine [8]. Validation asks whether it is the right thing to build. For a product that does not exist yet, the only answer key is the judgement of the person who asked for it. Verification asks whether the work does what was asked. Once the asking is precise, a machine can answer it, if it is testable.

The person's answer to validation is the bar: a short list of plain-language clauses, each read once, by an agent other than the builder, into a test that encodes it, plus the person's own given-and-expected cases where the person can supply them. The bar is frozen when a builder agent claims the item. From then on, agents are judged against the frozen tests, not against their own reading of the words. Only the person can change a frozen bar.

The agent writing a test is a translator: it turns the person's words into a constraint a machine can check, before any code exists and for a change it will not make. It has nothing to fit the test to and nothing to gain from weakening it; its only job is to say, in a form a machine can run, what the person meant. The order is what makes this work. The usual habit is to write the code and then tests that show it works; here, as in test-driven development [3], the test comes first, so it can only encode the request. And because translating is kept apart from building, no agent both sets a test and gains from passing it.

The translation can still be wrong: an honest agent can misread the person's words. Two habits catch most of that before any code exists. The person can agree the bar with a second person, so two readings meet before it freezes. And anyone, person or agent, can go bar hunting: reading a bar for what it never asks, and turning each find into a new clause, a practice called bar sharpening.

### Faithful translation

Everything after the freeze is checked by machine; the translation from words to test is the one step that rests on an agent's judgement. It can be checked too, before any code exists:

- **Examples:** the test's cases as plain inputs and outputs, for the comparing agent.
- **Back-translation:** an agent reads only the test and says in English what it checks.
- **Two translators:** two models write the test; if they differ, the clause is re-translated.
- **An adversarial builder:** an agent tries to pass the test with code that breaks the request.
- **The person's own cases:** "given this, expect that" skips translation entirely.

![Back-translation](diagrams/6-back-translation.svg)

Back-translation works because the back-translator never sees the request, only the test's cases, so it can describe only what those cases check. A misreading then shows as a mismatch, and slips through only when the back-translation is too vague to tell the readings apart, or a second agent makes the matching mistake. Each further check adds another independent error that would have to match, so the odds multiply, the way reliable circuits are built from unreliable parts [10], as long as the agents fail independently; different model families make that likelier [9]. A request with two fair readings is settled by none of them, and becomes a ruling.

## 3. One unit of proven work

One unit of work is one item: (i) a bar, (ii) a change, and (iii) the facts that connect them. It is the smallest piece the method can prove, and everything larger, releases and dependencies alike, is built from it. Four facts prove a unit, each bound to the exact tree that lands, and none from the builder's own report.

![How one unit of work is proven](diagrams/1-one-unit.svg)

The tests are frozen before the code, and the freeze hashes everything they read, from helpers and fixtures to dependencies and tooling, since a test can be rigged from outside its own file. Each frozen test must then fail before the change, on its own assertion, because a test that passes or crashes on the base proves nothing. It must pass after the change, on the exact tree that will land, with the base's tooling and no skips or retries.

A test for something not yet built is first run against a placeholder: an empty function with the right name and inputs, put where the real code will go. The test reaches its assertion and fails there. A clause that already holds on the base is not new work: it belongs to an earlier bar, which keeps running (Section 4), so an item's bar asks only for what changes.

Finally, someone other than the builder must accept that same tree. One rule decides: a unit is proven on a tree only when nothing is lacking, and then it lands; otherwise it is sent back, each missing fact its reason:

```
lacks(item, tree), for a tree submitted for the item:
  bar, item               unless the item has at least one frozen clause
  for each clause of the item's frozen bar:
    frozen_test, clause   unless the test's hash on tree equals the frozen hash
    red_before, clause    unless a red receipt shows the frozen test failed at the base
    green_after, clause   unless a green receipt shows the frozen test passed on tree
  independent, review     unless someone other than the builder accepted tree
proven_at(item, tree) = tree was submitted for item, and lacks(item, tree) is empty
proven(item)          = item landed on a tree, and proven_at(item, that tree)
```

Landing's only guard is this rule, and the lander cannot force or swap the reference it lands on.

## 4. Composition

Proof does not compose for free. Two units, each proven on its own base, can break each other with no textual conflict, and a unit proven against a dependency is undone when that dependency is reverted or changed.

![How proven units combine](diagrams/2-composition.svg)

Units therefore combine like logic gates. A release is all-of: every unit in it is proven, and every unit's bar passes again on the exact merged tree, together with the release's own clauses and the full suite. A dependency is after-of: a dependent lands only after its dependency, and a revert or new version of the dependency sends the dependent back until it is proven again. A new request that contradicts an earlier clause cannot land until the person amends or retires that clause; only the person can stop an earlier bar from running.

Main moves only when the combined tree is proven:

```
lacks_release(release), for each unit in the release:
  unit_proven, unit    unless proven(unit)
  merged_green, unit   unless every frozen test of unit has a green receipt on the merged tree
and for each item already on main:
  earlier_green, item  unless every frozen test of item has a green receipt on the merged tree
release_ok(release) = the merged tree was built, and lacks_release(release) is empty
```

The release receipt links every unit receipt by hash, so a replayed or substituted receipt breaks the link, and re-running the suite on the release tree catches a receipt that is well signed but false.

## 5. Where wrong work goes

Agents are often wrong or incomplete, so the method assumes they are. Most wrong work fails its frozen tests and goes back to the builder. Because each clause is read only once, into a frozen test, what survives has two expected exits, each with an owner.

![Where wrong work goes](diagrams/3-wrong-work.svg)

The first exit is a bar gap: the work is wrong in a way that the bar never asked about. It goes back to the person, who wrote the bar. The second exit is a weak test: it failed before the change and passes after, but bad code would pass it too. An agent strengthens the test, sometimes by inferring what the person originally meant, or by asking the person for clarification. The stronger test replaces the frozen one only when the person rules it in.

Two checks expose weak tests. Mutation testing [4] plants small bugs in the code and counts how many the test catches. Held-out cases, ideally written by the person, are tests the builder never saw, so code shaped only to pass the visible tests fails them. Beneath both exits sits fast recovery. A revert lands like any other change, so wrong work leaves the way it came in.

## 6. Trust and the record

A system that trusts nothing produces nothing. Something has to be taken as given: the hashes that name the code, the rules that define proven, and the bar itself. The method keeps that trust to three small sources, and makes everything built on them checkable by anyone holding the record.

![Where trust comes from](diagrams/4-trust.svg)

Some trust is borrowed: git names every tree by its hash, so a verdict binds to exactly one tree. Some is seeded once: the person signs the record's first entry, which names the rules, so no agent can change what proven means. Some is seeded always: each bar is the person's fresh judgement.

Starting from those three sources, the checks turn work into proven units. Units may be built in parallel, but their facts go into one record, in order, each entry linked by hash to the one before. The record holds only what the board ran: freezes, test runs, submissions, approvals and landings. Nothing an agent says about its own work is in it.

So anyone can re-check the board's verdict on any item, Landed or Sent back. A second checker, written separately from the board (independent versions can still share mistakes [9]), replays the record against the same rules; if it agrees, nobody had to trust the board's reasoning. The facts themselves rest on the runners' signatures. Nor can the record be quietly changed: editing any entry breaks the chain, and rebuilding the chain changes its final hash, which the person keeps.

The test runs and the checker need trust too, the oldest problem in this area [7]. Runners sign their results [5, 6] with keys the jobs cannot reach, an outside runner needs a second to agree, and the checker is small, signed, and never changed by the work it judges.

## 7. Limits

Agent judgement enters the method in two places: reading each clause into a test, and reviewing the result. Everything after the freeze is mechanical. Each limit falls to (a) the person's judgement or (b) a guard outside the method.

The method proves that work meets the bar, not that the bar is right; what the bar never asks, it never proves. Composition has the same limit: a break between units that no test looks at is a bar gap. The tests have a limit too. Mutation scores are sampled, and held-out cases are only as good as whoever wrote them. A test that reads the clause wrongly, rather than weakly, passes every mechanical check; only a reviewer, the person's own examples, or a later bar exposes it.

The board's own limits are mechanical. A wrong verdict from it is caught afterwards by the second checker, not prevented, and the branch that work lands on must be protected by something the lander cannot reach. Reviewer independence holds only as far as agent identities do: two names an agent can choose freely, or two copies of the same model, are not independent.

Agents writing the visible tests and the held-out ones can share a blind spot, but only on the newest item: every earlier bar still runs, so the room for error shrinks as bars accumulate. The method is autonomous the way a factory is, and like a factory its output is still spot-checked: the person validates the application, not each test, by using it and checking what it produces.

Whatever a spot check finds wrong becomes a new item with a new clause, so each gap is caught once and stays caught. The checks the person keeps repeating can further become clauses, in turn automating the monitoring itself. That leaves a natural role for engineers: inspectors of the factory, asking how its agents could be wrong or lying, and turning each answer into a new constraint of the same kind.

This is called *ordinal software engineering*, named for its orders: agents build the software in the first order, and engineers build and inspect the factory in the second. Agents are temporary; the order they work inside persists and owns the work. In essence, software development becomes more about building the machinery around the machine. The method herein is the piece that turns agent work into proof that it meets the person's bar; whether that proof is enough stays the person's judgement.

![Ordinal software engineering](diagrams/7-ordinal.svg)

## 8. What correct means

Correct cannot mean perfect, nor complete. Code can be free of technical error and still wrong in intent, and intent is only ever as precise as the request, which no one can make perfectly specific. The method makes the work correct to intent: faithful to what was asked, and then held to a stated testing standard.

Requests leave openings, as laws do. No legislator anticipates every case; when one falls through, a judge interprets and the law is amended, and here the amendment is a new clause. A test faithful to the request but silent on a case it never named is not a failure of the method; it is the request asking to be sharpened. A bug that survives the tests is a misread clause, a weak test, or behaviour nobody defined. The first two are fixed by sharpening the test; for the last, the solution is simple: define it.

Agents can be trusted to write the tests because of the process around them: each test is written first, by an agent other than the builder, then frozen, and must fail before the change and pass after it (Sections 2 and 3). So the real question is the standard the tests are held to. For example: every part of a clause has a case that fails without it, and the machine enforces this on every item. Once it does, agents can develop autonomously: the person sets the bar and the standard, and no one has to watch the work in between.

No testing standard catches every edge case; each one found sharpens the bar for everything after it. Agents lower the cost of the surface of software, but not of its depth, which is experience: the edge cases found and closed over time, which become the edge of whoever holds them.

## 9. Implementation and evidence

Pullboard ([pullboard.dev](https://pullboard.dev)) implements a form of the method: a board that agents claim work from, build against and submit to, where items of work land only when its rules and configuration allow.

![The whole machine](diagrams/5-whole-machine.svg)

Around the proof, Pullboard adds the rest of the machinery: objectives decide what comes first, a speed-versus-certainty setting decides when proof happens, and capacity decides how hard the factory runs.

A reference implementation sits beside this paper. [proven.js](proven.js), about 280 lines of code, holds the hashing, the checks, the record and the moves; [verify.js](verify.js), about 90 lines of code and written separately, re-derives every verdict from the record. It shows the core rule in miniature; hashing every input a test reads, mutation testing, held-out cases, dependencies and signed runners are left out of it. [run.js](run.js) plays ten items, an honest one and one for each failure named above. The attached repo also contains a [demo/](demo/index.html) with steps to illustrate the process.

The evidence is practice, not a controlled study. Two products built this way are in real use: an options trading system, built with an earlier and coarser form of the method, that trades real money, and then Pullboard itself, which its users use to autonomously develop software. In both, being wrong costs something real.

## 10. Related work

Pullboard came from building real products with agents, not from the literature. The work below was found afterwards and is complementary reading, not a source, and the list is not exhaustive.

Proof-or-Stop [1] and Agile-V [2] share the starting point of trusting evidence over agents. The individual mechanisms have their own histories: test-driven development [3], mutation testing [4], signed provenance [5, 6], trusting the checker [7], validation versus verification [8], and reliable systems from unreliable parts [10]. This paper claims no priority over any of them; its claim is only that the method, and earlier iterations of it, have built real products.

## 11. Conclusion

Agents can run unattended because nothing they say counts as evidence: only frozen tests, results bound to trees, and a signed rule over the record decide what lands. Every verdict against the bar can be re-derived by anyone. The bar is the one judgement left to the person, who keeps it honest the way any factory owner does: by spot-checking the output and turning whatever is wrong into new bars.

*This paper and its reference code were written with AI assistance.*

## References

[1] J. Huang, J. Hsia, J. Sun, F. Shi, W. Huang and I. H. White. "Proof-or-Stop: Don't Trust the Agent, Trust the Evidence -- Loop Engineering for Verifiable Evidence-Gated Lifecycle Control." arXiv:2607.14890, 2026.

[2] C. Koch. "From Agent Output to Authorized Transition." arXiv:2609.28216, 2026. (Presents the Agile-V Assurance Spine.)

[3] K. Beck. *Test-Driven Development: By Example.* Addison-Wesley, 2002.

[4] R. A. DeMillo, R. J. Lipton and F. G. Sayward. "Hints on Test Data Selection: Help for the Practicing Programmer." *Computer* 11(4):34–41, 1978.

[5] OpenSSF. SLSA: Supply-chain Levels for Software Artifacts. https://slsa.dev

[6] S. Torres-Arias, H. Afzali, T. K. Kuppusamy, R. Curtmola and J. Cappos. "in-toto: Providing farm-to-table guarantees for bits and bytes." 28th USENIX Security Symposium, 1393–1410, 2019.

[7] K. Thompson. "Reflections on Trusting Trust." *Communications of the ACM* 27(8):761–763, 1984.

[8] B. W. Boehm. "Verifying and Validating Software Requirements and Design Specifications." *IEEE Software* 1(1):75–88, 1984.

[9] J. C. Knight and N. G. Leveson. "An Experimental Evaluation of the Assumption of Independence in Multiversion Programming." *IEEE Transactions on Software Engineering* SE-12(1):96–109, 1986.

[10] J. von Neumann. "Probabilistic Logics and the Synthesis of Reliable Organisms from Unreliable Components." In C. E. Shannon and J. McCarthy (eds.), *Automata Studies*, Annals of Mathematics Studies 34, 43–98. Princeton University Press, 1956.
