# Challenge logic: Pre-release (draft)

> 10 items (core 10) in 10 families; version 1, content hash `3776afdf02aa`. Snapshot `172dc26d4bdb74f74ceaacf9b148460c2036e032b8a39008c94ccb8d398d0648`: Pre-release (draft), executed 2026-06-19 – 2026-11-28.

What it measures: the items themselves, with prompts, answer keys and scorers, are public in [logic.yaml](https://github.com/vcarl/benchmark-local-llms/blob/main/releases/draft/challenges/logic.yaml). An item passes only at a score of exactly 1. Families group items that share a scenario; the interval below clusters on them.

| # | Config | Model | Status | Passed / items | Pass rate ± 95% CI |
|---|---|---|---|---|---|
| 1 | [devstral-small-2-24b-omlx](https://vcarl.com/evals/llms/draft/configs/devstral-small-2-24b-omlx.md) | Devstral-Small-2-24B-Instruct-2512 | scored | 10/10 | 100.0% ± 0.0 |
| 2 | [gemma-4-31b-omlx](https://vcarl.com/evals/llms/draft/configs/gemma-4-31b-omlx.md) | gemma-4-31b-it | scored | 10/10 | 100.0% ± 0.0 |
| 3 | [mistral-small-4-119b-omlx](https://vcarl.com/evals/llms/draft/configs/mistral-small-4-119b-omlx.md) | Mistral-Small-4-119B-2603 | scored | 10/10 | 100.0% ± 0.0 |
| 4 | [qwen3.5-9b-llamacpp](https://vcarl.com/evals/llms/draft/configs/qwen3.5-9b-llamacpp.md) | Qwen3.5-9B | scored | 10/10 | 100.0% ± 0.0 |
| 5 | [qwen2.5-32b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen2.5-32b-omlx.md) | Qwen2.5-32B-Instruct | scored | 10/10 | 100.0% ± 0.0 |
| 6 | [qwen3.8-flash-next-llamacpp](https://vcarl.com/evals/llms/draft/configs/qwen3.8-flash-next-llamacpp.md) | Qwen3.8-Flash-Next | scored | 10/10 | 100.0% ± 0.0 |
| 7 | [qwen3.8-27b-omlx-5bit](https://vcarl.com/evals/llms/draft/configs/qwen3.8-27b-omlx-5bit.md) | Qwen3.8-27B | scored | 10/10 | 100.0% ± 0.0 |
| 8 | [qwen3.6-35b-a3b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.6-35b-a3b-mlx-26a53827.md) | Qwen3.6-35B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 9 | [qwen3.8-27b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.8-27b-omlx.md) | Qwen3.8-27B | scored | 10/10 | 100.0% ± 0.0 |
| 10 | [inkling-2-mini-llamacpp](https://vcarl.com/evals/llms/draft/configs/inkling-2-mini-llamacpp.md) | Inkling-2-Mini | scored | 10/10 | 100.0% ± 0.0 |
| 11 | [qwen3-coder-next-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3-coder-next-omlx.md) | Qwen3-Coder-Next | scored | 10/10 | 100.0% ± 0.0 |
| 12 | [cyber-tiel-coder-35b-a3b-llamacpp](https://vcarl.com/evals/llms/draft/configs/cyber-tiel-coder-35b-a3b-llamacpp.md) | Cyber-Tiel-Coder-35B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 13 | [mellum2.1-12b-a2.5b-thinking-omlx](https://vcarl.com/evals/llms/draft/configs/mellum2.1-12b-a2.5b-thinking-omlx.md) | Mellum2.1-12B-A2.5B-Thinking | scored | 10/10 | 100.0% ± 0.0 |
| 14 | [gpt-oss-20b-llamacpp](https://vcarl.com/evals/llms/draft/configs/gpt-oss-20b-llamacpp.md) | gpt-oss-20b | scored | 10/10 | 100.0% ± 0.0 |
| 15 | [devstral-small-2-24b-mlx](https://vcarl.com/evals/llms/draft/configs/devstral-small-2-24b-mlx-4fbadf01.md) | Devstral-Small-2-24B-Instruct-2512 | scored | 10/10 | 100.0% ± 0.0 |
| 16 | [qwen2.5-32b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen2.5-32b-mlx.md) | Qwen2.5-32B-Instruct | scored | 10/10 | 100.0% ± 0.0 |
| 17 | [gemma-4-e4b-llamacpp](https://vcarl.com/evals/llms/draft/configs/gemma-4-e4b-llamacpp.md) | gemma-4-E4B-it | scored | 10/10 | 100.0% ± 0.0 |
| 18 | [lfm2.5-24b-a2b-4bit-omlx](https://vcarl.com/evals/llms/draft/configs/lfm2.5-24b-a2b-4bit-omlx.md) | LFM2.5-24B-A2B | scored | 10/10 | 100.0% ± 0.0 |
| 19 | [qwen3.6-35b-a3b-llamacpp](https://vcarl.com/evals/llms/draft/configs/qwen3.6-35b-a3b-llamacpp.md) | Qwen3.6-35B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 20 | [lfm3-1.7b-bf16-llamacpp](https://vcarl.com/evals/llms/draft/configs/lfm3-1.7b-bf16-llamacpp.md) | LFM3-1.7B | scored | 10/10 | 100.0% ± 0.0 |
| 21 | [gemma-4-12b-omlx](https://vcarl.com/evals/llms/draft/configs/gemma-4-12b-omlx.md) | gemma-4-12B-it | scored | 10/10 | 100.0% ± 0.0 |
| 22 | [ternary-bonsai-2.5-27b-llamacpp](https://vcarl.com/evals/llms/draft/configs/ternary-bonsai-2.5-27b-llamacpp.md) | Ternary-Bonsai-2.5-27B | scored | 10/10 | 100.0% ± 0.0 |
| 23 | [phi-4-omlx-8bit](https://vcarl.com/evals/llms/draft/configs/phi-4-omlx-8bit.md) | phi-4 | scored | 10/10 | 100.0% ± 0.0 |
| 24 | [laguna-s-2.1-omlx](https://vcarl.com/evals/llms/draft/configs/laguna-s-2.1-omlx.md) | Laguna-S-2.1 | scored | 10/10 | 100.0% ± 0.0 |
| 25 | [qwen3.5-35b-a3b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-35b-a3b-mlx.md) | Qwen3.5-35B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 26 | [lfm3-1.7b-q4km-llamacpp](https://vcarl.com/evals/llms/draft/configs/lfm3-1.7b-q4km-llamacpp.md) | LFM3-1.7B | scored | 10/10 | 100.0% ± 0.0 |
| 27 | [qwen3-coder-next-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3-coder-next-mlx-b5916ffe.md) | Qwen3-Coder-Next | scored | 10/10 | 100.0% ± 0.0 |
| 28 | [phi-4-omlx](https://vcarl.com/evals/llms/draft/configs/phi-4-omlx.md) | phi-4 | scored | 10/10 | 100.0% ± 0.0 |
| 29 | [kimi-linear-48b-a3b-mlx](https://vcarl.com/evals/llms/draft/configs/kimi-linear-48b-a3b-mlx.md) | Kimi-Linear-48B-A3B-Instruct | scored | 10/10 | 100.0% ± 0.0 |
| 30 | [qwen3.5-9b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-9b-omlx.md) | Qwen3.5-9B | scored | 10/10 | 100.0% ± 0.0 |
| 31 | [gemma-4-31b-mlx](https://vcarl.com/evals/llms/draft/configs/gemma-4-31b-mlx.md) | gemma-4-31b-it | scored | 10/10 | 100.0% ± 0.0 |
| 32 | [phi-4-mlx-8bit](https://vcarl.com/evals/llms/draft/configs/phi-4-mlx-8bit.md) | phi-4 | scored | 10/10 | 100.0% ± 0.0 |
| 33 | [nemotron-3.5-lightning-30b-a3b-omlx](https://vcarl.com/evals/llms/draft/configs/nemotron-3.5-lightning-30b-a3b-omlx.md) | NVIDIA-Nemotron-3.5-Lightning-30B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 34 | [qwen3.5-35b-a3b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-35b-a3b-omlx.md) | Qwen3.5-35B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 35 | [qwen3.5-9b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-9b-mlx-e03e462d.md) | Qwen3.5-9B | scored | 10/10 | 100.0% ± 0.0 |
| 36 | [qwen3.6-35b-a3b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.6-35b-a3b-omlx.md) | Qwen3.6-35B-A3B | scored | 10/10 | 100.0% ± 0.0 |
| 37 | [phi-4-llamacpp](https://vcarl.com/evals/llms/draft/configs/phi-4-llamacpp.md) | phi-4 | scored | 10/10 | 100.0% ± 0.0 |
| 38 | [ling-3.0-flash-llamacpp](https://vcarl.com/evals/llms/draft/configs/ling-3.0-flash-llamacpp.md) | Ling-3.0-flash | scored | 10/10 | 100.0% ± 0.0 |
| 39 | [flint-llamacpp](https://vcarl.com/evals/llms/draft/configs/flint-llamacpp.md) | flint | scored | 10/10 | 100.0% ± 0.0 |
| 40 | [qwen3-coder-next-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3-coder-next-mlx-fe5643b1.md) | Qwen3-Coder-Next | scored | 10/10 | 100.0% ± 0.0 |
| 41 | [mistral-small-3.2-24b-mlx](https://vcarl.com/evals/llms/draft/configs/mistral-small-3.2-24b-mlx-091a1365.md) | Mistral-Small-3.2-24B-Instruct-2506 | scored | 9/10 | 90.0% ± 22.6 |
| 42 | [devstral-small-2-24b-mlx](https://vcarl.com/evals/llms/draft/configs/devstral-small-2-24b-mlx-16dbd8ed.md) | Devstral-Small-2-24B-Instruct-2512 | scored | 9/10 | 90.0% ± 22.6 |
| 43 | [magistral-small-2509-omlx](https://vcarl.com/evals/llms/draft/configs/magistral-small-2509-omlx.md) | Magistral-Small-2509 | scored | 9/10 | 90.0% ± 22.6 |
| 44 | [qwen3-coder-30b-a3b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3-coder-30b-a3b-mlx-358d2987.md) | Qwen3-Coder-30B-A3B-Instruct | scored | 9/10 | 90.0% ± 22.6 |
| 45 | [qwen3-coder-30b-a3b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3-coder-30b-a3b-mlx-44e3d9ad.md) | Qwen3-Coder-30B-A3B-Instruct | scored | 9/10 | 90.0% ± 22.6 |
| 46 | [qwen2.5-7b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen2.5-7b-omlx.md) | Qwen2.5-7B-Instruct | scored | 9/10 | 90.0% ± 22.6 |
| 47 | [gpt-oss-20b-omlx](https://vcarl.com/evals/llms/draft/configs/gpt-oss-20b-omlx.md) | gpt-oss-20b | scored | 9/10 | 90.0% ± 22.6 |
| 48 | [gemma-4-26b-a4b-omlx](https://vcarl.com/evals/llms/draft/configs/gemma-4-26b-a4b-omlx.md) | gemma-4-26b-a4b-it | scored | 9/10 | 90.0% ± 22.6 |
| 49 | [gemma-4-e4b-omlx](https://vcarl.com/evals/llms/draft/configs/gemma-4-e4b-omlx.md) | gemma-4-e4b-it | scored | 9/10 | 90.0% ± 22.6 |
| 50 | [qwen2.5-7b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen2.5-7b-mlx.md) | Qwen2.5-7B-Instruct | scored | 9/10 | 90.0% ± 22.6 |
| 51 | [qwen3-coder-30b-a3b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3-coder-30b-a3b-omlx.md) | Qwen3-Coder-30B-A3B-Instruct | scored | 9/10 | 90.0% ± 22.6 |
| 52 | [qwen3.5-9b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-9b-mlx-f5a22507.md) | Qwen3.5-9B | scored | 9/10 | 90.0% ± 22.6 |
| 53 | [gemma-4-26b-a4b-mlx](https://vcarl.com/evals/llms/draft/configs/gemma-4-26b-a4b-mlx.md) | gemma-4-26b-a4b-it | scored | 9/10 | 90.0% ± 22.6 |
| 54 | [mistral-small-3.2-24b-mlx](https://vcarl.com/evals/llms/draft/configs/mistral-small-3.2-24b-mlx-fdc38ade.md) | Mistral-Small-3.2-24B-Instruct-2506 | scored | 9/10 | 90.0% ± 22.6 |
| 55 | [phi-4-mlx](https://vcarl.com/evals/llms/draft/configs/phi-4-mlx.md) | phi-4 | scored | 9/10 | 90.0% ± 22.6 |
| 56 | [magistral-small-2509-mlx](https://vcarl.com/evals/llms/draft/configs/magistral-small-2509-mlx.md) | Magistral-Small-2509 | scored | 8/10 | 80.0% ± 30.2 |
| 57 | [mistral-small-3.2-24b-omlx](https://vcarl.com/evals/llms/draft/configs/mistral-small-3.2-24b-omlx.md) | Mistral-Small-3.2-24B-Instruct-2506 | scored | 8/10 | 80.0% ± 30.2 |
| 58 | [spark-x2.6-1.7b-llamacpp](https://vcarl.com/evals/llms/draft/configs/spark-x2.6-1.7b-llamacpp.md) | Spark-X2.6-1.7B | scored | 7/10 | 70.0% ± 34.6 |
| 59 | [lfm2.5-1.2b-thinking-bf16-llamacpp](https://vcarl.com/evals/llms/draft/configs/lfm2.5-1.2b-thinking-bf16-llamacpp.md) | LFM2.5-1.2B-Thinking | scored | 6/10 | 60.0% ± 36.9 |
| 60 | [llama3.1-8b-mlx](https://vcarl.com/evals/llms/draft/configs/llama3.1-8b-mlx.md) | Meta-Llama-3.1-8B-Instruct | scored | 6/10 | 60.0% ± 36.9 |
| 61 | [llama3.1-8b-omlx](https://vcarl.com/evals/llms/draft/configs/llama3.1-8b-omlx.md) | Meta-Llama-3.1-8B-Instruct | scored | 6/10 | 60.0% ± 36.9 |
| 62 | [qwen3.5-2b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-2b-mlx-e93c20d4.md) | Qwen3.5-2B | scored | 6/10 | 60.0% ± 36.9 |
| 63 | [lfm2.5-1.2b-thinking-q4km-llamacpp](https://vcarl.com/evals/llms/draft/configs/lfm2.5-1.2b-thinking-q4km-llamacpp.md) | LFM2.5-1.2B-Thinking | scored | 5/10 | 50.0% ± 37.7 |
| 64 | [llama3.1-8b-llamacpp](https://vcarl.com/evals/llms/draft/configs/llama3.1-8b-llamacpp.md) | Meta-Llama-3.1-8B-Instruct | scored | 5/10 | 50.0% ± 37.7 |
| 65 | [qwen3.5-2b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-2b-omlx-1beb4473.md) | Qwen3.5-2B | scored | 4/10 | 40.0% ± 36.9 |
| 66 | [lfm2.5-1.2b-instruct-bf16-mlx](https://vcarl.com/evals/llms/draft/configs/lfm2.5-1.2b-instruct-bf16-mlx.md) | LFM2.5-1.2B-Instruct-bf16 | scored | 4/10 | 40.0% ± 36.9 |
| 67 | [lfm2.5-1.2b-instruct-bf16-llamacpp](https://vcarl.com/evals/llms/draft/configs/lfm2.5-1.2b-instruct-bf16-llamacpp.md) | LFM2.5-1.2B-Instruct | scored | 4/10 | 40.0% ± 36.9 |
| 68 | [nemotron-nano-8b-llamacpp](https://vcarl.com/evals/llms/draft/configs/nemotron-nano-8b-llamacpp-77060fb4.md) | Llama-3.1-Nemotron-Nano-8B-v1 | scored | 4/10 | 40.0% ± 36.9 |
| 69 | [lfm2.5-1.2b-instruct-4bit-mlx](https://vcarl.com/evals/llms/draft/configs/lfm2.5-1.2b-instruct-4bit-mlx.md) | LFM2.5-1.2B-Instruct | scored | 4/10 | 40.0% ± 36.9 |
| 70 | [nemotron-nano-8b-llamacpp](https://vcarl.com/evals/llms/draft/configs/nemotron-nano-8b-llamacpp-a87ce814.md) | Llama-3.1-Nemotron-Nano-8B-v1 | scored | 4/10 | 40.0% ± 36.9 |
| 71 | [gpt-oss-20b-mlx](https://vcarl.com/evals/llms/draft/configs/gpt-oss-20b-mlx.md) | gpt-oss-20b | scored | 3/10 | 30.0% ± 34.6 |
| 72 | [qwen3.5-2b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-2b-omlx-11cbdc9a.md) | Qwen3.5-2B | scored | 2/10 | 20.0% ± 30.2 |
| 73 | [lfm2.5-1.2b-instruct-q4km-llamacpp](https://vcarl.com/evals/llms/draft/configs/lfm2.5-1.2b-instruct-q4km-llamacpp.md) | LFM2.5-1.2B-Instruct | scored | 2/10 | 20.0% ± 30.2 |
| 74 | [qwen3.5-2b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-2b-mlx-97d13649.md) | Qwen3.5-2B | scored | 2/10 | 20.0% ± 30.2 |
| 75 | [qwen3.5-0.8b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-0.8b-omlx-ad7c36ff.md) | Qwen3.5-0.8B | scored | 2/10 | 20.0% ± 30.2 |
| 76 | [qwen3.5-0.8b-omlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-0.8b-omlx-0ae93cf5.md) | Qwen3.5-0.8B | scored | 1/10 | 10.0% ± 22.6 |
| 77 | [qwen3.5-0.8b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-0.8b-mlx-254c0270.md) | Qwen3.5-0.8B | scored | 1/10 | 10.0% ± 22.6 |
| 78 | [qwen3.5-0.8b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.5-0.8b-mlx-07beb21e.md) | Qwen3.5-0.8B | scored | 0/10 | 0.0% ± 0.0 |
| 79 | [qwen3.6-35b-a3b-mlx](https://vcarl.com/evals/llms/draft/configs/qwen3.6-35b-a3b-mlx-ec9c90fe.md) | Qwen3.6-35B-A3B | not_run | 0/10 | 0.0% ± 0.0 |

Leaderboard: https://vcarl.com/evals/llms/draft/leaderboard.md
