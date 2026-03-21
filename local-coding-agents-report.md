# Open-Source Coding Agents and Local LLMs: State of the Art (March 2026)

## 1. Open-Source Coding Agent Harnesses

### Aider

**What it does:** CLI-based AI pair programming tool that runs in your terminal. The only major agent that treats Git as a first-class citizen -- it stages changes and writes commit messages automatically. Supports "architect" and "editor" modes for planning vs. executing changes.

**Local LLM support:** Connects via Ollama (`aider --model ollama_chat/<model>`), llama.cpp server, or any OpenAI-compatible API endpoint. Critical caveat: Ollama defaults to a 2K context window, which silently discards context. You must explicitly configure a larger context (8K+ minimum).

**What models work well:** Qwen 2.5 Coder 32B and Qwen3-Coder 30B-A3B are the best-performing local models. Aider's own benchmark shows Qwen3-Coder-Next scoring 66.2 on their polyglot benchmark. DeepSeek Coder V2 16B is a reasonable mid-range option.

### Continue.dev

**What it does:** Open-source VS Code/JetBrains extension that provides chat, autocomplete (tab completion), and codebase Q&A. Designed from the ground up for local LLM integration. No telemetry, no cloud -- everything runs locally.

**Local LLM support:** Native Ollama integration, llama.cpp, LM Studio, and any OpenAI-compatible endpoint. Separate model configuration for chat vs. autocomplete (FIM) roles, so you can run a small 3-7B model for autocomplete and a larger model for chat.

**What models work well:** For autocomplete: Qwen 2.5 Coder 7B or StarCoder2 3B (FIM-capable). For chat: Qwen 2.5 Coder 14B-32B, DeepSeek Coder V2. Continue is considered the superior tool for codebase Q&A with local models.

### Cline (formerly Claude Dev) / Roo Code

**What it does:** VS Code extensions providing autonomous agentic coding. Cline indexes the entire repository at startup, mapping file relationships, dependencies, and call hierarchies. It can reason across a codebase holistically. Roo Code is a fork/evolution of Cline with explicit multi-agent modes (Architect, Act, Ask). Cline has 58.7K GitHub stars.

**Key difference:** Cline auto-indexes the repo; Roo Code uses explicit context selection via `@file` / `@dir` markers, giving the developer more control over scope.

**Local LLM support:** Both support Ollama, OpenAI-compatible APIs, and other providers via BYOK (bring your own key). Works with any model that supports tool calling. The cheapest approach is Ollama (free) or providers like DeepSeek.

**What models work well:** Requires models with reliable tool-calling support. Qwen 2.5 Coder 32B handles tool-calling patterns most reliably among local models, producing fewer hallucinated function calls. Smaller models (7-14B) struggle with the multi-step agentic workflows these tools demand.

### OpenHands

**What it does:** An open-source, model-agnostic platform for cloud coding agents. Built primarily as a research platform for building test harnesses, exploring agent architectures, and running SWE-bench benchmarks. Not primarily designed for daily production coding workflows.

**Local LLM support:** Model-agnostic by design; connects to any LLM provider via standard APIs. Supports local models through OpenAI-compatible endpoints.

**Best for:** Research, benchmarking, exploring agent architectures. Less polished for day-to-day developer use compared to Aider or Cline.

### SWE-agent / mini-SWE-agent

**What it does:** Takes a GitHub issue and attempts to automatically fix it. State of the art on SWE-bench among open-source projects. Built and maintained by researchers at Princeton and Stanford. The team now recommends **mini-SWE-agent** -- a lightweight reimplementation in ~100 lines of Python that matches full SWE-agent performance.

**Local LLM support:** Models are pluggable through LiteLLM, so you can use OpenAI, Anthropic, or local models. Configuration is governed by a single YAML file.

**Best for:** Automated issue resolution, security research, benchmarking. Research-oriented; not a daily coding companion.

### OpenCode

**What it does:** A newer open-source coding agent (120K+ GitHub stars, 5M+ monthly users) available as CLI, desktop app, and VS Code extension. Focuses on flexibility and privacy -- stores no code or context data.

**Local LLM support:** Supports 75+ model providers including local models through Ollama. Terminal-native UI with multi-session support.

**Best for:** Developers wanting a Claude Code-like CLI experience with local model support and no vendor lock-in.

### Tabby

**What it does:** Self-hosted AI coding assistant -- an open-source, on-premises alternative to GitHub Copilot. Deploys as a code completion server. Self-contained with no DBMS or cloud dependencies required.

**Local LLM support:** Runs on consumer-grade GPUs. Supports CodeLlama, StarCoder, Qwen Coder, and other models. Three model types: Completion (FIM), Chat, and Embedding, each configurable independently. Native OpenAPI interface.

