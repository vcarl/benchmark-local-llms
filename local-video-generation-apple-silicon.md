# Local Video Generation on Apple Silicon (128GB Unified Memory)

**Last updated: March 2026**

This report covers the practical state of running video generation models locally on Apple Silicon Macs with 128GB unified memory (e.g., M4 Max MacBook Pro, Mac Studio).

---

## 1. Frameworks and Tools

### ComfyUI (Recommended Primary Tool)

ComfyUI is the de facto standard for local AI image and video generation. It runs natively on macOS with Apple Silicon via Metal Performance Shaders (MPS).

- **Install**: Download the [Desktop app](https://www.comfy.org/download) or install via Python/pip
- **Video support**: Native workflow templates for Wan 2.2, LTX-Video, HunyuanVideo, Stable Video Diffusion, and more
- **Key advantage**: Node-based UI lets you build complex pipelines; large ecosystem of custom nodes
- **Mac-specific note**: Do NOT use `--lowvram` mode on Apple Silicon. The unified memory architecture means aggressive CPU offloading provides no benefit and actually hurts performance. Your 128GB unified memory acts as both system RAM and "VRAM" simultaneously.
- **GGUF support**: Quantized GGUF model formats dramatically reduce memory usage (run 14B parameter models in ~8-16GB) via special loader nodes

**Setup guide**: See [ComfyUI Mac M4 Max Complete Setup Guide](https://apatero.com/blog/comfyui-mac-m4-max-complete-setup-guide-2025).

### ComfyUI MLX Extension

An extension that accelerates inference by 50-70% on Apple Silicon by using Apple's MLX framework instead of PyTorch+MPS. Worth installing for any Mac-based ComfyUI setup.

### Draw Things (Native macOS App)

- Free native macOS/iOS app optimized for Apple Silicon
- Supports Wan 2.2, LTX-2.3 (with audio), and other video models
- Simplest setup: download from the App Store, models download automatically
- Requires 16GB+ RAM for video generation (no issue with 128GB)
- Good for beginners; less flexible than ComfyUI for advanced workflows

### MLX-Native Implementations

Apple's MLX framework has community ports of several video models:

| Project | Model | Status |
|---------|-------|--------|
| [Wan2.2-mlx](https://github.com/osama-ata/Wan2.2-mlx) | Wan 2.2 | Pure MLX, no PyTorch dependency |
| [LTX-2-MLX](https://github.com/Acelogic/LTX-2-MLX) | LTX-2 (19B/22B) | Community port |
| [HunyuanVideo_MLX](https://github.com/gaurav-nelson/HunyuanVideo_MLX) | HunyuanVideo | Native Apple Silicon |
| [ltx-video-mac](https://github.com/james-see/ltx-video-mac) | LTX-Video | Native macOS app |

MLX ports remove all PyTorch dependencies and run entirely on unified Apple Silicon memory with Metal acceleration.

### Hugging Face Diffusers

The `diffusers` library supports Apple Silicon via PyTorch's MPS backend. It works for image generation and some video pipelines, but video generation support on MPS is less mature and less optimized than ComfyUI workflows. Useful for scripting/automation rather than interactive use.

---

## 2. Best Models for Local Video Generation

### Text-to-Video

| Model | Parameters | Memory (FP16) | Memory (GGUF Q4-Q8) | Quality Tier | Notes |
|-------|-----------|---------------|----------------------|-------------|-------|
| **Wan 2.2 T2V-A14B** | 14B (MoE) | ~28GB | ~8-16GB | Top tier | First open-source MoE video model. Best overall quality. |
| **Wan 2.1 T2V-14B** | 14B | ~28GB | ~8-16GB | Excellent | Predecessor, still very capable |
| **Wan 2.1 T2V-1.3B** | 1.3B | ~3GB | ~2GB | Good | Lightweight, fast, good for experimentation |
| **HunyuanVideo 1.5** | 8.3B | ~17GB | ~8-12GB | Top tier | Tencent model; rivals closed-source services |
| **LTX-Video 2.3** | 22B | ~42GB | N/A | Very good | Fast generation, built-in audio, optimized for speed |
| **LTX-Video 2.0** | 19B | ~38GB | N/A | Very good | Lighter variant |
| **CogVideoX-5B** | 5B | ~10GB | N/A | Good | Practical for consumer hardware |
| **CogVideoX-2B** | 2B | ~4GB | N/A | Moderate | Runs on very limited hardware |
| **Mochi 1** | 10B | ~20GB | N/A | Good | High quality but originally designed for multi-GPU |
| **SkyReels V1** | Varies | TBD | N/A | Excellent | Cinematic focus, newer entry |

**With 128GB unified memory, you can run ALL of these models at full precision (FP16) with room to spare.** This is a significant advantage over typical consumer NVIDIA GPUs (8-24GB VRAM). You can even load multiple models simultaneously.

### Image-to-Video

| Model | Notes |
|-------|-------|
| **Wan 2.2 I2V-A14B** | Best-in-class for image-to-video; excels at complex motion |
| **Wan 2.1 I2V-14B** | Excellent, available in 480P and 720P variants |
| **HunyuanVideo I2V** | Strong quality, runs via ComfyUI |
| **Stable Video Diffusion (SVD)** | Older but well-supported; lighter weight (~4GB) |
| **LTX-2 I2V** | Supported in Draw Things and ComfyUI |

### Video-to-Video / Style Transfer

This category is less developed for local Apple Silicon use:

- **ComfyUI ControlNet + video models**: Use ControlNet conditioning (depth, pose, canny edge) on a per-frame or temporally-aware basis to guide video generation from an input video
- **AnimateDiff**: Can do video-to-video with the right workflow, but has known issues on Apple Silicon (memory crashes reported on some configs)
- **fast-artistic-videos**: Open-source neural style transfer for video, uses optical flow for temporal consistency; not Apple Silicon optimized
- **Frame-by-frame img2img**: The simplest approach -- extract frames, run img2img on each, reassemble. Works but can flicker without temporal conditioning.

**Honest assessment**: True video-to-video with temporal coherence is still primarily an NVIDIA-optimized workflow. On Apple Silicon, expect workarounds rather than polished pipelines.

---

## 3. Performance: Apple Silicon vs. NVIDIA

### Generation Time Benchmarks

**Wan 2.1 14B (480P, ~81 frames, 20 steps):**

| Hardware | Time | Notes |
|----------|------|-------|
| NVIDIA H100 | ~85 seconds | Data center GPU |
| NVIDIA A100 | ~170 seconds | Data center GPU |
| NVIDIA RTX 4090 | ~281 seconds | Consumer king |
| NVIDIA A40 | ~350 seconds | Workstation GPU |
| **M4 Max 128GB (estimated)** | **~20-40 minutes** | Via MPS/ComfyUI |
| **M3 Max 128GB (reported)** | **~30-60 minutes** | Community reports |

**HunyuanVideo (73 frames, M3 Max 128GB):**
- Reported: ~155 seconds/iteration, ~60 minutes total for one clip
- Uses ~100GB of the unified memory pool

**LTX-Video (10s clip, 1080p):**

| Hardware | Time |
|----------|------|
| M1 16GB | ~15 minutes |
| M3 base | ~5 minutes |
| M3 Max | ~4-6 minutes |
| M4 Max (expected) | ~3-5 minutes |

**Wan 2.1 1.3B (480P, lighter model):**
- Standard hardware: ~4 minutes
- M-series Mac with GGUF quantization: minutes, not hours

### The Honest Reality

Apple Silicon is roughly **5-10x slower** than an RTX 4090 for diffusion model inference, and **15-30x slower** than an H100. The reasons:

1. **Memory bandwidth advantage, compute disadvantage**: Apple Silicon has excellent memory bandwidth (~400-500 GB/s on M4 Max) and enormous capacity (128GB), but NVIDIA's tensor cores deliver vastly more raw FP16 TFLOPS (the M4 Max has ~17 TFLOPS vs. the RTX 4090's ~83 TFLOPS FP16, or H100's ~204 TFLOPS).

2. **Software maturity**: CUDA has years of optimization for diffusion models. MPS and MLX are catching up but lack flash attention, optimized kernels, and the deep ecosystem CUDA enjoys.

3. **No bf16 support**: Apple Silicon does not support bf16 (bfloat16). Models trained in bf16 must be converted to fp16, which can sometimes affect quality or require extra conversion steps.

### Where 128GB Unified Memory Shines

Despite slower compute, 128GB gives you capabilities that even expensive NVIDIA setups struggle with:

- Load full FP16 models that won't fit in 24GB VRAM (RTX 4090)
- Run 14B+ parameter models without quantization
- Generate at 720P+ resolutions where NVIDIA consumer cards run out of VRAM
- Keep multiple models loaded simultaneously
- No model swapping/offloading overhead

---

## 4. Practical Limitations

### Resolution and Duration

| Resolution | Typical Max Frames | Clip Duration (24fps) | Practical on 128GB? |
|------------|-------------------|----------------------|---------------------|
| 480P (848x480) | 81-121 frames | 3-5 seconds | Yes, comfortably |
| 720P (1280x720) | 49-81 frames | 2-3 seconds | Yes |
| 1080P (1920x1080) | 25-49 frames | 1-2 seconds | Possible but very slow |

### Real Constraints

1. **Generation time is the primary bottleneck**, not memory. A 5-second 480P clip may take 20-60 minutes depending on model and settings. This makes iterating on prompts painful.

2. **Clip length is limited by the models themselves**, not your hardware. Most open-source models max out at 5-10 seconds per generation, regardless of hardware.

3. **Quality gap vs. cloud services**: Local open-source models (Wan 2.2, HunyuanVideo) have narrowed the gap significantly with services like Runway Gen-3 and Kling. However, closed-source services like Sora, Veo 3, and Kling 2.0 still produce more coherent long-form video with better motion and fewer artifacts.

4. **No real-time generation**: Even the fastest models (LTX-Video) take minutes per clip on Apple Silicon. Interactive previewing is impractical.

5. **Audio**: LTX-2.3 is notable for including built-in audio generation. Most other video models are video-only; audio must be added separately.

6. **Temporal coherence in long videos**: Generating clips longer than 5-10 seconds requires stitching multiple generations together, which can produce visible seams. This is a model limitation, not hardware.

7. **fp16 conversion requirement**: Models distributed in bf16 format need conversion. This is usually handled automatically by frameworks but can occasionally cause subtle quality differences.

### What 128GB Changes vs. Smaller Macs

With 128GB, you can do things that 36GB or 64GB Macs cannot:

- Run Wan 14B or HunyuanVideo at full FP16 precision without quantization
- Generate 720P video with large models (smaller Macs must stick to 480P or use heavy quantization)
- Load the full LTX-2.3 unified model (~42GB)
- Run complex ComfyUI workflows with multiple models loaded

---

## 5. Model Sources and Setup Prerequisites

### Prerequisites for macOS

```
# 1. Install Homebrew (if not present)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Python 3.11+ (3.12 recommended)
brew install python@3.12

# 3. Install Git LFS (needed for downloading large models)
brew install git-lfs
git lfs install

# 4. For MLX-based tools
pip install mlx mlx-nn

# 5. For PyTorch/MPS-based tools (ComfyUI, diffusers)
pip install torch torchvision torchaudio

# 6. For ComfyUI (recommended: use Desktop app from comfy.org)
# Or manual install:
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt
python main.py --force-fp16
```

**Important**: Always use `--force-fp16` when running ComfyUI on Apple Silicon (no bf16 support).

### Model Download Sources

| Source | URL | Notes |
|--------|-----|-------|
| Hugging Face | https://huggingface.co | Primary source for all models |
| CivitAI | https://civitai.com | Community models, LoRAs, workflows |
| ComfyUI Manager | Built into ComfyUI | Auto-downloads models as needed |

### Key Model Downloads

**Wan 2.2 (recommended first model to try):**
- Text-to-video: `Wan-AI/Wan2.2-T2V-A14B` on Hugging Face
- Image-to-video: `Wan-AI/Wan2.2-I2V-A14B` on Hugging Face
- GGUF versions (smaller): Available on CivitAI and community repos

**HunyuanVideo:**
- Full model: `tencent/HunyuanVideo` on Hugging Face
- v1.5 (lighter): `Tencent-Hunyuan/HunyuanVideo-1.5` on GitHub

**LTX-Video:**
- LTX-2.3: `Lightricks/LTX-Video` on GitHub
- MLX port: `Acelogic/LTX-2-MLX` on GitHub

**CogVideoX:**
- 5B: `THUDM/CogVideoX-5B` on Hugging Face
- 2B: `THUDM/CogVideoX-2B` on Hugging Face

### Disk Space Requirements

Budget **50-100GB minimum** for models:
- A single large model (Wan 14B FP16) is ~28GB
- GGUF quantized versions are ~5-15GB each
- LTX-2.3 unified (with audio) is ~42GB
- You'll want at least 2-3 models to experiment with

---

## 6. Recommended Starting Point

For someone with an M4 Max and 128GB, here is a practical starting path:

1. **Install ComfyUI Desktop** from [comfy.org](https://www.comfy.org/download)
2. **Install the MLX extension** for 50-70% speedup on Apple Silicon
3. **Start with Wan 2.2 I2V-A14B** (image-to-video) -- highest quality results for the effort
4. **Try LTX-Video** for faster generation times (minutes vs. tens of minutes)
5. **Use GGUF quantized models** when iterating on prompts (faster), then switch to FP16 for final renders
6. **Alternatively, install Draw Things** from the App Store for the simplest possible setup

### Expectations

- You **can** generate good-quality 3-5 second video clips locally
- Expect **20-60 minutes per clip** with large models (14B) at 480-720P
- Expect **3-10 minutes per clip** with faster/smaller models (LTX, Wan 1.3B)
- Quality from Wan 2.2 and HunyuanVideo is genuinely impressive and approaching cloud service quality
- This is a **batch workflow**, not interactive -- queue generations and do other work while waiting
- Your 128GB is a genuine advantage: you can run models at full precision that would require a $10,000+ multi-GPU NVIDIA setup

---

## Sources

- [ComfyUI and Wan 2.2 Image to Video Generation Guide](https://papayabytes.substack.com/p/guide-comfyui-and-wan-22-image-to)
- [ComfyUI on Apple Silicon from Scratch (2025)](https://medium.com/@tchpnk/comfyui-on-apple-silicon-from-scratch-2025-9facb41c842f)
- [ComfyUI Mac M4 Max Complete Setup Guide 2025](https://apatero.com/blog/comfyui-mac-m4-max-complete-setup-guide-2025)
- [ComfyUI MLX Extension Guide](https://apatero.com/blog/comfyui-mlx-extension-70-faster-apple-silicon-guide-2025)
- [Running Wan2.1 Text-to-Video on macOS](https://kennycason.com/posts/2025-05-20-wan2.1-on-macos.html)
- [Wan2.2-mlx (MLX Native Port)](https://github.com/osama-ata/Wan2.2-mlx)
- [LTX-2-MLX (MLX Port)](https://github.com/Acelogic/LTX-2-MLX)
- [HunyuanVideo MLX](https://github.com/gaurav-nelson/HunyuanVideo_MLX)
- [LTX-Video Mac Native App](https://github.com/james-see/ltx-video-mac)
- [HunyuanVideo on M3 Max Guide](https://gist.github.com/mdbecker/be0c1730e4a9a8830e46c72812f18a6e)
- [Macbook/MacMini Run Wan 2.2](https://medium.com/@ttio2tech_28094/macbook-macmini-run-wan-2-2-generating-videos-dd0e32eb91b3)
- [Wan2.1 Performance Testing Across GPUs](https://www.instasd.com/post/wan2-1-performance-testing-across-gpus)
- [Run Wan 2.2 in ComfyUI with 8GB VRAM](https://dev.to/aitechtutorials/run-wan-22-in-comfyui-with-just-8gb-vram-full-image-to-video-ai-workflow-2gb6)
- [7 Best Open Source Video Generation Models in 2026](https://www.hyperstack.cloud/blog/case-study/best-open-source-video-generation-models)
- [Best Video Generation AI Models in 2026](https://pinggy.io/blog/best_video_generation_ai_models/)
- [Music AI Video Generation on macOS](https://suedbroecker.net/2025/12/28/a-music-ai-video-generation-run-local-offline-and-free-on-macos/)
- [Draw Things Wiki - Video Generation Basics](https://wiki.drawthings.ai/wiki/Video_Generation_Basics)
- [Apple Silicon vs NVIDIA CUDA: AI Comparison 2025](https://scalastic.io/en/apple-silicon-vs-nvidia-cuda-ai-2025/)
- [Hugging Face Diffusers MPS Documentation](https://huggingface.co/docs/diffusers/en/optimization/mps)
- [Wan 2.2 ComfyUI Official Workflow](https://docs.comfy.org/tutorials/video/wan/wan2_2)
- [Run Mochi 1 on macOS Guide](https://codersera.com/blog/run-mochi-1-on-macos-step-by-step-guide)
