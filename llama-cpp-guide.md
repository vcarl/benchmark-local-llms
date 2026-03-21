# llama.cpp Guide for Apple Silicon (128GB)

_Last updated: March 2026 — based on release b8400_

## Installation

Download a release from [github.com/ggml-org/llama.cpp/releases](https://github.com/ggml-org/llama.cpp/releases), extract, and remove the macOS quarantine flag:

```bash
tar xzf llama-b8400-bin-macos-arm64.tar.gz
xattr -r -d com.apple.quarantine llama-b8400/
```

All binaries and shared libraries are in the extracted directory. No system-wide install needed.

### Key Binaries

| Binary | Purpose |
|---|---|
| `llama-cli` | Interactive chat / text generation |
| `llama-server` | OpenAI-compatible API server |
| `llama-bench` | Benchmark prompt processing and generation speed |
| `llama-perplexity` | Measure model quality via perplexity |
| `llama-quantize` | Convert/quantize GGUF models |
| `llama-gguf-split` | Split or merge large GGUF files |
| `llama-mtmd-cli` | Multimodal CLI (vision models) |
| `llama-tts` | Text-to-speech |

---

## Getting Models

### Option 1: Direct from HuggingFace (built-in)

llama-cli and llama-server can download models directly using `-hf`:

```bash
# Downloads Q4_K_M by default
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF --conversation

# Specify a quantization
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF:Q5_K_M --conversation

# Specify an exact file
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF --hf-file qwen2.5-72b-instruct-q4_k_m-00001-of-00003.gguf --conversation
```

Models are cached in `~/Library/Caches/llama.cpp/` on macOS and reused on subsequent runs.

### Option 2: Manual download with `hf` CLI

```bash
source .venv/bin/activate
hf download Qwen/Qwen2.5-72B-Instruct-GGUF --include "*q4_k_m*" --local-dir models/qwen2.5-72b
```

Then reference the file directly with `-m`:

```bash
./llama-cli -m models/qwen2.5-72b/qwen2.5-72b-instruct-q4_k_m-00001-of-00003.gguf --conversation
```

For split models (multiple `.gguf` files), point to the first shard — llama.cpp finds the rest automatically.

---

## llama-cli: Interactive Chat

### Basic Usage

```bash
# Simplest: download and chat
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF --conversation

# With a system prompt
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF \
  --conversation \
  -sys "You are a helpful coding assistant."

# From a local model file
./llama-cli -m models/model.gguf --conversation
```

### Essential Flags

#### Model Loading

| Flag | Description |
|---|---|
| `-m FILE` | Load model from local file path |
| `-hf USER/REPO[:QUANT]` | Download from HuggingFace. Quant defaults to Q4_K_M |
| `-hff FILE` | Override the specific file to download from HF repo |
| `-hft TOKEN` | HuggingFace token for gated models (or set `HF_TOKEN` env var) |
| `--lora FILE` | Apply a LoRA adapter |

#### GPU / Memory

| Flag | Description |
|---|---|
| `-ngl N` | Number of layers to offload to GPU. Use `auto` (default) or `99`/`all` for full offload |
| `--mlock` | Lock model in RAM, prevent swapping |
| `--no-mmap` | Disable memory mapping (slower load, but reduces pageouts) |
| `-fa on` | Force flash attention on (default: auto) |

On Apple Silicon with 128GB, `-ngl auto` (the default) should offload everything to Metal automatically. The `recommendedMaxWorkingSetSize` is ~115GB, so models up to ~100GB fit comfortably with room for KV cache.

#### Context and Generation

| Flag | Description |
|---|---|
| `-c N` | Context size in tokens. Default: loaded from model. Larger = more memory |
| `-n N` | Max tokens to generate. -1 = unlimited (default) |
| `-sys PROMPT` | System prompt |
| `-p PROMPT` | Initial user prompt (for non-interactive use) |
| `-f FILE` | Read prompt from file |
| `--conversation` | Interactive chat mode (auto-enabled if model has a chat template) |
| `-st` | Single-turn mode — respond to `-p` and exit |
| `--context-shift` | Enable context shifting for infinite generation (slides the context window) |

#### KV Cache Quantization

Reduce memory usage of the KV cache (useful for long contexts):

| Flag | Description |
|---|---|
| `-ctk TYPE` | Cache type for K values: `f16` (default), `q8_0`, `q4_0`, etc. |
| `-ctv TYPE` | Cache type for V values: `f16` (default), `q8_0`, `q4_0`, etc. |

Using `-ctk q8_0 -ctv q8_0` halves KV cache memory with minimal quality loss. Useful when running large models with long contexts.

#### Sampling Parameters

| Flag | Default | Description |
|---|---|---|
| `--temp N` | 0.8 | Temperature. Lower = more deterministic |
| `--top-k N` | 40 | Top-K sampling. 0 = disabled |
| `--top-p N` | 0.95 | Top-P (nucleus) sampling. 1.0 = disabled |
| `--min-p N` | 0.05 | Min-P sampling. 0.0 = disabled |
| `--repeat-penalty N` | 1.0 | Repeat penalty. 1.0 = disabled |
| `-s SEED` | random | RNG seed for reproducibility |
| `--grammar GRAMMAR` | — | Constrain output with a BNF grammar |
| `-j SCHEMA` | — | Constrain output to match a JSON schema |

#### Reasoning / Thinking Models

| Flag | Description |
|---|---|
| `-rea on\|off\|auto` | Enable/disable reasoning mode (for models like DeepSeek R1) |
| `--reasoning-budget N` | Token budget for thinking. -1 = unlimited, 0 = no thinking |
| `--reasoning-format FORMAT` | `none`, `deepseek`, or `deepseek-legacy` |

#### Output Control

| Flag | Description |
|---|---|
| `-co on` | Colorize output (distinguish prompt from generation) |
| `--show-timings` / `--no-show-timings` | Show tok/s after each response (default: on) |
| `-v` | Verbose — show all debug messages |
| `-lv N` | Verbosity level: 0=generic, 1=error, 2=warning, 3=info, 4=debug |
| `--log-file FILE` | Write logs to file |

### Example Commands

```bash
# Quick chat with Qwen 72B
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF --conversation

# Coding assistant with longer context
./llama-cli -hf Qwen/Qwen2.5-Coder-32B-Instruct-GGUF \
  --conversation \
  -c 32768 \
  -sys "You are an expert programmer. Be concise."

# Reasoning model with visible thinking
./llama-cli -hf bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF \
  --conversation \
  -rea on

# One-shot prompt (non-interactive)
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF \
  -st -p "Explain the CAP theorem in 3 sentences."

# JSON-constrained output
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF \
  -st -p "List 3 programming languages" \
  -j '{"type":"object","properties":{"languages":{"type":"array","items":{"type":"string"}}}}'

# Reduce memory: quantize KV cache
./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF \
  --conversation \
  -c 65536 \
  -ctk q8_0 -ctv q8_0
```

---

## llama-server: OpenAI-Compatible API

Runs a local HTTP server with `/v1/chat/completions`, `/v1/completions`, and `/v1/models` endpoints. Compatible with aider, Continue.dev, Cline, and any OpenAI SDK client.

```bash
# Start server
./llama-server -hf Qwen/Qwen2.5-72B-Instruct-GGUF \
  --host 0.0.0.0 --port 8080

# Use with curl
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# Use with aider
aider --openai-api-base http://localhost:8080/v1 --model openai/qwen2.5-72b

# Use with Python OpenAI SDK
# client = OpenAI(base_url="http://localhost:8080/v1", api_key="none")
```

The server accepts all the same model/GPU/context flags as `llama-cli`. Additional server-specific flags:

| Flag | Description |
|---|---|
| `--host ADDR` | Listen address (default: 127.0.0.1) |
| `--port N` | Listen port (default: 8080) |
| `-np N` | Number of parallel request slots (default: 1) |
| `--api-key KEY` | Require API key for requests |

---

## llama-bench: Benchmarking

Measures prompt processing (pp) and token generation (tg) speed.

```bash
# Benchmark a model (auto-downloads from HF)
./llama-bench -hf Qwen/Qwen2.5-72B-Instruct-GGUF

# Benchmark a local file
./llama-bench -m models/model.gguf

# Custom prompt and generation lengths
./llama-bench -m models/model.gguf -p 512 -n 128

# Compare multiple configurations
./llama-bench -m models/model.gguf -ngl 0,99 -fa 0,1

# Output as JSON
./llama-bench -m models/model.gguf -o json
```

Output shows tokens/second for both prompt processing and generation across the configurations tested.

---

## Popular GGUF Models (March 2026)

All models below are available on HuggingFace in GGUF format. Use with `-hf REPO` and llama.cpp will auto-download Q4_K_M by default. Append `:QUANT` to select a different quantization (e.g., `:Q5_K_M`, `:Q8_0`).

### General Purpose

| Model | HF Repo (GGUF) | Params | Q4_K_M Size | Notes |
|---|---|---|---|---|
| **Qwen 2.5 72B Instruct** | `Qwen/Qwen2.5-72B-Instruct-GGUF` | 72B | ~42GB | Best overall quality at this size. 128K context. |
| **Llama 3.3 70B Instruct** | `bartowski/Llama-3.3-70B-Instruct-GGUF` | 70B | ~40GB | Matches Llama 405B on many benchmarks. 128K context. |
| **Qwen 3 110B** | `Qwen/Qwen3-110B-GGUF` | 110B | ~63GB | Largest that fits comfortably in 128GB at Q4. |
| **Mistral Large 2 123B** | `bartowski/Mistral-Large-Instruct-2411-GGUF` | 123B | ~70GB | Tight fit at Q4. Strong multilingual. |
| **Qwen 2.5 32B Instruct** | `Qwen/Qwen2.5-32B-Instruct-GGUF` | 32B | ~20GB | Great quality-to-size ratio. Fast. |
| **Llama 3.1 8B Instruct** | `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF` | 8B | ~5GB | Fast experimentation. Good baseline. |
| **Gemma 3 27B** | `bartowski/gemma-3-27b-it-GGUF` | 27B | ~16GB | Strong all-around. Google model. |

### Reasoning / Chain-of-Thought

| Model | HF Repo (GGUF) | Params | Q4_K_M Size | Notes |
|---|---|---|---|---|
| **DeepSeek R1 Distill Qwen 70B** | `bartowski/DeepSeek-R1-Distill-Qwen-70B-GGUF` | 70B | ~40GB | Best local reasoning model. Shows thinking. |
| **DeepSeek R1 Distill Qwen 32B** | `bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF` | 32B | ~20GB | Fast reasoning. Great quality for size. |
| **QwQ 32B** | `Qwen/QwQ-32B-GGUF` | 32B | ~20GB | Qwen's reasoning model. |
| **Qwen 3.5 27B** | `Qwen/Qwen3.5-27B-GGUF` | 27B | ~16GB | Ties GPT-5 mini on SWE-bench at 72.4%. |

### Coding

| Model | HF Repo (GGUF) | Params | Q4_K_M Size | Notes |
|---|---|---|---|---|
| **Qwen 2.5 Coder 32B Instruct** | `Qwen/Qwen2.5-Coder-32B-Instruct-GGUF` | 32B | ~20GB | Best proven local coding model. FIM support. |
| **Qwen 2.5 Coder 14B Instruct** | `Qwen/Qwen2.5-Coder-14B-Instruct-GGUF` | 14B | ~9GB | Best quality-to-size for coding. |
| **Qwen 2.5 Coder 7B Instruct** | `Qwen/Qwen2.5-Coder-7B-Instruct-GGUF` | 7B | ~5GB | Good for autocomplete (FIM). |
| **DeepSeek Coder V2 16B** | `bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF` | 16B | ~9GB | MoE, fast inference. |
| **Codestral 22B** | `bartowski/Codestral-22B-v0.1-GGUF` | 22B | ~13GB | Mistral's code model. Good FIM. |

### Mixture-of-Experts (MoE)

MoE models have many total parameters but only activate a fraction per token, giving better quality per compute dollar. They use more memory (the full model must be loaded) but run faster than dense models of equivalent quality.

| Model | HF Repo (GGUF) | Total / Active | Q4_K_M Size | Notes |
|---|---|---|---|---|
| **Mixtral 8x22B** | `bartowski/Mixtral-8x22B-Instruct-v0.1-GGUF` | 141B / 39B | ~80GB | Fits at Q4, tight at Q5. |
| **Qwen3-Coder 30B-A3B** | `Qwen/Qwen3-Coder-30B-A3B-GGUF` | 30B / 3B | ~18GB | Purpose-built for agentic coding. 256K context. |
| **Command-R+ 104B** | `bartowski/c4ai-command-r-plus-GGUF` | 104B | ~60GB | Strong for RAG and tool use. |

### Vision / Multimodal

Use with `llama-mtmd-cli` (multimodal CLI) or model-specific binaries.

| Model | HF Repo (GGUF) | Params | Notes |
|---|---|---|---|
| **Gemma 3 12B** | `bartowski/gemma-3-12b-it-GGUF` | 12B | Vision + text. Use `llama-mtmd-cli`. |
| **Gemma 3 27B** | `bartowski/gemma-3-27b-it-GGUF` | 27B | Vision + text. |
| **Qwen 2.5 VL 72B** | `Qwen/Qwen2.5-VL-72B-Instruct-GGUF` | 72B | Vision-language. Use `llama-qwen2vl-cli`. |
| **Llama 3.2 Vision 11B** | `bartowski/Llama-3.2-11B-Vision-Instruct-GGUF` | 11B | Meta's vision model. |

---

## Quantization Quick Reference

When choosing a quantization level for `-hf REPO:QUANT`:

| Quant | Bits | Quality | Size (per B params) | Recommendation |
|---|---|---|---|---|
| F16 | 16 | 100% (baseline) | ~2.0 GB | If memory allows |
| Q8_0 | 8 | ~99% | ~1.0 GB | Best quality/size trade |
| Q6_K | 6 | ~97% | ~0.8 GB | Very good |
| **Q5_K_M** | **5** | **~95%** | **~0.7 GB** | **Recommended for 128GB** |
| **Q4_K_M** | **4** | **~93%** | **~0.6 GB** | **Default, good balance** |
| Q3_K_M | 3 | ~88% | ~0.4 GB | Noticeable degradation |
| Q2_K | 2 | ~80% | ~0.3 GB | Emergency only |

With 128GB, prefer Q5_K_M or Q6_K for 70B-class models — you have the memory for it, and the quality improvement over Q4_K_M is noticeable.

---

## Tips for Apple Silicon

1. **`-ngl auto`** is the default and works well — it offloads as many layers as fit in Metal.

2. **Flash attention** is auto-detected. You can force it with `-fa on` for potential speedups.

3. **KV cache quantization** (`-ctk q8_0 -ctv q8_0`) is the best way to stretch context length without loading a smaller model.

4. **The `--fit` flag** (on by default) automatically adjusts context size to fit in available memory. It won't let you OOM by accident.

5. **Speculative decoding** can speed up generation by 2-3x. Use a small draft model:
   ```bash
   ./llama-cli -hf Qwen/Qwen2.5-72B-Instruct-GGUF \
     -hfd Qwen/Qwen2.5-0.5B-Instruct-GGUF \
     --conversation
   ```

6. **Multiple shards**: For split GGUF files (e.g., `-00001-of-00003.gguf`), always point to the first shard. llama.cpp finds the rest automatically.