**Best for:** Teams wanting a self-hosted Copilot replacement focused on code completion/autocomplete.

### Mentat

**What it does:** CLI-based coding assistant that coordinates edits across multiple files. Integrates with Git. Designed for understanding new codebases, adding features, and refactoring.

**Local LLM support:** Supports OpenAI-compatible APIs. Less mature local model integration compared to Aider or Continue.

**Current status:** Less actively developed compared to the leaders (Aider, Cline, Continue). Worth knowing about but not the first recommendation in 2026.

---

## 2. How They Are Controlled

### Interfaces

| Tool | CLI | VS Code | Web UI | Desktop | API Server |
|------|-----|---------|--------|---------|------------|
| Aider | Primary | No (terminal) | No | No | No |
| Continue.dev | No | Primary | No | No | No |
| Cline/Roo Code | No | Primary | No | No | No |
| OpenHands | No | No | Primary | No | Yes |
| SWE-agent | Primary | No | No | No | No |
| OpenCode | Primary | Extension | No | Yes | No |
| Tabby | No | Extension | Admin UI | No | Yes (OpenAPI) |

### Tool Use and File Editing

**Agentic tools (Cline, Roo Code, OpenCode, Aider):** These agents use tool-calling to perform actions -- reading files, writing files, running terminal commands, searching code. The model decides which tool to invoke and with what arguments. This requires models that reliably follow tool-calling schemas. Cline and Roo Code present each action for human approval before executing (unless auto-approve is enabled).

**Autocomplete tools (Tabby, Continue.dev autocomplete):** No tool use involved. These use FIM (fill-in-the-middle) prompting, sending prefix and suffix code and predicting what goes between. Much simpler inference; small models (3-7B) work well.

**File editing patterns:**
- Aider uses a "diff" format -- the model outputs search/replace blocks that Aider applies to files. This is Git-aware.
- Cline/Roo Code use direct file writes with human approval gates.
- OpenCode uses similar tool-based file operations.

### Protocols That Matter

**OpenAI-compatible API (`/v1/chat/completions`):** The universal standard. Everything connects to this. Both Ollama and llama.cpp server expose this endpoint. Any tool that accepts a `base_url` parameter works: Aider, Continue, Cline, OpenCode, Tabby.

**Ollama API:** Native Ollama protocol at `http://localhost:11434`. Some tools (Continue, Aider) have first-class Ollama integration that handles model pulling and configuration. Since January 2026, Ollama also supports the Anthropic Messages API, which enables Claude Code to connect directly to Ollama models.

**Ollama vs. llama.cpp server:** Ollama is easier (model management, auto-download). llama.cpp server gives more control (quantization options, context size, GPU layer offloading). For most users, Ollama is the right choice. Power users who need to tune performance use llama.cpp directly.

---

## 3. What Tasks They Do Well

### Task Performance by Category

**Code completion / autocomplete:**
- Best served by FIM-capable models via Tabby or Continue.dev autocomplete
- Even 3B models perform well here (StarCoder2 3B, Qwen 2.5 Coder 3B)
- Latency matters more than raw quality -- smaller models win because they respond instantly
- Local models are genuinely competitive with Copilot for basic completions

**Single-file editing and refactoring:**
- Aider, Continue chat, Cline all handle this well with 14B+ models
- Qwen 2.5 Coder 14B scores ~85% on HumanEval
- This is where local models have closed the gap the most

**Bug fixing (automated):**
- SWE-bench Verified is the key benchmark
- Cloud: Claude Opus 4 scores 46.2%, GPT-4 Turbo 38.7%
- Local: Qwen 3.5 27B ties GPT-5 mini at 72.4% on SWE-bench Verified (a remarkable result)
- Qwen 2.5 Coder 32B is "noticeably better at agentic tasks" than DeepSeek alternatives
- For sub-14B models, bug fixing reliability drops significantly

**Test generation:**
- Works reasonably well with 14B+ models
- Models can generate unit tests, but struggle with complex integration test scenarios
- Best results when the model can see the implementation code (needs adequate context window)

**Multi-file changes:**
- This is where the gap between local and cloud models widens
- Requires strong tool-calling, long context, and multi-step planning
- Qwen 2.5 Coder 32B and Qwen3-Coder are the most reliable local options
- Sub-14B models fail frequently on cross-file edits

**Agentic tasks (autonomous multi-step workflows):**
- The most demanding category -- model must plan, execute tools, handle errors, iterate
- 24GB VRAM / 32GB unified memory is the minimum for productive agentic coding
- CPU-only inference is too slow for multi-turn agentic workflows
- Qwen3-Coder-Next (80B total, 3B active via MoE) is designed specifically for this

