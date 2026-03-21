# Benchmarking Local LLMs

_Guide for using `benchmark.py` to compare runtimes and models on Apple Silicon._

## Prerequisites

You need at least one runtime installed:

- **llama.cpp** — extracted at `llama.cpp/llama-b8400/` (see `llama-cpp-guide.md`)
- **MLX** — installed in `~/llm-env` via `pip install mlx-lm`

Activate the Python environment before running:

```bash
source ~/llm-env/bin/activate
```

## Quick Start

```bash
# Smoke test — one prompt, 32 tokens, small models
python benchmark.py --quick

# Full run of small models (7B, 8B, 32B) across all prompts
python benchmark.py --models small

# Full run including 72B
python benchmark.py --models all

# Just the 72B model, quick
python benchmark.py --models large --quick
```

The first run for each model will download it. Models are cached (`~/.cache/llama.cpp/` for llama.cpp, `~/.cache/huggingface/` for MLX) and reused on subsequent runs.

## Command Reference

```
python benchmark.py [OPTIONS]

Options:
  --runtime {llamacpp,mlx,all}   Which runtime(s) to test (default: all)
  --models {small,large,all}     Model size class (default: small)
  --max-tokens N                 Tokens to generate per prompt (default: 256)
  --quick                        32 tokens, first prompt only
  --prompt NAME                  Run only one prompt
  --no-save                      Don't write results to disk
```

## What It Measures

Each run captures:

