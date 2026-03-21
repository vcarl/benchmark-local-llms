# Local LLMs on Apple Silicon (128GB) — State of the Art

_Last updated: March 2026_

## Inference Engines

### MLX (Recommended for performance)

Apple's native ML framework. Best throughput on Apple Silicon (~230 tok/s on M4 Max for 70B-class models). Supports quantized and full-precision models natively via Metal.

```bash
pip install mlx-lm
mlx_lm.generate --model mlx-community/Qwen2.5-72B-Instruct-4bit --prompt "Hello"
```

- macOS-only, Metal-native
- mlx-community on HuggingFace has thousands of pre-converted models
- `mlx_lm.convert` quantizes any HF model in seconds
- oMLX server offers up to 10x faster prefill via tiered KV cache

### llama.cpp (Recommended for flexibility)

The reference GGUF engine. ~150 tok/s on M4 Max. Supports partial GPU offloading — layers can be split between GPU and CPU when a model barely fits.

```bash
brew install llama.cpp
llama-cli -m model.Q4_K_M.gguf -p "Hello" -ngl 99
```

### Ollama (Recommended for ease of use)

Wraps llama.cpp with a simple CLI and REST API. Lower throughput (20-40 tok/s) due to abstraction overhead, but the fastest path from zero to chatting.

```bash
brew install ollama
ollama run qwen2.5:72b-instruct-q4_K_M
```

### Others

- **LM Studio** — Desktop GUI, supports both GGUF and MLX backends
- **MLC-LLM** — ~190 tok/s, best for very long context (100k+) due to paged KV cache
- **PyTorch MPS** — Avoid for inference (~7-9 tok/s), only useful for fine-tuning

## Models That Fit in 128GB

Usable memory is ~95-100GB after macOS overhead. Size formula: `params × bytes_per_param + KV_cache + OS`.

| Model | Q4_K_M | Q5_K_M | Q8_0 | FP16 | Notes |
|---|---|---|---|---|---|
| Qwen 2.5 72B | ~42GB | ~50GB | ~72GB | ~144GB | Best overall quality |
| Llama 3.3 70B | ~40GB | ~48GB | ~70GB | ~140GB | Matches 405B on many benchmarks |
| DeepSeek R1 Distill 70B | ~40GB | ~48GB | ~70GB | ~140GB | Best reasoning/chain-of-thought |
| Qwen 3 110B | ~63GB | ~75GB | ~110GB | — | Largest comfortable fit at Q4 |
| DeepSeek R1 Distill 32B | ~18GB | ~22GB | ~35GB | ~64GB | Fast, all quants fit easily |
| Mixtral 8x22B (MoE) | ~80GB | ~95GB | — | — | Q4 fits, Q5 is tight |
| Command-R+ 104B | ~60GB | ~70GB | — | — | Q4-Q5 fit |
| Qwen3-235B-A22B (MoE) | ~130GB | — | — | — | Barely fits at Q4, needs Q2-Q3 |
| Llama 3.1 405B | ~230GB | — | — | — | Does not fit |

### Sweet Spot Recommendations

- **Best quality:** Qwen 2.5 72B-Instruct at Q5_K_M (~50GB). Leaves room for long-context KV cache.
- **Best reasoning:** DeepSeek R1 Distill 70B at Q5_K_M (~48GB).
- **Best coding:** Qwen3-Coder 72B or Qwen 2.5 Coder 32B at Q5+.
- **Largest practical:** Qwen 3 110B at Q4_K_M (~63GB).
- **Speed priority:** DeepSeek R1 Distill 32B at Q8 — small enough for very high tok/s.

## Quantization

### Formats

| Format | Used By | Notes |
|---|---|---|
| GGUF | llama.cpp, Ollama, LM Studio | CPU+GPU hybrid, most flexible |
| MLX safetensors | MLX, LM Studio (MLX mode) | Best perf on Apple Silicon |
| Safetensors FP16 | Transformers, vLLM | Base format, convert to others |
| GPTQ/AWQ | vLLM, TGI | GPU-server oriented, less relevant for Mac |

### Quality ranking (best to worst)

F16 > Q8_0 > Q6_K > Q5_K_M > Q5_K_S > Q4_K_M > Q4_K_S > Q3_K_M > Q2_K > IQ2_XS

**Q4_K_M is the recommended default** — best balance of quality, size, and speed.

### Tools

- **llama.cpp quantize:** `llama-quantize model.gguf model-Q4_K_M.gguf Q4_K_M`
- **MLX convert:** `mlx_lm.convert --hf-path <model> -q --q-bits 4`
- **AutoGPTQ / AutoAWQ:** Layer-wise quantization with calibration data. Less relevant for Mac.

## Benchmarking

### Speed

- `llama-bench` — built into llama.cpp, measures prompt processing and generation tok/s
- `mlx_lm.bench` — MLX native benchmarking
- Ollama verbose mode shows tok/s

### Quality

- `llama-perplexity` — measure quantization quality loss against reference text
- `lm-eval` (EleutherAI) — formal accuracy benchmarks (MMLU, HellaSwag, etc.)

```bash
pip install lm-eval
lm_eval --model hf --model_args pretrained=<model> --tasks hellaswag,mmlu --batch_size auto
```

## Model Sources

- **HuggingFace Hub** — primary source for everything. `pip install huggingface-hub`
- **GGUF quants:** bartowski, mradermacher on HuggingFace
- **MLX models:** mlx-community org on HuggingFace
- **Ollama library:** ollama.com/library (pre-packaged)

## Setup

```bash
# Prerequisites
xcode-select --install
brew install cmake llama.cpp ollama git-lfs python@3.12

# Python environment
python3 -m venv ~/llm-env
source ~/llm-env/bin/activate
pip install mlx-lm huggingface-hub lm-eval
```