### Which Local Models for Which Tasks

| Task | Minimum Useful Size | Recommended Model |
|------|---------------------|-------------------|
| Autocomplete (FIM) | 3B | StarCoder2 3B, Qwen 2.5 Coder 7B |
| Chat / Q&A about code | 7B | Qwen 2.5 Coder 14B |
| Single-file editing | 14B | Qwen 2.5 Coder 14B-32B |
| Bug fixing | 14B+ | Qwen 2.5 Coder 32B, Qwen 3.5 27B |
| Multi-file agentic | 27B+ | Qwen3-Coder 30B-A3B, Qwen 3.5 27B |
| Complex reasoning | 32B+ | Qwen 2.5 Coder 32B, DeepSeek V3 (if hardware allows) |

---

## 4. Local Model Recommendations for Coding

### Tier List (March 2026)

**Tier 1: Best overall local coding models**

- **Qwen 2.5 Coder 32B** -- The most proven local coding model. ~85% HumanEval at 14B, strong agentic performance at 32B. Reliable tool-calling. 128K context. "Genuinely competes with GPT-4o" according to multiple sources. Requires ~20GB VRAM at Q4.
- **Qwen 3.5 27B** -- Ties GPT-5 mini on SWE-bench Verified (72.4%). Fits at ~16GB Q4. A remarkable achievement for a local model.
- **Qwen3-Coder 30B-A3B** -- MoE architecture with only 3B active parameters. Designed for agentic coding. 256K context. Strong tool-calling. Balances capability with hardware efficiency.
- **Qwen3-Coder-Next** -- 80B total / 3B active. Matches models with 10-20x more active parameters. 262K context. Needs ~46GB RAM/VRAM at default precision.

**Tier 2: Strong mid-range options**

- **Qwen 2.5 Coder 14B** -- Best quality-to-size ratio for coding. ~85% HumanEval. Fits in 12GB VRAM at Q4. Good for single-file tasks.
- **DeepSeek Coder V2 16B** -- Fastest token-for-token due to MoE architecture. 43% HumanEval, 16GB size. Good balance for hardware-constrained setups.
- **Codestral 22B (Mistral)** -- Strong code generation, good FIM support for autocomplete.

**Tier 3: Small / edge models**

- **Qwen 2.5 Coder 7B** -- Best sub-10B coding model. Good for autocomplete. Fits in 8GB.
- **Qwen 3.5 9B** -- New default recommendation for 8GB cards. 6.6GB on Ollama. Beats older 8B models on every benchmark.
- **StarCoder2 3B** -- Excellent for FIM autocomplete only. Too small for chat/agentic use.

**Tier 4: Showing their age**

- **CodeLlama 7B** -- ~30% HumanEval. "Lapped by models half its size from newer families." Not recommended in 2026.
- **CodeLlama 34B** -- Still usable but outperformed by Qwen 2.5 Coder 14B at half the size.
- **StarCoder 15B (v1)** -- Superseded by StarCoder2 and Qwen models.

### Context Window Sizes That Matter

- **2K (Ollama default):** Completely inadequate. Silently discards context. Always override this.
- **8K:** Bare minimum for Aider. Enough for small single-file tasks.
- **16K-32K:** Practical for most coding tasks. Good balance of memory usage vs. capability.
- **64K-128K:** Needed for large file editing, multi-file context. Qwen 2.5 Coder and DeepSeek V2 both support 128K natively.
- **256K:** Qwen3-Coder supports this. Useful for very large codebases but requires significant RAM.

### FIM (Fill-in-the-Middle) for Autocomplete

FIM is the industry standard for code completion. The model receives prefix + suffix and predicts the middle. Not all models support FIM -- you need models specifically trained with FIM objectives:

- **FIM-capable:** Qwen 2.5 Coder (all sizes), Qwen3-Coder, StarCoder2, Codestral, DeepSeek Coder
- **Not FIM-capable:** Most general chat models (Llama 3, Mistral instruct variants without code training)
- **For autocomplete specifically:** Use the smallest FIM-capable model that feels responsive. A 3-7B model at low latency beats a 32B model with noticeable delay.

### General vs. Specialized Models

Specialized coding models (Qwen Coder, DeepSeek Coder, StarCoder) consistently outperform general-purpose models of the same size on coding tasks. Qwen 2.5 Coder 14B beats Llama 3.3 70B on HumanEval despite being 5x smaller. The specialization advantage is enormous at smaller sizes and narrows at 70B+.

---

## 5. Practical Setup Patterns