| Metric | Description |
|---|---|
| **PP t/s** | Prompt processing speed (tokens/sec). How fast the model ingests the prompt. |
| **Gen t/s** | Generation speed (tokens/sec). How fast the model produces output. This is the number that matters most for interactive use. |
| **Tokens** | Number of tokens generated. |
| **Wall time** | Total elapsed time including model loading (first run) or cache hits. |
| **Peak memory** | GPU memory used (MLX only — llama.cpp doesn't report this via CLI). |
| **Output** | The full text response, saved for quality comparison. |

## Models Included

Models are defined in the `MODELS` list at the top of `benchmark.py`.

### Small (default)

| Model | Params | Q4_K_M Size | Why It's Here |
|---|---|---|---|
| Qwen 2.5 7B Instruct | 7B | ~5 GB | Fast baseline, good for autocomplete |
| Llama 3.1 8B Instruct | 8B | ~5 GB | Most popular small model |
| Qwen 2.5 32B Instruct | 32B | ~20 GB | Quality sweet spot |
| DeepSeek R1 Distill 32B | 32B | ~20 GB | Reasoning/chain-of-thought |

### Large (`--models large` or `--models all`)

| Model | Params | Q4_K_M Size | Why It's Here |
|---|---|---|---|
| Qwen 2.5 72B Instruct | 72B | ~42 GB | Best overall local model |

### Adding Models

Edit the `MODELS` list in `benchmark.py`:

```python
{
    "name": "My Model",              # Display name
    "size_class": "small",           # "small" or "large"
    "llamacpp_hf": "user/repo-GGUF", # HuggingFace GGUF repo
    "llamacpp_quant": "Q4_K_M",      # Quantization level
    "mlx_model": "mlx-community/...",# MLX model from mlx-community
},
```

Both `llamacpp_hf` and `mlx_model` must point to real repos. If a model isn't available for one runtime, remove that field and run with `--runtime` to limit to the other.

## Prompts

Three prompts test different capabilities:

| Name | Tests | Prompt |
|---|---|---|
| `short_factual` | Conciseness, factual accuracy | "What are the three laws of thermodynamics?" |
| `code_generation` | Code quality, correctness | "Write a Python function that finds the longest palindromic substring" |
| `reasoning` | Logic, step-by-step thinking | "A farmer has 17 sheep. All but 9 die. How many?" |

Run a single prompt with `--prompt`:

```bash
python benchmark.py --prompt code_generation
python benchmark.py --prompt reasoning --models large
```

### Adding Prompts

Edit the `PROMPTS` list in `benchmark.py`:

```python
{
    "name": "my_prompt",
    "system": "You are a helpful assistant.",
    "prompt": "Your question here.",
},
```

## Output

### Terminal

The script prints a live summary as each run completes, then a final comparison table:

```
──────────────────────────────────────────────────────────────────────────────
Model                          Runtime      Prompt            PP t/s  Gen t/s  Tokens    Wall
──────────────────────────────────────────────────────────────────────────────
Qwen 2.5 7B Instruct          llama.cpp    short_factual      850.3    95.2     128    12.3s
Qwen 2.5 7B Instruct          mlx          short_factual     1200.1   142.8     128     9.1s
Qwen 2.5 32B Instruct         llama.cpp    short_factual      320.5    28.4     128    35.2s
Qwen 2.5 32B Instruct         mlx          short_factual      480.2    42.1     128    24.8s
──────────────────────────────────────────────────────────────────────────────
```

Followed by output comparison showing the actual text each model/runtime produced for each prompt.

### Files

Results are saved to `benchmark-results/`:

- **`benchmark-YYYYMMDD-HHMMSS.json`** — Full structured data. Each entry has all metrics plus the complete output text. Good for further analysis or plotting.
- **`benchmark-YYYYMMDD-HHMMSS.md`** — Human-readable markdown with a performance table and all outputs.

Disable saving with `--no-save`.

## Example Workflows

### Compare runtimes for one model

```bash
# How much faster is MLX than llama.cpp for Qwen 32B?
python benchmark.py --models small --prompt short_factual
```

### Compare model quality

```bash
# Same prompt across all models — read the outputs
python benchmark.py --prompt reasoning --max-tokens 512
# Then check benchmark-results/*.md for the full outputs
```

### Quick iteration while tuning

```bash
# Fast feedback loop
python benchmark.py --quick --no-save --runtime mlx
```

### Benchmark a new model you just downloaded

Add it to the `MODELS` list, then:

```bash
python benchmark.py --quick  # smoke test
python benchmark.py          # full run
```

### Generate data for a comparison chart

```bash
python benchmark.py --models all --max-tokens 512
# Load benchmark-results/*.json into a notebook or script for plotting
```

## Interpreting Results

**Generation t/s is the key metric** for interactive chat. Rough guidelines:

| Gen t/s | Feel |
|---|---|
| >50 | Instant — faster than reading speed |
| 20-50 | Smooth — comfortable for chat |
| 10-20 | Usable — noticeable but acceptable |
| 5-10 | Sluggish — workable for long tasks |
| <5 | Painful — only for batch/offline use |

**Prompt processing t/s** matters when you're sending large contexts (long documents, big codebases). Higher is better but it's less noticeable in practice.

**MLX vs llama.cpp on Apple Silicon:** Expect MLX to be 30-70% faster for generation. llama.cpp has more features (speculative decoding, grammar constraints) and broader model support.

**Output quality at different sizes:**
- 7-8B models handle simple factual questions and basic code well, but struggle with nuanced reasoning.
- 32B models are the sweet spot — genuinely useful for most tasks.
- 72B at Q4_K_M is noticeably better than 32B for complex reasoning and code, at the cost of ~3x slower generation.

## Troubleshooting

**"No runtimes available"** — Make sure you activated the right environment (`source ~/llm-env/bin/activate`) and that `llama.cpp/llama-b8400/llama-cli` exists.

**Model download hangs** — First runs download models (several GB each). Check network. llama.cpp models go to `~/Library/Caches/llama.cpp/`, MLX models to `~/.cache/huggingface/`.

**OOM / killed** — Unlikely with 128GB, but if running 72B with long `--max-tokens`, try adding `--max-tokens 128` or using a smaller model.

**llama.cpp Metal errors** — See `local-llms.md` for the macOS 26.2 Metal shader bug. llama.cpp b8400 uses an embedded Metal library that should work, but if you hit issues, fall back to `--runtime mlx`.

**MLX errors on Python 3.9** — The `~/llm-env` uses system Python 3.9. If MLX requires newer Python, recreate the venv with `python3.12 -m venv ~/llm-env`.
