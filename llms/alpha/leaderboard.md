# Leaderboard: Alpha challenge set

> Snapshot `f588ca4568895dfe3e83c6d11387683ec4f245f2ca83b02935f263f9e63067c6`: Alpha challenge set, eval version 0.7, executed 2026-06-19 – 2026-11-20. 110 configs over 10 challenges (169 items).

Ranked by pass rate: items passed over every item of the set, a missing or failed item counting as a fail. ± is the 95% interval half-width in points (clustered by item family); a config whose paired interval against its tier's head excludes 0 starts a new tier, so configs within a tier are not resolved from each other. Core and stretch are the pass rates over each item scope. Each config is one model on one stack (runtime, quant, chat template, sampler settings) on one machine. Method: [methodology](https://vcarl.com/evals/llms/methodology.md). Interactive view: https://vcarl.com/evals/

| Rank | Tier | Config | Model | Runtime | Quant | Pass rate ± 95% CI | Core | Stretch | Challenges run |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | [qwen3.8-27b-omlx-6bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-6bit-ae544e46.md) (runtime omlx · t0.7) | Qwen3.8-27B | omlx | 6bit | 94.7% ± 5.3 | 93.9% | 95.4% | 10/10 |
| 2 | 1 | [qwen3.8-27b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-1f237711.md) (runtime omlx · t1) | Qwen3.8-27B | omlx | 4bit | 94.1% ± 5.3 | 96.3% | 92.0% | 10/10 |
| 3 | 1 | [qwen3.8-flash-next-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-flash-next-llamacpp.md) | Qwen3.8-Flash-Next | llamacpp | UD-IQ4_XS | 93.5% ± 4.0 | 91.5% | 95.4% | 10/10 |
| 4 | 1 | [qwen3.8-27b-omlx-6bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-6bit-5082351c.md) (runtime omlx · t1) | Qwen3.8-27B | omlx | 6bit | 93.5% ± 5.4 | 95.1% | 92.0% | 10/10 |
| 5 | 1 | [flint-llamacpp](https://vcarl.com/evals/llms/alpha/configs/flint-llamacpp.md) | flint | llamacpp | Q8_0 | 93.5% ± 4.2 | 93.9% | 93.1% | 10/10 |
| 6 | 1 | [ling-3.0-flash-llamacpp](https://vcarl.com/evals/llms/alpha/configs/ling-3.0-flash-llamacpp.md) | Ling-3.0-flash | llamacpp | Q4_K_M | 93.5% ± 4.6 | 92.7% | 94.3% | 10/10 |
| 7 | 1 | [qwen3.8-27b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-1d44a8fb.md) (runtime omlx · t0.7) | Qwen3.8-27B | omlx | 4bit | 92.9% ± 5.6 | 96.3% | 89.7% | 10/10 |
| 8 | 1 | [qwen3.8-27b-omlx-5bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-5bit-2db43a69.md) (runtime omlx · t0.7) | Qwen3.8-27B | omlx | 5bit | 92.3% ± 5.5 | 93.9% | 90.8% | 10/10 |
| 9 | 1 | [cyber-tiel-coder-35b-a3b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/cyber-tiel-coder-35b-a3b-llamacpp.md) | Cyber-Tiel-Coder-35B-A3B | llamacpp | UD-Q8_K_XL | 92.3% ± 4.0 | 89.0% | 95.4% | 10/10 |
| 10 | 1 | [qwen3.8-27b-omlx-5bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-5bit-4ab20fb7.md) (runtime omlx · t1) | Qwen3.8-27B | omlx | 5bit | 91.7% ± 5.6 | 93.9% | 89.7% | 10/10 |
| 11 | 1 | [gemma-4-31b-llamacpp-q8](https://vcarl.com/evals/llms/alpha/configs/gemma-4-31b-llamacpp-q8.md) (quant Q8_0) | gemma-4-31B-it | llamacpp | Q8_0 | 91.7% ± 5.3 | 95.1% | 88.5% | 10/10 |
| 12 | 1 | [mistral-small-4-119b-omlx](https://vcarl.com/evals/llms/alpha/configs/mistral-small-4-119b-omlx-ed8f931e.md) | Mistral-Small-4-119B-2603 | omlx | 4bit | 91.7% ± 4.4 | 89.0% | 94.3% | 10/10 |
| 13 | 1 | [qwen3.8-27b-omlx-mtp](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-mtp-6a05a456.md) (t0.7) | Qwen3.8-27B-MTP | omlx | 4bit | 91.1% ± 5.8 | 95.1% | 87.4% | 10/10 |
| 14 | 2 | [qwen3.8-27b-omlx-mtp](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-omlx-mtp-86ad08bb.md) (t1) | Qwen3.8-27B-MTP | omlx | 4bit | 89.9% ± 6.2 | 93.9% | 86.2% | 10/10 |
| 15 | 2 | [nemotron-3.5-lightning-30b-a3b-omlx](https://vcarl.com/evals/llms/alpha/configs/nemotron-3.5-lightning-30b-a3b-omlx.md) | NVIDIA-Nemotron-3.5-Lightning-30B-A3B | omlx | 4bit | 88.8% ± 6.4 | 89.0% | 88.5% | 10/10 |
| 16 | 2 | [gemma-4-31b-mlx-8bit](https://vcarl.com/evals/llms/alpha/configs/gemma-4-31b-mlx-8bit.md) | gemma-4-31b-it | mlx | 8bit | 88.8% ± 5.5 | 91.5% | 86.2% | 10/10 |
| 17 | 2 | [mellum2.1-12b-a2.5b-thinking-omlx](https://vcarl.com/evals/llms/alpha/configs/mellum2.1-12b-a2.5b-thinking-omlx.md) | Mellum2.1-12B-A2.5B-Thinking | omlx | mxfp4 | 88.2% ± 5.8 | 84.1% | 92.0% | 10/10 |
| 18 | 2 | [gpt-oss-20b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/gpt-oss-20b-llamacpp.md) | gpt-oss-20b | llamacpp | Q8_0 | 87.9% ± 6.1 | 89.0% | 86.9% | 10/10 |
| 19 | 2 | [seed-oss-36b-omlx](https://vcarl.com/evals/llms/alpha/configs/seed-oss-36b-omlx.md) (runtime omlx · t1.1) | Seed-OSS-36B-Instruct | omlx | 4bit | 86.4% ± 5.6 | 85.4% | 87.4% | 10/10 |
| 20 | 2 | [gemma-4-12b-omlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-12b-omlx-ddab108f.md) | gemma-4-12B-it | omlx | 4bit | 85.2% ± 5.5 | 85.4% | 85.1% | 10/10 |
| 21 | 3 | [qwen3.6-27b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-27b-omlx.md) (runtime omlx · t1) | Qwen3.6-27B | omlx | 4bit | 84.6% ± 6.9 | 89.0% | 80.5% | 10/10 |
| 22 | 3 | [glm-4.7-flash-llamacpp](https://vcarl.com/evals/llms/alpha/configs/glm-4.7-flash-llamacpp.md) | GLM-4.7-Flash | llamacpp | Q8_0 | 83.4% ± 6.4 | 82.9% | 83.9% | 10/10 |
| 23 | 3 | [qwen3.8-27b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-mlx-9c06749c.md) (runtime mlx · t0.7) | Qwen3.8-27B | mlx | 4bit | 83.4% ± 6.8 | 81.7% | 85.1% | 10/10 |
| 24 | 3 | [qwen3.8-27b-mlx-5bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-mlx-5bit-db9266c9.md) (runtime mlx · t0.7) | Qwen3.8-27B | mlx | 5bit | 83.4% ± 6.6 | 84.1% | 82.8% | 10/10 |
| 25 | 3 | [qwen3.6-35b-a3b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-35b-a3b-omlx.md) (runtime omlx · t1) | Qwen3.6-35B-A3B | omlx | 4bit | 82.8% ± 6.4 | 86.6% | 79.3% | 10/10 |
| 26 | 3 | [qwen3.5-27b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-27b-omlx.md) (runtime omlx · t1) | Qwen3.5-27B | omlx | 4bit | 81.1% ± 8.6 | 93.9% | 69.0% | 10/10 |
| 27 | 3 | [qwen3.5-9b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-9b-omlx.md) (runtime omlx · t1 · maxTokens 32768) | Qwen3.5-9B | omlx | 4bit | 81.1% ± 7.6 | 87.8% | 74.7% | 10/10 |
| 28 | 3 | [gpt-oss-20b-omlx](https://vcarl.com/evals/llms/alpha/configs/gpt-oss-20b-omlx.md) (runtime omlx · t1 · maxTokens 32768) | gpt-oss-20b | omlx | 4bit | 80.5% ± 7.7 | 80.5% | 80.5% | 10/10 |
| 29 | 3 | [qwq-32b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwq-32b-mlx.md) | QwQ-32B | mlx | 4bit | 79.9% ± 8.1 | 81.7% | 78.2% | 10/10 |
| 30 | 4 | [gemma-4-e4b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/gemma-4-e4b-llamacpp.md) | gemma-4-E4B-it | llamacpp | Q8_0 | 77.5% ± 8.4 | 80.5% | 74.7% | 10/10 |
| 31 | 4 | [lfm3-1.7b-q4km-llamacpp](https://vcarl.com/evals/llms/alpha/configs/lfm3-1.7b-q4km-llamacpp.md) (quant Q4_K_M) | LFM3-1.7B | llamacpp | Q4_K_M | 77.5% ± 6.6 | 74.4% | 80.5% | 10/10 |
| 32 | 4 | [qwen3-32b-mlx-8bit](https://vcarl.com/evals/llms/alpha/configs/qwen3-32b-mlx-8bit.md) | Qwen3-32B | mlx | 8bit | 76.9% ± 8.4 | 82.9% | 71.3% | 10/10 |
| 33 | 4 | [qwen3.5-35b-a3b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-35b-a3b-omlx.md) (runtime omlx · t1) | Qwen3.5-35B-A3B | omlx | 4bit | 76.9% ± 9.9 | 89.0% | 65.5% | 10/10 |
| 34 | 4 | [laguna-s-2.1-omlx](https://vcarl.com/evals/llms/alpha/configs/laguna-s-2.1-omlx.md) | Laguna-S-2.1 | omlx | oQ4e | 76.3% ± 8.4 | 82.9% | 70.1% | 10/10 |
| 35 | 4 | [qwen3-32b-omlx-4bit](https://vcarl.com/evals/llms/alpha/configs/qwen3-32b-omlx-4bit.md) (runtime omlx · t0.6) | Qwen3-32B | omlx | 4bit | 76.3% ± 8.2 | 75.6% | 77.0% | 10/10 |
| 36 | 4 | [gemma-4-31b-omlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-31b-omlx.md) (runtime omlx · t1 · topP 0.95 · topK 64) | gemma-4-31b-it | omlx | 4bit | 75.7% ± 8.2 | 90.2% | 62.1% | 10/10 |
| 37 | 4 | [qwq-32b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwq-32b-llamacpp.md) (quant Q6_K) | QwQ-32B | llamacpp | Q6_K | 74.6% ± 8.9 | 81.7% | 67.8% | 10/10 |
| 38 | 4 | [gemma-4-26b-a4b-omlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-26b-a4b-omlx.md) (runtime omlx · t1 · topP 0.95 · topK 64) | gemma-4-26b-a4b-it | omlx | 4bit | 74.0% ± 8.1 | 86.6% | 62.1% | 10/10 |
| 39 | 4 | [deepseek-r1-qwen3-8b-omlx](https://vcarl.com/evals/llms/alpha/configs/deepseek-r1-qwen3-8b-omlx.md) (runtime omlx · maxTokens 32768) | DeepSeek-R1-0528-Qwen3-8B | omlx | 4bit | 73.4% ± 8.3 | 68.3% | 78.2% | 10/10 |
| 40 | 4 | [qwq-32b-llamacpp-q8](https://vcarl.com/evals/llms/alpha/configs/qwq-32b-llamacpp-q8.md) (quant Q8_0) | QwQ-32B | llamacpp | Q8_0 | 72.8% ± 9.8 | 82.9% | 63.2% | 10/10 |
| 41 | 4 | [qwen3-32b-mlx-4bit](https://vcarl.com/evals/llms/alpha/configs/qwen3-32b-mlx-4bit.md) (runtime mlx · t0.7) | Qwen3-32B | mlx | 4bit | 72.8% ± 8.8 | 80.5% | 65.5% | 10/10 |
| 42 | 4 | [qwen3-32b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3-32b-llamacpp.md) | Qwen3-32B | llamacpp | Q6_K | 72.2% ± 7.9 | 73.2% | 71.3% | 9/10 (partial) |
| 43 | 4 | [qwen3-coder-next-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3-coder-next-mlx.md) (runtime mlx · t0.7 · topP default · topK default) | Qwen3-Coder-Next | mlx | 4bit | 70.4% ± 8.0 | 80.5% | 60.9% | 10/10 |
| 44 | 4 | [qwen3-coder-next-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3-coder-next-omlx.md) (runtime omlx · t1 · topP 0.95 · topK 40) | Qwen3-Coder-Next | omlx | 4bit | 70.4% ± 8.3 | 80.5% | 60.9% | 10/10 |
| 45 | 5 | [qwq-32b-mlx-8bit](https://vcarl.com/evals/llms/alpha/configs/qwq-32b-mlx-8bit.md) | QwQ-32B | mlx | 8bit | 69.8% ± 9.5 | 79.3% | 60.9% | 10/10 |
| 46 | 5 | [deepseek-r1-distill-qwen-7b-omlx](https://vcarl.com/evals/llms/alpha/configs/deepseek-r1-distill-qwen-7b-omlx.md) (runtime omlx) | DeepSeek-R1-Distill-Qwen-7B | omlx | 4bit | 68.6% ± 8.0 | 62.2% | 74.7% | 10/10 |
| 47 | 5 | [gpt-oss-20b-mlx](https://vcarl.com/evals/llms/alpha/configs/gpt-oss-20b-mlx.md) (runtime mlx · t0.6 · maxTokens 8192) | gpt-oss-20b | mlx | 4bit | 67.5% ± 8.9 | 79.3% | 56.3% | 10/10 |
| 48 | 5 | [qwen3-coder-30b-a3b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3-coder-30b-a3b-omlx.md) (runtime omlx) | Qwen3-Coder-30B-A3B-Instruct | omlx | 4bit | 66.3% ± 7.8 | 72.0% | 60.9% | 10/10 |
| 49 | 5 | [phi-4-llamacpp](https://vcarl.com/evals/llms/alpha/configs/phi-4-llamacpp.md) | phi-4 | llamacpp | Q8_0 | 65.7% ± 7.9 | 72.0% | 59.8% | 10/10 |
| 50 | 5 | [phi-4-omlx-8bit](https://vcarl.com/evals/llms/alpha/configs/phi-4-omlx-8bit.md) (runtime omlx · t0) | phi-4 | omlx | 8bit | 65.1% ± 8.1 | 73.2% | 57.5% | 10/10 |
| 51 | 5 | [devstral-small-2-24b-omlx](https://vcarl.com/evals/llms/alpha/configs/devstral-small-2-24b-omlx.md) (runtime omlx · t0.15) | Devstral-Small-2-24B-Instruct-2512 | omlx | 4bit | 64.5% ± 9.0 | 75.6% | 54.0% | 10/10 |
| 52 | 5 | [mistral-small-3.2-24b-omlx](https://vcarl.com/evals/llms/alpha/configs/mistral-small-3.2-24b-omlx.md) (runtime omlx · t0.15) | Mistral-Small-3.2-24B-Instruct-2506 | omlx | 4bit | 64.5% ± 8.3 | 67.1% | 62.1% | 10/10 |
| 53 | 5 | [qwen2.5-32b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen2.5-32b-omlx.md) (runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05) | Qwen2.5-32B-Instruct | omlx | 4bit | 63.9% ± 9.2 | 75.6% | 52.9% | 10/10 |
| 54 | 5 | [gemma-4-12b-omlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-12b-omlx-847b3b7a.md) | gemma-4-12B-it | omlx | 4bit | 63.9% ± 8.6 | 78.0% | 50.6% | 10/10 |
| 55 | 5 | [qwen2.5-32b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen2.5-32b-mlx.md) (runtime mlx · topP default · topK default · repetitionPenalty default) | Qwen2.5-32B-Instruct | mlx | 4bit | 63.9% ± 9.7 | 79.3% | 49.4% | 10/10 |
| 56 | 5 | [phi-4-omlx](https://vcarl.com/evals/llms/alpha/configs/phi-4-omlx.md) (runtime omlx · t0) | phi-4 | omlx | 4bit | 63.3% ± 8.0 | 74.4% | 52.9% | 10/10 |
| 57 | 5 | [deepseek-r1-distill-qwen-7b-mlx](https://vcarl.com/evals/llms/alpha/configs/deepseek-r1-distill-qwen-7b-mlx.md) (runtime mlx) | DeepSeek-R1-Distill-Qwen-7B | mlx | 4bit | 63.3% ± 8.3 | 54.9% | 71.3% | 10/10 |
| 58 | 5 | [magistral-small-2509-omlx](https://vcarl.com/evals/llms/alpha/configs/magistral-small-2509-omlx.md) (runtime omlx · t0.7 · topP 0.95) | Magistral-Small-2509 | omlx | 4bit | 63.3% ± 8.3 | 73.2% | 54.0% | 10/10 |
| 59 | 5 | [qwen3-coder-30b-a3b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3-coder-30b-a3b-llamacpp.md) | Qwen3-Coder-30B-A3B-Instruct | llamacpp | Q8_0 | 63.3% ± 7.8 | 76.8% | 50.6% | 10/10 |
| 60 | 5 | [phi-4-mlx-8bit](https://vcarl.com/evals/llms/alpha/configs/phi-4-mlx-8bit.md) (runtime mlx · t0.7) | phi-4 | mlx | 8bit | 62.7% ± 8.7 | 67.1% | 58.6% | 10/10 |
| 61 | 5 | [mistral-small-4-119b-omlx](https://vcarl.com/evals/llms/alpha/configs/mistral-small-4-119b-omlx-a406562b.md) | Mistral-Small-4-119B-2603 | omlx | 4bit | 62.7% ± 8.7 | 80.5% | 46.0% | 10/10 |
| 62 | 5 | [mistral-small-3.2-24b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/mistral-small-3.2-24b-llamacpp.md) | Mistral-Small-3.2-24B-Instruct-2506 | llamacpp | Q6_K | 62.7% ± 8.2 | 70.7% | 55.2% | 10/10 |
| 63 | 5 | [seed-oss-36b-mlx](https://vcarl.com/evals/llms/alpha/configs/seed-oss-36b-mlx.md) (runtime mlx · t0.7) | Seed-OSS-36B-Instruct | mlx | 4bit | 62.1% ± 12.5 | 85.4% | 40.2% | 8/10 (partial) |
| 64 | 5 | [devstral-small-2-24b-mlx](https://vcarl.com/evals/llms/alpha/configs/devstral-small-2-24b-mlx.md) (runtime mlx · t0.7) | Devstral-Small-2-24B-Instruct-2512 | mlx | 4bit | 62.1% ± 8.1 | 73.2% | 51.7% | 10/10 |
| 65 | 5 | [magistral-small-2509-mlx](https://vcarl.com/evals/llms/alpha/configs/magistral-small-2509-mlx.md) (runtime mlx · t0.6 · topP default) | Magistral-Small-2509 | mlx | 4bit | 60.4% ± 9.1 | 73.2% | 48.3% | 10/10 |
| 66 | 6 | [deepseek-r1-qwen3-8b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/deepseek-r1-qwen3-8b-llamacpp.md) | DeepSeek-R1-0528-Qwen3-8B | llamacpp | Q8_0 | 59.8% ± 10.2 | 69.5% | 50.6% | 10/10 |
| 67 | 6 | [gemma-4-31b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/gemma-4-31b-llamacpp.md) (quant Q4_K_M) | gemma-4-31B-it | llamacpp | Q4_K_M | 59.8% ± 12.4 | 80.5% | 40.2% | 7/10 (partial) |
| 68 | 6 | [gemma-4-e4b-omlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-e4b-omlx.md) (runtime omlx · t1 · maxTokens 32768 · topP 0.95 · topK 64) | gemma-4-e4b-it | omlx | 4bit | 59.2% ± 8.8 | 68.3% | 50.6% | 10/10 |
| 69 | 6 | [deepseek-r1-qwen3-8b-mlx](https://vcarl.com/evals/llms/alpha/configs/deepseek-r1-qwen3-8b-mlx.md) (runtime mlx · maxTokens 8192) | DeepSeek-R1-0528-Qwen3-8B | mlx | 4bit | 58.6% ± 9.4 | 72.0% | 46.0% | 10/10 |
| 70 | 6 | [mistral-small-3.2-24b-mlx](https://vcarl.com/evals/llms/alpha/configs/mistral-small-3.2-24b-mlx.md) (runtime mlx · t0.7) | Mistral-Small-3.2-24B-Instruct-2506 | mlx | 4bit | 57.4% ± 9.1 | 64.6% | 50.6% | 10/10 |
| 71 | 6 | [gemma-4-31b-mlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-31b-mlx.md) (runtime mlx · t0.7 · topP default · topK default) | gemma-4-31b-it | mlx | 4bit | 56.8% ± 12.5 | 90.2% | 25.3% | 9/10 (partial) |
| 72 | 6 | [phi-4-mlx](https://vcarl.com/evals/llms/alpha/configs/phi-4-mlx.md) (runtime mlx · t0.7) | phi-4 | mlx | 4bit | 56.2% ± 8.4 | 58.5% | 54.0% | 9/10 (partial) |
| 73 | 6 | [deepseek-coder-v2-lite-llamacpp](https://vcarl.com/evals/llms/alpha/configs/deepseek-coder-v2-lite-llamacpp.md) | DeepSeek-Coder-V2-Lite-Instruct | llamacpp | Q8_0 | 55.0% ± 8.3 | 63.4% | 47.1% | 10/10 |
| 74 | 6 | [qwen3-coder-next-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3-coder-next-llamacpp.md) | Qwen3-Coder-Next | llamacpp | Q5_K_M | 52.7% ± 11.6 | 84.1% | 23.0% | 8/10 (partial) |
| 75 | 6 | [kimi-linear-48b-a3b-mlx](https://vcarl.com/evals/llms/alpha/configs/kimi-linear-48b-a3b-mlx.md) | Kimi-Linear-48B-A3B-Instruct | mlx | 4bit | 50.3% ± 11.2 | 80.5% | 21.8% | 8/10 (partial) |
| 76 | 6 | [qwen2.5-7b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen2.5-7b-mlx.md) (runtime mlx · topP default · topK default · repetitionPenalty default) | Qwen2.5-7B-Instruct | mlx | 4bit | 50.3% ± 8.8 | 67.1% | 34.5% | 10/10 |
| 77 | 6 | [qwen3.8-27b-mlx-6bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-mlx-6bit.md) (runtime mlx · t0.7) | Qwen3.8-27B | mlx | 6bit | 50.3% ± 12.1 | 61.0% | 40.2% | 5/10 (partial) |
| 78 | 6 | [qwen2.5-7b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen2.5-7b-omlx.md) (runtime omlx · topP 0.8 · topK 20 · repetitionPenalty 1.05) | Qwen2.5-7B-Instruct | omlx | 4bit | 48.5% ± 8.9 | 64.6% | 33.3% | 10/10 |
| 79 | 6 | [nemotron-nano-8b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/nemotron-nano-8b-llamacpp-b1713775.md) (chatTemplate nemotron-nano-8b-v1) | Llama-3.1-Nemotron-Nano-8B-v1 | llamacpp | Q8_0 | 48.5% ± 7.7 | 45.1% | 51.7% | 10/10 |
| 80 | 6 | [gemma-4-e4b-mlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-e4b-mlx.md) (runtime mlx · t0.7 · maxTokens 2048 · topP default · topK default) | gemma-4-e4b-it | mlx | 4bit | 48.5% ± 11.8 | 78.0% | 20.7% | 10/10 |
| 81 | 7 | [llama3.1-8b-mlx](https://vcarl.com/evals/llms/alpha/configs/llama3.1-8b-mlx.md) (runtime mlx · t0.7 · topP default) | Meta-Llama-3.1-8B-Instruct | mlx | 4bit | 45.0% ± 8.7 | 56.1% | 34.5% | 10/10 |
| 82 | 7 | [llama3.1-8b-omlx](https://vcarl.com/evals/llms/alpha/configs/llama3.1-8b-omlx.md) (runtime omlx · t0.6 · topP 0.9) | Meta-Llama-3.1-8B-Instruct | omlx | 4bit | 45.0% ± 8.4 | 53.7% | 36.8% | 10/10 |
| 83 | 7 | [llama3.1-8b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/llama3.1-8b-llamacpp.md) | Meta-Llama-3.1-8B-Instruct | llamacpp | Q8_0 | 41.4% ± 9.3 | 56.1% | 27.6% | 10/10 |
| 84 | 7 | [gemma-4-26b-a4b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/gemma-4-26b-a4b-llamacpp.md) | gemma-4-26B-A4B-it | llamacpp | Q8_0 | 40.8% ± 11.8 | 41.5% | 40.2% | 5/10 (partial) |
| 85 | 7 | [qwen3.5-122b-a10b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-122b-a10b-mlx.md) | Qwen3.5-122B-A10B | mlx | 4bit | 40.8% ± 11.8 | 41.5% | 40.2% | 5/10 (partial) |
| 86 | 7 | [gemma-4-26b-a4b-mlx](https://vcarl.com/evals/llms/alpha/configs/gemma-4-26b-a4b-mlx.md) (runtime mlx · t0.7 · topP default · topK default) | gemma-4-26b-a4b-it | mlx | 4bit | 40.2% ± 10.6 | 82.9% | 0.0% | 7/10 (partial) |
| 87 | 7 | [lfm3-1.7b-bf16-llamacpp](https://vcarl.com/evals/llms/alpha/configs/lfm3-1.7b-bf16-llamacpp.md) (quant BF16) | LFM3-1.7B | llamacpp | BF16 | 40.2% ± 11.8 | 41.5% | 39.1% | 5/10 (partial) |
| 88 | 7 | [glm-4.7-flash-mlx](https://vcarl.com/evals/llms/alpha/configs/glm-4.7-flash-mlx.md) (runtime mlx · t0.6) | GLM-4.7-Flash | mlx | 4bit | 39.1% ± 9.6 | 58.5% | 20.7% | 10/10 |
| 89 | 7 | [qwen3.6-27b-mlx-8bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-27b-mlx-8bit.md) | Qwen3.6-27B | mlx | 8bit | 37.9% ± 10.3 | 78.0% | 0.0% | 6/10 (partial) |
| 90 | 7 | [qwen3.5-2b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-2b-omlx.md) (runtime omlx · maxTokens 32768 · topP 0.8 · topK 20 · minP 0 · presencePenalty 1.5) | Qwen3.5-2B | omlx | 4bit | 37.3% ± 7.8 | 43.9% | 31.0% | 10/10 |
| 91 | 7 | [qwen3.5-35b-a3b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-35b-a3b-mlx.md) (runtime mlx · t0.7) | Qwen3.5-35B-A3B | mlx | 4bit | 36.1% ± 10.4 | 25.6% | 46.0% | 5/10 (partial) |
| 92 | 7 | [qwen3-coder-30b-a3b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3-coder-30b-a3b-mlx.md) (runtime mlx) | Qwen3-Coder-30B-A3B-Instruct | mlx | 4bit | 33.7% ± 8.4 | 40.2% | 27.6% | 7/10 (partial) |
| 93 | 7 | [qwen3.6-27b-llamacpp-q8](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-27b-llamacpp-q8.md) | Qwen3.6-27B | llamacpp | Q8_0 | 33.7% ± 9.6 | 69.5% | 0.0% | 5/10 (partial) |
| 94 | 7 | [qwen3.6-27b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-27b-mlx.md) (runtime mlx · t0.7) | Qwen3.6-27B | mlx | 4bit | 32.5% ± 9.4 | 67.1% | 0.0% | 6/10 (partial) |
| 95 | 8 | [nemotron-nano-8b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/nemotron-nano-8b-llamacpp-3d777362.md) (chatTemplate default) | Llama-3.1-Nemotron-Nano-8B-v1 | llamacpp | Q8_0 | 30.8% ± 7.1 | 34.1% | 27.6% | 9/10 (partial) |
| 96 | 8 | [qwen3.6-35b-a3b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-35b-a3b-mlx.md) (runtime mlx · t0.7) | Qwen3.6-35B-A3B | mlx | 4bit | 29.0% ± 9.0 | 37.8% | 20.7% | 5/10 (partial) |
| 97 | 8 | [glm-4.7-flash-omlx](https://vcarl.com/evals/llms/alpha/configs/glm-4.7-flash-omlx.md) (runtime omlx · t1) | GLM-4.7-Flash | omlx | 4bit | 27.8% ± 8.2 | 45.1% | 11.5% | 5/10 (partial) |
| 98 | 8 | [qwen3.6-35b-a3b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3.6-35b-a3b-llamacpp.md) | Qwen3.6-35B-A3B | llamacpp | Q6_K | 25.4% ± 8.2 | 52.4% | 0.0% | 5/10 (partial) |
| 99 | 8 | [qwen3.5-0.8b-omlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-0.8b-omlx.md) (runtime omlx · maxTokens 32768 · topP 0.8 · topK 20 · minP 0 · presencePenalty 1.5) | Qwen3.5-0.8B | omlx | 4bit | 23.7% ± 6.7 | 19.5% | 27.6% | 10/10 |
| 100 | 8 | [hunyuan-a13b-mlx](https://vcarl.com/evals/llms/alpha/configs/hunyuan-a13b-mlx.md) | Hunyuan-A13B-Instruct | mlx | 4bit | 23.7% ± 7.8 | 39.0% | 9.2% | 9/10 (partial) |
| 101 | 8 | [qwen3.8-27b-mlx-5bit](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-mlx-5bit-1eb20a8b.md) (runtime mlx · t0.7) | Qwen3.8-27B | mlx | 5bit | 20.7% ± 11.5 | 0.0% | 40.2% | 1/10 (partial) |
| 102 | 8 | [qwen3.8-27b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-mlx-9a061315.md) (runtime mlx · t0.7) | Qwen3.8-27B | mlx | 4bit | 20.7% ± 11.5 | 0.0% | 40.2% | 1/10 (partial) |
| 103 | 8 | [qwen3.5-9b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-9b-mlx.md) (runtime mlx · t0.7 · maxTokens 8192) | Qwen3.5-9B | mlx | 4bit | 20.1% ± 7.2 | 41.5% | 0.0% | 4/10 (partial) |
| 104 | 8 | [qwen3.5-27b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-27b-mlx.md) (runtime mlx · t0.7) | Qwen3.5-27B | mlx | 4bit | 20.1% ± 7.2 | 41.5% | 0.0% | 4/10 (partial) |
| 105 | 8 | [qwen3.5-27b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-27b-llamacpp.md) | Qwen3.5-27B | llamacpp | Q6_K | 20.1% ± 7.2 | 41.5% | 0.0% | 4/10 (partial) |
| 106 | 8 | [qwen3.5-9b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-9b-llamacpp.md) | Qwen3.5-9B | llamacpp | Q8_0 | 18.9% ± 7.0 | 39.0% | 0.0% | 4/10 (partial) |
| 107 | 9 | [qwen3.5-2b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-2b-mlx.md) (runtime mlx · maxTokens 2048 · topP default · topK default · minP default · presencePenalty default) | Qwen3.5-2B | mlx | 4bit | 14.2% ± 5.9 | 25.6% | 3.4% | 10/10 |
| 108 | 9 | [qwen3.5-35b-a3b-llamacpp](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-35b-a3b-llamacpp.md) | Qwen3.5-35B-A3B | llamacpp | Q8_0 | 12.4% ± 5.6 | 25.6% | 0.0% | 3/10 (partial) |
| 109 | 9 | [qwen3.8-27b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.8-27b-mlx-151c6153.md) (runtime mlx · t0.7) | Qwen3.8-27B | mlx | 4bit | 7.1% ± 7.3 | 0.0% | 13.8% | 1/10 (partial) |
| 110 | 10 | [qwen3.5-0.8b-mlx](https://vcarl.com/evals/llms/alpha/configs/qwen3.5-0.8b-mlx.md) (runtime mlx · maxTokens 2048 · topP default · topK default · minP default · presencePenalty default) | Qwen3.5-0.8B | mlx | 4bit | 3.0% ± 2.6 | 4.9% | 1.1% | 10/10 |

Challenges: [code](https://vcarl.com/evals/llms/alpha/challenges/code.md), [constraint](https://vcarl.com/evals/llms/alpha/challenges/constraint.md), [economics](https://vcarl.com/evals/llms/alpha/challenges/economics.md), [effect-ts](https://vcarl.com/evals/llms/alpha/challenges/effect-ts.md), [factual](https://vcarl.com/evals/llms/alpha/challenges/factual.md), [financial](https://vcarl.com/evals/llms/alpha/challenges/financial.md), [logic](https://vcarl.com/evals/llms/alpha/challenges/logic.md), [math](https://vcarl.com/evals/llms/alpha/challenges/math.md), [smoke](https://vcarl.com/evals/llms/alpha/challenges/smoke.md), [trust](https://vcarl.com/evals/llms/alpha/challenges/trust.md).

Release notes: https://vcarl.com/evals/llms/alpha/release.md · Errata: https://vcarl.com/evals/llms/alpha/errata.md