### Pattern 1: Ollama + Aider (CLI coding agent)

```bash
# Install
brew install ollama
pip install aider-chat

# Pull a model
ollama pull qwen2.5-coder:32b

# Start Ollama with adequate context (critical!)
# Set in Modelfile or via environment:
# OLLAMA_NUM_CTX=32768

# Run aider
aider --model ollama_chat/qwen2.5-coder:32b
```

Best for: Developers comfortable with CLI who want Git-integrated AI pair programming. 24GB+ VRAM recommended for 32B models.

### Pattern 2: Ollama + Continue.dev (VS Code autocomplete + chat)

```bash
# Install Ollama and pull models
ollama pull qwen2.5-coder:7b    # For autocomplete (FIM)
ollama pull qwen2.5-coder:14b   # For chat

# Install Continue.dev extension in VS Code
# Configure in ~/.continue/config.json:
# - Set autocomplete model to qwen2.5-coder:7b (FIM role)
# - Set chat model to qwen2.5-coder:14b
```

Best for: The most popular local coding setup. Provides Copilot-like autocomplete plus chat, all running locally. 12-16GB VRAM for running both models (or share one model).

### Pattern 3: Tabby for Team Autocomplete

```bash
# Run Tabby server (Docker)
docker run -it --gpus all \
  -p 8080:8080 \
  tabbyml/tabby serve \
  --model StarCoder2-3B \
  --device cuda

# Install Tabby extension in VS Code
# Point it at http://localhost:8080
```

Best for: Teams wanting a self-hosted Copilot replacement. Tabby handles model serving, and IDE extensions connect to it. Good for environments where code cannot leave the network.

### Pattern 4: llama.cpp Server (Maximum Control)

```bash
# Build llama.cpp
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp && make LLAMA_CUDA=1

# Start server with OpenAI-compatible API
./llama-server \
  -m models/qwen2.5-coder-32b-Q4_K_M.gguf \
  --host 0.0.0.0 --port 8000 \
  -c 32768 \
  -ngl 99

# Any tool that speaks OpenAI API can connect:
# aider --openai-api-base http://localhost:8000/v1 --model qwen2.5-coder
# Continue.dev: set base_url to http://localhost:8000/v1
# Cline: configure custom OpenAI-compatible provider
```

Best for: Power users who want precise control over quantization, GPU offloading, context length, and batch size. Better performance tuning than Ollama at the cost of more manual setup.

### Pattern 5: Hybrid Local + Cloud

Many developers in 2026 use a hybrid approach:
- **Continue.dev with local Qwen 7B** for fast autocomplete (free, private, low latency)
- **Cline or Aider with a cloud API** (Claude, GPT-4) for complex multi-file agentic tasks
- **Tabby** running on a team server for shared autocomplete

This acknowledges that local models excel at completion and simple edits, while cloud models are still ahead for complex reasoning.

---

## 6. Limitations: Real Gaps Between Local and Cloud

### The Honest Assessment

**Complex multi-step reasoning:** Cloud models (Claude Opus 4, GPT-4 Turbo) still outperform local models on tasks requiring extended chains of reasoning across multiple files. The gap is narrowing -- Qwen 3.5 27B matching GPT-5 mini on SWE-bench is a milestone -- but the very best cloud models maintain an edge on the hardest problems.

**Tool-calling reliability:** Local models produce more hallucinated function calls and malformed tool invocations than cloud models. Qwen 2.5 Coder 32B is the best local option here but still has a higher failure rate than Claude or GPT-4 on complex tool-use chains.

**Context utilization at scale:** While models advertise 128-256K context, local models degrade more in "needle-in-a-haystack" retrieval accuracy at 64K+ tokens compared to frontier cloud models. Practical reliable context for local models is more like 32-64K.

**Stale training data:** Open-source models are frozen at release. Qwen 2.5 Coder was trained on data up to mid-2024. It may suggest deprecated APIs, libraries with known CVEs, or outdated patterns. Cloud models are updated more frequently.

**Speed for agentic workflows:** Agentic coding requires responsive multi-turn inference. On consumer hardware, even a 32B model at Q4 is noticeably slower than a cloud API call. CPU-only inference is essentially unusable for agentic workflows. You need a dedicated GPU or Apple Silicon with 24GB+ unified memory.

**Minimum hardware floor:**
- 8GB VRAM: Autocomplete works. Chat is usable with 7-9B models. Agentic coding is not viable.
- 12GB VRAM: Chat and simple editing work with 14B models. Light agentic tasks possible.
- 16-24GB VRAM: The sweet spot. 27-32B models at Q4 are genuinely productive for most tasks.
- 32GB+ VRAM/unified: Can run MoE models (Qwen3-Coder) for near-cloud-quality agentic coding.

