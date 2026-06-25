# Chat Templates

> _Last verified: 2026-06-25 against `28d7cb2` (llama.cpp build b9780, mlx-lm current)._

A chat template is the Jinja2 program that turns a structured `[{role, content}]`
message list into the exact token sequence a model was fine-tuned on. It is the
seam between "what the harness sends" and "what the model actually reads." A
template that is wrong, outdated, or missing does not crash — it degrades output
**systematically and silently**, which is the worst failure mode for a benchmark:
a capable model with a slightly-off template loses to a weaker model with a
correct one, and the scoreboard lies. This doc is the reference for how templating
works, how this harness handles it per backend, and the standing remediation
backlog.

## TL;DR — who applies the template

The harness sends raw OpenAI-style chat messages to each backend's
`/v1/chat/completions` endpoint and lets the **server** apply the template. The
harness never pre-renders a prompt string.

| Backend | Who renders the template | Default source | Is `chatTemplate` config wired? |
|---|---|---|---|
| **llamacpp** | `llama-server` | GGUF-embedded `tokenizer.chat_template`, else built-in fallback | **Yes** — resolves `templates/<name>.jinja` → `--jinja --chat-template-file` |
| **mlx** | `mlx_lm.server` | HF `tokenizer_config.json` `chat_template` (or external `chat_template.jinja`) | **No** — the field is silently ignored for mlx (see [Known gaps](#known-gaps--remediation-backlog)) |

The request shape the server receives is always the same
(`src/llm/chat-completion.ts`):

```jsonc
{
  "model": "...",
  "messages": [
    { "role": "system", "content": "<systemPrompt from system-prompts.yaml>" },
    { "role": "user",   "content": "<challenge item prompt>" }
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

Because the harness sends only `system` + `user` turns and **never tool calls or
assistant prefill**, several template features (tool-call formatting, multi-turn
alternation, tool-response conversion) are out of the request path entirely. This
narrows which template faults can actually affect a score — see
[gemma4](#the-gemma4-outdated-template-warning).

## How a chat template works

**What it is.** A Jinja2 string that inserts control tokens around each message so
a causal LM can see chat structure. Role markers differ by model family:

| Family | User / assistant markers | Turn-end token |
|---|---|---|
| ChatML (Qwen, many others) | `<|im_start|>user … <|im_end|>` / `<|im_start|>assistant` | `<|im_end|>` |
| Llama-3 | `<|start_header_id|>user<|end_header_id|>` … | `<|eot_id|>` |
| Gemma | `<start_of_turn>user … <end_of_turn>` | `<end_of_turn>` |
| Mistral / Tekken | `[INST] … [/INST]` | `</s>` |

These markers are **special tokens** — single vocab entries the model learned as
structural boundaries, not literal text. Rendering them as plain characters (wrong
template, or Jinja that doesn't execute) breaks the structure the model relies on.

**Where it is stored.**

- **GGUF / llama.cpp:** metadata key `tokenizer.chat_template`. A model may carry
  variants (e.g. a `tool_use` template).
- **HF / mlx:** `tokenizer_config.json` field `chat_template`, or an externalized
  `chat_template.jinja` file in the repo.

**Generation prompt.** Inference rendering appends the "assistant is about to
speak" tokens (`add_generation_prompt=true`). Without it some models continue the
user's turn instead of replying. Both backends set this on automatically.

### BOS/EOS and the double-BOS pitfall

Two independent layers can prepend a beginning-of-sequence token:

1. The tokenizer auto-prepends (`tokenizer.ggml.add_bos_token` in GGUF;
   `add_bos_token` in HF).
2. The template literally emits `bos_token` in its text.

When **both** fire, the prompt starts with two BOS tokens (e.g. Llama-3
`[128000, 128000, …]`), which measurably degrades coherence with **no error
shown**. llama.cpp warns when it can detect it (`"prompt also starts with a BOS
token … now the final prompt starts with 2 BOS tokens"`), but detection is not
guaranteed. Exactly one layer should own BOS. The symmetric double-EOS bug exists
when a template and `add_eos_token` both append a turn-end token.

Detect by tokenizing a known string and inspecting the leading ids (see
[Verification](#verification--detection)).

## llama.cpp specifics (build b9780)

### Jinja is enabled by default

On current `llama-server`, `--jinja` is **on by default**; you opt out with
`--no-jinja`. This is the opposite of older guidance that said you must *add*
`--jinja` to honor an embedded template — the default flipped. Two consequences:

- A plain GGUF with an embedded Jinja template renders correctly with no flags.
- The harness still passes `--jinja` explicitly **whenever** it supplies
  `--chat-template-file` (`src/llm/servers/llamacpp.ts:79-81`). That is correct
  and belt-and-suspenders: a non-built-in custom template file is only accepted as
  arbitrary Jinja when `--jinja` is active.

Because this default is version-sensitive, treat "jinja on" as a property of the
pinned llama.cpp build, and re-check it on every llama.cpp upgrade.

### The flags

| Flag | Effect |
|---|---|
| `--jinja` / `--no-jinja` | Select the full Jinja engine (minja) vs the legacy C++ template matcher. Default: jinja **on** for server. |
| `--chat-template <name\|jinja>` | Override with a built-in *named* template (validated), or arbitrary Jinja if `--jinja` is set first. |
| `--chat-template-file <path>` | Override with a `.jinja` file. Same accept-rules as above. Writes the same field as `--chat-template`; **last one on the command line wins**. |

### Selection precedence

`explicit override (--chat-template[-file]) > embedded GGUF template > built-in
ChatML fallback`. The embedded template is always *found* regardless of the jinja
flag; the flag only decides **how it renders**:

- **minja (jinja on):** actually executes the template's loops/conditionals and
  drives the tool-call / reasoning parsers.
- **legacy (`--no-jinja`):** pattern-matches the template *source* against a fixed
  set of known formats and emits a hardcoded equivalent. A complex custom template
  is degraded to a guessed format or hard-errors (`"this custom template is not
  supported, try using --jinja"`). It is never actually executed.

### The gemma4 "outdated template" warning

Loading a gemma-4 GGUF whose embedded template predates the current official one
emits:

```
common_chat_try_specialized_template: detected an outdated gemma4 chat template,
applying compatibility workarounds. Consider updating to the official template.
```

What happens: llama.cpp identifies the template as gemma4 (by an internal marker),
notices it lacks the newer official sentinel, logs the warning, calls
`workaround::convert_tool_responses_gemma4(messages)`, and then renders through the
same gemma4 handler the official template uses. **The workaround only rewrites
tool-response messages.**

For this harness that makes the warning **benign in practice**: our requests carry
no tool responses, so the conversion is a no-op and the rendered system+user
prompt is expected to be byte-identical to the official-template path. It is
*benign-but-worth-confirming*, not *ignore-forever* — before treating it as a
no-op, confirm with an `/apply-template` diff (below). Pin the official template
only if the rendered prompt actually differs.

Affected active entries: `gemma-4-e4b-llamacpp`, `gemma-4-26b-a4b-llamacpp`,
`gemma-4-31b-llamacpp`, `gemma-4-31b-llamacpp-q8`.

### The "no embedded template" failure (official `mistralai/*-GGUF`)

Mistral's canonical tokenization lives in `mistral_common` (the Tekken tokenizer),
which goes message→tokens directly, so official `mistralai/*-GGUF` repos ship **no
`tokenizer.chat_template`**. llama-server then falls back to a default/ChatML
template, the model receives improperly-delimited prompts, and output collapses to
base-model-quality rambling — **with no error**, which makes it hard to spot.

Fix: supply the missing template with `--jinja --chat-template-file <official.jinja>`.
In this harness that is the `chatTemplate` field. The one official-Mistral GGUF in
the active roster, `magistral-small-2509-llamacpp`, is handled this way:

```yaml
- id: magistral-small-2509-llamacpp
  artifact: mistralai/Magistral-Small-2509-GGUF
  runtime: llamacpp
  chatTemplate: mistral-v7-tekken   # → templates/mistral-v7-tekken.jinja
```

Community GGUFs (bartowski, unsloth) generally **do** embed templates, so
`mistral-small-3.2-24b-llamacpp` (bartowski) and the inactive unsloth Devstral /
Mistral-Small-4 entries do not need a vendored template. The standing rule: **any
official `mistralai/*-GGUF` added to llamacpp needs a vendored `chatTemplate`** —
verify embedded-template presence with `gguf-dump` before adding it active.

## mlx specifics

`mlx_lm.server` renders via HF `tokenizer.apply_chat_template(...)` sourced from
the model directory's `tokenizer_config.json` / `chat_template.jinja`
(generation-prompt always on). With no template at all it falls back to a plain
role-mapping concatenation.

Override flags `mlx_lm.server` accepts (passable today via the `extraArgs` field):

| Flag | Effect |
|---|---|
| `--chat-template <str>` | Inject a template *string*, overriding the model's built-in. |
| `--use-default-chat-template` | Force the tokenizer's default template. |
| `--chat-template-args <json>` | JSON kwargs forwarded into `apply_chat_template` (e.g. `{"enable_thinking": false}`). |

`--trust-remote-code` is also an `extraArgs` flag, required when a model ships a
custom tokenizer class via `auto_map` (a `tokenization_*.py`); without it
`AutoTokenizer` refuses to load the repo's Python and the tokenizer fails. Two
active entries use it after a source audit of the custom code:
`hunyuan-a13b-mlx`, `kimi-linear-48b-a3b-mlx`.

Note the asymmetry with llamacpp: mlx's override flag takes a template **string**,
not a file path, so the `chatTemplate` → `templates/<name>.jinja` mechanism does
not transfer directly. See [Known gaps](#known-gaps--remediation-backlog).

## Why fidelity matters for scoring

Template faults bias scores **systematically**, not randomly, which is what makes
them invalidate cross-model comparison:

| Fault | Symptom | Score impact |
|---|---|---|
| Malformed turn boundaries | Model continues the user's turn / role-plays both sides | Answer buried or absent → graded wrong, looks like a reasoning failure |
| Dropped system slot | System text merged into the user turn or discarded | Uniform penalty on instruction-following, mistaken for low capability |
| Wrong / missing turn-end token | Never stops; runs to `max_tokens` past the answer | Truncation, wasted budget, runaway output |
| Leaked template literals | Raw `<|im_start|>`, `[INST]`, `{{ }}` in output | Exact-match / regex graders fail despite correct substance |
| Double BOS | No visible marker; subtly worse coherence | Uniformly lowers quality with no error — blamed on the model |

## Verification & detection

The harness owns no template-verification step today; these are the manual checks.
Prefer the live endpoints over log-scraping.

**What template is actually loaded** (`llama-server`):

```bash
curl -s http://127.0.0.1:<port>/props | jq -r '.chat_template'
```

**Render a canonical conversation without inference** — eyeball delimiters, a real
system slot, a trailing assistant header, and the absence of literal `{{` / `{%`
(unrendered Jinja means the parser could not execute it):

```bash
curl -s http://127.0.0.1:<port>/apply-template \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"system","content":"You are terse."},{"role":"user","content":"Hi"}]}' \
  | jq -r '.prompt'
```

Use this to confirm the gemma4 warning is a no-op: diff the rendered prompt against
one produced with the current official template via `--chat-template-file`.

**Confirm a single leading BOS** (detect double-BOS):

```bash
curl -s http://127.0.0.1:<port>/tokenize \
  -H 'Content-Type: application/json' -d '{"content":"<bos>hello"}' | jq '.tokens'
```

**Offline — dump or check a GGUF's embedded template:**

```bash
gguf-dump --no-tensors --json model.gguf | jq -r '.metadata["tokenizer.chat_template"].value'
gguf-dump --no-tensors --json model.gguf | jq '.metadata | has("tokenizer.chat_template")'  # false = missing
```

## Current roster status

| Model(s) | Backend | Template handling | Status |
|---|---|---|---|
| `magistral-small-2509-llamacpp` | llamacpp | Vendored `mistral-v7-tekken.jinja` via `chatTemplate` | Handled |
| `gemma-4-*-llamacpp` (e4b, 26b-a4b, 31b, 31b-q8) | llamacpp | Embedded GGUF template; b9780 logs the outdated-template warning | Benign for our request shape; confirm via `/apply-template` |
| `mistral-small-3.2-24b-llamacpp` | llamacpp | Embedded (bartowski GGUF) | Expected OK; verify with `gguf-dump` |
| `hunyuan-a13b-mlx`, `kimi-linear-48b-a3b-mlx` | mlx | Embedded HF template; `--trust-remote-code` via `extraArgs` | Handled |
| all other entries | both | Embedded template, no override | No known issue |

## Known gaps & remediation backlog

Ordered by priority.

1. **`chatTemplate` is silently ignored for mlx.** The field decodes on any
   configuration but only the llamacpp factory consumes it
   (`src/cli/deps.ts`); the mlx factory drops it. Setting it on an mlx model is
   decorative config. **Fix:** either (a) fail-fast at decode when `chatTemplate`
   is set on a `runtime: mlx` entry, so it can never be silently ignored, or (b)
   wire it through by reading `templates/<name>.jinja` and passing its contents to
   `mlx_lm.server --chat-template <string>`. Option (a) is the minimum; (b) only if
   an mlx model is found to need an override.

2. **No startup template-verification gate.** A wrong/missing template is currently
   invisible until someone reads outputs. **Fix:** after a backend reports healthy,
   assert via `/props` + `/apply-template` that the rendered canonical conversation
   has a real system slot, correct delimiters, no literal Jinja, and exactly one
   BOS — fail the run loudly otherwise. Turns every fault in the table above from a
   silent score-skew into an abort.

3. **`--jinja` is not pinned for plain llamacpp models.** Models without a
   `chatTemplate` inherit llama.cpp's default (jinja on at b9780). A future
   llama.cpp upgrade that flips the default would silently change rendering. **Fix:**
   pass `--jinja` (or `--no-jinja`) unconditionally in `buildArgs` so behavior is
   reproducible across upgrades.

4. **No per-model embedded-template assertion for official `mistralai/*-GGUF`.**
   The no-template failure is contained today by convention, not enforcement.
   **Fix:** a config-load or CI check that any `mistralai/*-GGUF` llamacpp entry
   either sets `chatTemplate` or is verified (via `gguf-dump`) to embed one.

## References

- HF chat templating: <https://huggingface.co/docs/transformers/main/en/chat_templating>
- llama.cpp template selection & engines: `common/chat.cpp`, `common/arg.cpp`, `common/common.h` (master ≈ b9780)
- llama-server endpoints (`/props`, `/apply-template`, `/tokenize`): <https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md>
- gemma4 parser path: llama.cpp PR #21326, follow-up #21704
- Mistral tokenization (why official GGUFs ship no template): <https://docs.mistral.ai/cookbooks/concept-deep-dive-tokenization-chat_templates>
- mlx-lm server template handling: <https://github.com/ml-explore/mlx-lm> (`mlx_lm/server.py`)
- Double-BOS background: <https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct/discussions/97>

Harness code: `src/llm/chat-completion.ts` (request), `src/llm/servers/llamacpp.ts`
+ `src/llm/servers/mlx.ts` (spawn args), `src/cli/deps.ts` (factory wiring),
`src/llm/servers/resolve-chat-template.ts` (template resolution),
`templates/*.jinja` (vendored templates).
