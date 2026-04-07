# Why we built our own LLM benchmark (and what it told us)

**Frame:** Spacemolt is an MMO played by agents. Before we can ask interesting questions about which models can *play the game well*, we need to know which models can run on accessible hardware at all, and how they behave under simple, well-understood prompts. This post is about that prerequisite work — a personal prototype harness, an opening exploration, not a verdict.

**Target:** ~1200 words. Essayistic, inquisitive, "we did some work" register established in the opening.

---

## §1. Open *(drafted, ~205 words)*

A 128GB Mac, a folder full of models, and a question we kept failing to answer from the public leaderboards: which of these is actually worth running, here, on this hardware, for the work we actually do?

The leaderboards are not wrong, exactly — they're answering a different question. They tell you which model wins in a lab: measured at full precision, on accelerators most of us will never touch, against tasks chosen by someone whose work probably doesn't look much like yours. That's a useful number, but it isn't the number a person sitting in front of a Mac needs. The number we needed was smaller and more local: given the quantization that fits in our memory, the runtime we've actually installed, and the kinds of prompts we send a model in an average week, which of these twenty-odd files on disk earns its place there?

We didn't set out to build a benchmark. We set out to pick a model, found ourselves unable to defend any particular choice, and the benchmark is what accumulated in the gap between the question and an answer we could trust.

*(Note: §1 will be revised to drop "the work we actually do" framing — replaced by Spacemolt context introduced in §2.)*

---

## §2. The actual question, and why it isn't on any leaderboard *(~180 words)*

- Spacemolt is an MMO designed to be played by language model agents. Briefly, lightly — a sentence, not a pitch.
- The models we care about most are the small, accessible ones a player could plausibly run on their own machine. A game where only people with H100s can field competitive agents isn't the game we want to build.
- That makes our question very specific: *among the models that fit on consumer-ish hardware, which ones can reason clearly enough to be worth wrapping in a game loop?*
- Public benchmarks don't answer this. They measure full-precision models on tasks that look nothing like agent play, and they don't tell you anything about the speed/quality tradeoff at the quantization you'd actually run.
- (This post is about the prerequisite work — building something that can ask that question at all. The game-specific benchmarks come later, against a live server.)

---

## §3. What's actually in the folder *(~220 words)*

A small, concrete tour. The point: "what fits" is itself a finding, and the disk usage maps the territory we're working in.

- A 4-bit quantization of an 8B model is ~4GB on disk. A 32B is ~17GB. A 72B is ~38GB. A 122B MoE is ~65GB. DeepSeek R1 at 3-bit is 89GB.
- The whole cache is 577GB and growing. (Aside: this is the part of "running models locally" nobody warns you about.)
- The interesting band — the models a hobbyist might actually keep around — is 4–20GB. That's 7B–32B dense, plus the small MoEs.
- We pulled twenty-odd of those from `mlx-community` and the GGUF mirrors, biased toward recent releases (Qwen 2.5/3/3.5, DeepSeek R1 distills, Mistral Small variants, QwQ, Devstral) and a few larger anchors at the top of the range for comparison.
- Refrain seed: *the question isn't "is it smart" — it's "is it useful here."*

---

## §4. The harness, briefly *(~150 words)*

- Three Python files. `benchmark.py` orchestrates, `runner.py` shells out to each runtime (MLX and llama.cpp, paired), `report.py` renders the results into HTML with D3 charts.
- JSONL per `{model}__{runtime}` — diffable, re-runnable in subsets, never lost when something crashes at hour three.
- Captures gen t/s, prompt-processing t/s, wall time, peak GPU memory, and per-prompt scores in one pass.
- (This is a personal prototype. Bare-bones, opinionated, tuned to the questions we can answer today rather than the ones we want to answer eventually.)

---

## §5. The prompts, and what we're not yet asking *(~200 words)*

- Six categories: code, constraint, factual, logic, math, and a small Effect-TS section. Roughly 80 prompts, exec-scored where possible (Python assertions for code; regex/exact-match for the rest).
- Tiered by *concept difficulty*, not by how hard we expect models to find them. The inversions — when a tier-3 prompt scores higher than its tier-1 cousin — are themselves the signal.
- Multiple framings of the same task (direct, TDD, docstring, bugfix, noisy) to surface prompt sensitivity rather than letting a single phrasing decide the score.
- What's deliberately *not* in here: anything game-shaped. No multi-turn dialogue, no tool use, no state, nothing that looks like an agent loop. Those are the next layer of work, and they need a live server to run against.
- Be honest: this is a successful prototype of a comparison harness, not a finished evaluation of agent-readiness. The thing it proves is that the comparison is *possible*, repeatable, and cheap enough to re-run when a new model lands.

---

## §6. Three things the prototype told us anyway *(~250 words)*

Even at this early stage, the harness surfaced patterns worth naming:

- **Sparse beats dense at our hardware tier.** Qwen 3.5 35B-A3B (a small MoE, ~19GB on disk) scored 90% at 141 gen t/s on MLX. Every dense 32B in the suite was slower *and* lower-scoring. If you only have room for one model in the 15–20GB band, the MoE is the one.
- **The reasoning tax is uneven.** QwQ and the DeepSeek R1 distills generate 10–50× more tokens than non-reasoning peers for score gains concentrated on a handful of hard prompts. On a Mac, where every token has a wall-clock cost, that tradeoff looks very different than it does on a hosted API — and for an agent that needs to act inside a game loop, the calculus shifts again.
- **Runtimes aren't perfectly interchangeable.** MLX is faster than llama.cpp on almost everything we tested (often 1.3–1.8× on generation), and quality is mostly a wash. One model — Magistral Small 1.2 — produced very different scores across the two runtimes, which we mention only as a reminder to spot-check new models in both before trusting either.

Refrain callback: *the question isn't "is it smart" — it's "is it useful here."* None of these are final answers. They're the shape of the territory, sketched in pencil.

---

## §7. What comes next, and an oblique nod *(~150 words)*

- The next version of this work runs against a live Spacemolt server, with prompts that look like actual game states and scoring that reflects whether the agent's actions made sense.
- The harness in this post is the scaffolding for that. It's the part we needed to build first to make the second part tractable.
- And the models we're testing aren't the only thing being tuned for the job. One of our players has been quietly developing a small domain-specific language for describing sequences of interactions in Spacemolt — clearer, more precise instructions, designed so that a small model on a consumer machine has a fighting chance of acting intelligently. Better instruction is the other half of the equation, and it's happening in parallel.
- (We'll write about that work too, when it's ready.)

---

## §8. Close — invitation, not prescription *(~80 words)*

- We're not authorities. We had a question we couldn't answer, we built a small thing to start answering it, and the small thing has been generous with its early findings.
- If you're picking a model to live on your own machine — for a game, an agent, or just to see what's possible — the most useful eval is probably one you wrote yourself. Ours took a weekend. Yours could too.

---

## Notes on what shifted from the previous outline

- §3 is new — the disk-space tour, grounding the abstract "model selection" question in concrete file sizes
- §2 reframes the whole post around Spacemolt's prerequisite question rather than generic "our work"
- §5 is more honest about scope: prototype, not verdict; no game-shaped prompts yet
- Magistral stays a one-sentence aside, not a finding
- §7 adds the oblique nod to the DSL work without explaining it
- Total budget ≈ 1230 words, in range