**What still requires cloud APIs (as of March 2026):**
- Novel algorithmic problem-solving with complex constraints
- Extremely large codebase reasoning (100K+ token contexts used reliably)
- Tasks requiring the latest API/framework knowledge
- Production-grade autonomous coding where failure rate matters
- Projects where a 5-10% improvement in accuracy translates to significant time savings

**What local models now handle well:**
- Code completion / autocomplete (competitive with Copilot)
- Single-file editing and refactoring
- Code explanation and Q&A
- Test generation for well-defined functions
- Bug fixing in isolated components
- Code review suggestions

### The Bottom Line

The gap is real but shrinking fast. In 2024, local models were a curiosity for coding. In March 2026, a developer with a 24GB GPU running Qwen 2.5 Coder 32B through Aider or Continue.dev has a genuinely useful coding assistant that handles 70-80% of tasks well. The remaining 20-30% -- the hardest multi-step reasoning, the most complex refactors, the cases where you need the best possible answer -- still benefits from cloud APIs. The pragmatic approach is hybrid: local for the common case, cloud for the hard problems.

---

## Sources

- [Open-source coding agents like OpenCode, Cline, and Aider - The New Stack](https://thenewstack.io/open-source-coding-agents-like-opencode-cline-and-aider-are-solving-a-huge-headache-for-developers/)
- [Best AI Coding Assistants March 2026 - Shakudo](https://www.shakudo.io/blog/best-ai-coding-assistants)
- [Cline vs Roo Code vs Continue 2026 - DevToolReviews](https://www.devtoolreviews.com/reviews/cline-vs-roo-code-vs-continue)
- [Best Local Coding Models Ranked 2026 - InsiderLLM](https://insiderllm.com/guides/best-local-coding-models-2026/)
- [Best Local AI Coding Models 2026 - LocalAIMaster](https://localaimaster.com/models/best-local-ai-coding-models)
- [Best Local LLM Models 2026 - AI Tool Discovery](https://www.aitooldiscovery.com/how-to/best-local-llm-models)
- [Ollama docs - Aider](https://aider.chat/docs/llms/ollama.html)
- [Running AI Coding Agents Locally with Ollama](https://atalupadhyay.wordpress.com/2026/01/27/running-ai-coding-agents-locally-with-ollama-launch/)
- [OpenCode - The open source AI coding agent](https://opencode.ai/)
- [OpenCode - InfoQ](https://www.infoq.com/news/2026/02/opencode-coding-agent/)
- [SWE-agent - GitHub](https://github.com/SWE-agent/SWE-agent)
- [Tabby - Self-hosted AI coding assistant](https://www.tabbyml.com/)
- [Tabby Code Completion docs](https://tabby.tabbyml.com/docs/administration/code-completion/)
- [Local AI Models for Coding: Is It Realistic in 2026? - Failing Fast](https://failingfast.io/local-coding-ai-models/)
- [LLM Coding Benchmark Comparison 2026 - SmartScope](https://smartscope.blog/en/generative-ai/chatgpt/llm-coding-benchmark-comparison-2026/)
- [Local LLMs vs Cloud LLMs 2026 - Free Academy](https://freeacademy.ai/blog/local-llms-vs-cloud-llms-ollama-privacy-comparison-2026)
- [5 Open-Source Coding LLMs You Can Run Locally 2026 - Labellerr](https://www.labellerr.com/blog/best-coding-llms/)
- [Qwen3-Coder - GitHub](https://github.com/QwenLM/Qwen3-Coder)
- [Qwen3-Coder-Next - Hugging Face](https://huggingface.co/Qwen/Qwen3-Coder-Next)
- [Roo Code vs Cline - Qodo](https://www.qodo.ai/blog/roo-code-vs-cline/)
- [Continue.dev Autocomplete docs](https://docs.continue.dev/customize/model-roles/autocomplete)
- [Ollama VRAM Requirements 2026 - LocalLLM.in](https://localllm.in/blog/ollama-vram-requirements-for-local-llms)
- [llama.cpp Server OpenAI API - Markaicode](https://markaicode.com/llama-cpp-server-openai-api-gguf/)
- [Qwen 2.5-Coder vs DeepSeek Coder Benchmark Comparison - Markaicode](https://markaicode.com/vs/qwen-2-5-coder-vs-deepseek-coder/)
- [Best Open-Source AI Coding Agents 2026 - The Unwind AI](https://www.theunwindai.com/p/best-open-source-ai-coding-agents-what-teams-can-actually-ship-with-in-2026)
