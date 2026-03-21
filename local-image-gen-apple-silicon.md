# Local Image Generation on Apple Silicon (128GB Unified Memory)

> Research compiled March 2026. Performance numbers gathered from community benchmarks, developer documentation, and user reports.

---

## Table of Contents

1. [Inference Engines & Frameworks](#1-inference-engines--frameworks)
2. [Best Models Available](#2-best-models-available)
3. [Performance Benchmarks](#3-performance-benchmarks)
4. [Quantization & Optimization](#4-quantization--optimization)
5. [Model Sources](#5-model-sources)
6. [Setup & Prerequisites](#6-setup--prerequisites)

---

## 1. Inference Engines & Frameworks

### Tier 1: Recommended for Apple Silicon

#### Draw Things (Best overall for Apple Silicon)
- **Type:** Native macOS/iOS app (SwiftUI + Metal)
- **Metal/GPU utilization:** Excellent -- uses custom Metal FlashAttention 2.0
- **Key advantage:** Purpose-built for Apple Silicon. ~20% faster than ComfyUI for the same model, up to 25% faster than mflux for Flux.1, and up to 163% faster than DiffusionKit for SD 3.5 Large (on M2 Ultra). Up to 94% faster than GGUF-based implementations.
- **Model support:** SD 1.5, SDXL, SD 3.5 Medium/Large/Large Turbo, Flux.1 Dev/Schnell, ControlNet, LoRA, inpainting
- **Extras:** Supports both inference and fine-tuning of Flux.1 Dev on-device
- **Cost:** Free on the Mac App Store
- **Drawback:** Less extensible/scriptable than ComfyUI; closed-source

#### ComfyUI (Best for advanced workflows)
- **Type:** Node-based Python UI, runs via PyTorch MPS backend
- **Metal/GPU utilization:** Good with MPS backend; excellent with MLX extension
- **Key advantage:** Massive ecosystem of custom nodes, extremely flexible workflows. The [ComfyUI-MLX extension](https://www.runcomfy.com/comfyui-nodes/ComfyUI-MLX) provides 50-70% faster model loading and 35% faster inference vs. standard PyTorch MPS.
- **Model support:** Virtually everything -- SD 1.5, SDXL, SD 3.5, Flux.1, Flux.2, HiDream, Chroma, ControlNet, IP-Adapter, upscalers, video models
- **Drawback:** Setup takes ~1 hour on Mac; base PyTorch MPS path is ~3x slower than Draw Things without the MLX extension

#### mflux (Best lightweight CLI/Python tool)
- **Type:** Pure MLX Python package (`pip install mflux`)
- **Metal/GPU utilization:** Excellent -- native MLX, no PyTorch overhead
- **Key advantage:** Simple CLI and Python API. Line-by-line MLX port of HuggingFace diffusers. Supports 4-bit and 8-bit quantization natively.
- **Model support:** Flux.1 Dev/Schnell, Flux.2 variants, and growing model support
- **Drawback:** Narrower model support than ComfyUI; no GUI

### Tier 2: Viable Alternatives

#### DiffusionKit (by Argmax)
- **Type:** Python + Swift packages for Core ML and MLX inference
- **Metal/GPU utilization:** Excellent -- Core ML leverages Neural Engine + GPU
- **Model support:** SD3, Flux.1
- **Use case:** Developers building apps; Core ML conversion pipeline
- **Repo:** [github.com/argmaxinc/DiffusionKit](https://github.com/argmaxinc/DiffusionKit)

#### InvokeAI
- **Type:** Python web UI with professional workflow features
- **Metal/GPU utilization:** Adequate via PyTorch MPS
- **Model support:** SD 1.5, SDXL, Flux (with caveats -- GGUF support has had macOS bugs)
- **Status as of early 2026:** Active development (v6.11.1, Feb 2026). Works on Apple Silicon but has had recurring MPS-related issues with newer models. 16GB+ RAM recommended.
- **Drawback:** Historically buggier on macOS than ComfyUI; some GGUF models fail to load on MPS

#### HuggingFace Diffusers (with MPS backend)
- **Type:** Python library (`pip install diffusers`)
- **Metal/GPU utilization:** Uses PyTorch MPS backend
- **Use case:** Scripting, research, custom pipelines
- **Note:** MPS backend now supports the top-50 most popular models out of the box. Good for programmatic use but no GUI.

#### Apple ml-stable-diffusion (Core ML)
- **Type:** Apple's official Swift/Python package
- **Metal/GPU utilization:** Core ML -- uses Neural Engine + GPU + CPU optimally
- **Model support:** SD 1.5, SD 2.x, SDXL (with quantization)
- **Drawback:** Limited to older SD models; not updated for Flux or SD 3.5

#### Automatic1111 / Forge
- **Type:** Gradio-based Python web UI
- **Status:** Works on macOS via MPS but development has largely stalled. Forge (a fork) has better performance but Apple Silicon remains a second-class citizen. Most Mac users have migrated to ComfyUI or Draw Things.

### Framework Comparison Matrix

| Framework | Metal/GPU Usage | Ease of Setup | Model Breadth | Speed on Apple Silicon | Extensibility |
|-----------|----------------|---------------|---------------|----------------------|---------------|
| Draw Things | Excellent (Metal FA 2.0) | Trivial (App Store) | Very Good | Fastest | Low |
| ComfyUI + MLX | Very Good | Moderate (~1hr) | Best | Fast | Best |
| ComfyUI (vanilla) | Good (MPS) | Moderate | Best | Moderate | Best |
| mflux | Excellent (MLX) | Easy (pip) | Limited | Fast | Moderate |
| DiffusionKit | Excellent (Core ML) | Moderate | Limited | Fast | Moderate |
| InvokeAI | Adequate (MPS) | Moderate | Good | Moderate | Good |
| Diffusers (MPS) | Adequate | Easy (pip) | Very Good | Moderate | Best (code) |

---

## 2. Best Models Available

### Text-to-Image

With 128GB unified memory, you can run **every current open-source image model** in full FP16 precision, and even keep multiple models loaded simultaneously. This is a significant advantage over typical 24GB NVIDIA GPUs.

#### Flux.1 (by Black Forest Labs) -- Recommended Starting Point
| Variant | Parameters | FP16 Size | Notes |
|---------|-----------|-----------|-------|
| Flux.1 Dev | 12B | ~24 GB | Best quality open Flux model. 20-50 step generation. |
| Flux.1 Schnell | 12B | ~24 GB | Distilled for speed. 1-4 steps. Much faster, slightly lower quality. |
| Flux.1 Dev GGUF Q8 | 12B | ~12.7 GB | 99% identical quality to FP16. Best bang for buck. |
| Flux.1 Dev GGUF Q4 | 12B | ~6.8 GB | Noticeable quality loss below Q4. |

- **Native resolution:** 1024x1024 (supports other aspect ratios)
- **Quality:** Currently the gold standard for open-source text-to-image. Excellent prompt adherence, text rendering, and photorealism.
- **With 128GB:** Run FP16 without any quantization. You can even load Flux + T5-XXL encoder + VAE + ControlNet simultaneously.

#### Flux.2 (2025-2026)
- Newer variants including Flux.2-Klein (4B and 9B parameter versions)
- Faster inference than Flux.1 with competitive quality
- Growing community support in ComfyUI and mflux

#### Stable Diffusion 3.5 (by Stability AI)
| Variant | Parameters | VRAM (excl. encoders) | Notes |
|---------|-----------|----------------------|-------|
| SD 3.5 Large | 8.1B | ~16 GB | Superior quality, professional use. 1MP native. |
| SD 3.5 Large Turbo | 8.1B | ~16 GB | Distilled, fewer steps needed. |
| SD 3.5 Medium | 2.5B | ~9.9 GB | Runs on consumer hardware. 0.25-2MP. |

- **License:** Free for commercial and non-commercial use (Stability AI Community License)
- **Quality:** Strong prompt adherence; generally considered slightly below Flux.1 Dev for photorealism but excellent for diverse styles.
- **With 128GB:** All variants run comfortably in FP16.

#### SDXL (Stable Diffusion XL)
| Variant | Parameters | Size | Notes |
|---------|-----------|------|-------|
| SDXL 1.0 Base | 3.5B | ~6.9 GB | Mature ecosystem, vast LoRA/checkpoint library |
| SDXL 1.0 + Refiner | 3.5B + 6.6B | ~13.5 GB total | Two-stage pipeline for extra detail |

- **Native resolution:** 1024x1024
- **Advantage:** Largest ecosystem of fine-tuned models, LoRAs, and ControlNets on CivitAI. Thousands of community checkpoints.
- **With 128GB:** Trivial. Can run base + refiner + ControlNet + multiple LoRAs simultaneously.

#### SD 1.5
- **Parameters:** 860M, ~2 GB
- **Status:** Legacy but still useful for speed and the enormous library of fine-tunes
- **Native resolution:** 512x512
- **Generation time:** 8-15 seconds on M2 Pro 16GB

#### HiDream-I1 (2025)
- **Parameters:** 17B
- **Quality:** State-of-the-art on GenEval and DPG benchmarks. Outperforms other open-source models.
- **Caveat:** Primarily CUDA-oriented. ComfyUI support exists but Mac compatibility is limited/experimental as of early 2026. Requires significant memory (~34GB+ FP16).
- **With 128GB:** Fits easily in memory, but Apple Silicon inference may not be well-optimized yet.

#### Chroma (2025)
- Community-developed model tested on M4 Max 128GB
- Available via ComfyUI
- Performance data available in community benchmarks

### Image-to-Image / Inpainting

| Model | Base | Use Case | Apple Silicon Support |
|-------|------|----------|---------------------|
| Flux.1 Fill Dev | Flux.1 | Inpainting/outpainting | ComfyUI, Draw Things |
| SD 3.5 (img2img pipeline) | SD 3.5 | Style transfer, refinement | Diffusers, ComfyUI |
| SDXL Inpainting | SDXL | Inpainting | All major frameworks |
| SD 1.5 Inpainting | SD 1.5 | Inpainting | All frameworks |
| Flux.1 Kontext Dev | Flux.1 | Context-aware editing | ComfyUI (GGUF support in progress) |

### ControlNet & Conditioning

| Model | Compatible With | Notes |
|-------|----------------|-------|
| ControlNet (various) | SD 1.5, SDXL | Canny, depth, pose, scribble, etc. Mature ecosystem. |
| ControlNet for SD 3.5 | SD 3.5 | More limited selection than SDXL |
| Flux.1 ControlNet variants | Flux.1 | Depth, canny; growing support |
| IP-Adapter | SD 1.5, SDXL, Flux | Image prompt conditioning |
| T2I-Adapter | SDXL | Lightweight alternative to ControlNet |

- **With 128GB:** You can load a base model + multiple ControlNet models + LoRAs simultaneously -- something impossible on most NVIDIA GPUs.

### Upscaling

| Model | Type | Apple Silicon Support | Notes |
|-------|------|----------------------|-------|
| Real-ESRGAN | GAN-based | MPS (manual flag), Core ML (78x faster than CPU) | Best via FreeScaler or Upscayl apps |
| ESRGAN variants | GAN-based | MPS | 4x upscaling |
| SwinIR | Transformer | MPS | High quality, slower |
| Stable Diffusion x4 Upscaler | Diffusion | ComfyUI, Diffusers | Diffusion-based, very high quality |
| LDSR | Diffusion | ComfyUI | Latent diffusion super-resolution |
| Upscayl | App (multiple models) | Native macOS app | Free, open-source, easy to use |
| FreeScaler | App (Real-ESRGAN) | Native macOS (Silicon + Intel) | Free, minimal setup |

**Recommendation for upscaling on Mac:** Use **Upscayl** (open-source app) or **FreeScaler** for standalone upscaling. For integrated workflows, use Real-ESRGAN or the SD x4 Upscaler nodes in ComfyUI. Converting Real-ESRGAN to Core ML enables Neural Engine acceleration with up to 78x speedup over CPU PyTorch.

---

## 3. Performance Benchmarks

### Generation Times on Apple Silicon

All times are for a single image unless noted. Times include model inference only (not model loading).

#### Flux.1 Dev (20-30 steps, 1024x1024)

| Hardware | Framework | Quantization | Time |
|----------|-----------|-------------|------|
| M4 Max 128GB | mflux | FP16 | ~85 sec |
| M4 Max 128GB | Draw Things | Metal FA 2.0 | ~42 sec |
| M4 Max 128GB | ComfyUI (MPS) | FP16 | ~90-120 sec |
| M4 Max 128GB | ComfyUI + MLX | MLX | ~55-70 sec |
| M3 Max | mflux | FP16 | ~105 sec |
| M2 Max | mflux | FP16 | ~145 sec |
| M1 Pro | mflux | Quantized | ~180-300 sec |
| **RTX 4090 (reference)** | ComfyUI | FP16 | **~11-18 sec** |

#### Flux.1 Schnell (4 steps, 1024x1024)

| Hardware | Framework | Time |
|----------|-----------|------|
| M4 Max 128GB | mflux | ~10-11 sec |
| M4 Max 128GB | Draw Things | ~8-9 sec |

#### Flux.2-Klein (1024x1024)

| Hardware | Model | Framework | Time (incl. ~10s SSD load) |
|----------|-------|-----------|---------------------------|
| M4 Max 128GB | 4B variant | ComfyUI | ~28 sec |
| M4 Max 128GB | 9B variant | ComfyUI | ~38 sec |

#### SDXL (30 steps, 1024x1024)

| Hardware | Framework | Time |
|----------|-----------|------|
| M4 Pro (Mac Mini) | ComfyUI | ~25-28 sec |
| M3 Max 48GB | ComfyUI | ~75 sec |
| M4 Max 128GB | Draw Things | ~20-25 sec |

#### SD 1.5 (30 steps, 512x512)

| Hardware | Framework | Time |
|----------|-----------|------|
| M2 Pro 16GB | Draw Things | ~8-15 sec |
| M4 Max 128GB | ComfyUI | ~5-8 sec |

#### SD 3.5 Large (30 steps, 1024x1024)

| Hardware | Framework | Time |
|----------|-----------|------|
| M4 Max 128GB | Draw Things | ~30-45 sec |
| M4 Max 128GB | ComfyUI (MPS) | ~60-90 sec |

### Relative Performance Summary

| Comparison | Factor |
|-----------|--------|
| M4 Max vs RTX 4090 | 2-4x slower (model dependent) |
| M4 Max vs RTX 3090 | ~6x slower (ComfyUI Flux) |
| Draw Things vs ComfyUI (vanilla) | ~20% faster |
| ComfyUI + MLX vs ComfyUI (vanilla) | 35-70% faster |
| Draw Things vs mflux | ~25% faster |
| MLX vs PyTorch MPS (same model) | Up to 70% faster |

### What 128GB Gets You

With 128GB unified memory, you never need to worry about model fitting:

- **Multiple models loaded simultaneously:** Keep Flux.1 Dev (24GB) + SDXL (7GB) + ControlNet (1.4GB) + multiple LoRAs all in memory
- **No quantization required:** Run everything in full FP16 for maximum quality
- **Large batch generation:** Generate multiple images in parallel
- **Full pipelines:** Run entire img2img + upscaling + ControlNet workflows without model swapping

---

## 4. Quantization & Optimization

### Quantization Options

#### GGUF Quantization (for diffusion models)

GGUF format is the primary quantization approach for diffusion models on Apple Silicon:

| Quant Level | Flux.1 Dev Size | Quality vs FP16 | Recommended For |
|-------------|----------------|-----------------|-----------------|
| FP16 | ~24 GB | 100% (baseline) | 32GB+ systems (your 128GB is ideal) |
| Q8 | ~12.7 GB | ~99% identical | 16-24GB systems |
| Q6 | ~9.8 GB | ~97% | 16GB systems |
| Q5 | ~8.5 GB | ~95% | Budget setups |
| Q4 | ~6.8 GB | ~90%, visible loss | Minimum viable |
| Q3/Q2 | <6 GB | Significant degradation | Not recommended |

**For your 128GB system:** Use FP16 everywhere. You have the luxury of never needing to quantize.

#### MPS Quantization (Apple framework level)

Apple's Metal Performance Shaders now support:
- **8-bit integer quantization** -- reduces memory footprint by ~50%
- **4-bit integer quantization** (new as of 2024-2025) -- MPSGraph replaces dequantize operations with fused quantized matmul operations that dequantize weights on-the-fly

#### MLX Quantization

mflux supports native 4-bit and 8-bit quantization:
- 4-bit reduces Flux.1 from ~24GB to ~9.6GB
- Quality remains high -- most users cannot distinguish 4-bit from FP16
- Loading and inference both benefit from smaller model sizes

### Apple Silicon Optimizations

#### Metal FlashAttention 2.0 (Draw Things)
- Custom Metal shader implementation of FlashAttention
- Up to 163% faster than generic implementations for SD 3.5 Large
- Up to 94% faster than GGUF implementations for Flux

#### MLX Framework Advantages
- Targets Apple Silicon unified memory directly (no generic GPU abstraction)
- Lazy evaluation and unified memory model avoid unnecessary copies
- Up to 70% faster than PyTorch MPS for the same model
- M5 chip: 3.8x faster than M4 for Flux-dev-4bit (12B params) -- demonstrating Apple is actively optimizing

#### Core ML / Neural Engine
- Core ML can split workloads across CPU, GPU, and Neural Engine
- Real-ESRGAN via Core ML: 78x speedup vs CPU PyTorch
- Best for specific supported models (SD 1.5, SDXL, SD3)

#### PyTorch MPS Best Practices
- Use `--force-fp16` flag in ComfyUI
- Use `--use-pytorch-cross-attention` for better MPS compatibility
- Set `PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0` to allow PyTorch to use all available memory
- Current PyTorch MPS supports top-50 most popular models out of the box

### Optimization Recommendations for 128GB M4 Max

1. **Use Draw Things** for the fastest single-image generation
2. **Use ComfyUI + MLX extension** for complex multi-model workflows
3. **Keep models in FP16** -- you have the memory, use it for max quality
4. **Pre-load multiple models** -- unified memory means no GPU-CPU transfer penalty
5. **Use SSD caching** -- first load is from disk; subsequent generations use cached weights in unified memory

---

## 5. Model Sources

### Primary Repositories

#### HuggingFace (huggingface.co)
- **Primary source** for official model weights
- Formats: safetensors (preferred), diffusers format (directory structure), GGUF
- Key repos:
  - `black-forest-labs/FLUX.1-dev` -- Official Flux.1 Dev
  - `black-forest-labs/FLUX.1-schnell` -- Official Flux.1 Schnell
  - `stabilityai/stable-diffusion-3.5-large` -- SD 3.5 Large
  - `stabilityai/stable-diffusion-3.5-medium` -- SD 3.5 Medium
  - `stabilityai/stable-diffusion-xl-base-1.0` -- SDXL Base
  - `city96/FLUX.1-dev-gguf` -- Pre-quantized GGUF versions of Flux
  - `HiDream-ai/HiDream-I1-Full` -- HiDream 17B
- Download via `huggingface-cli`, `git lfs`, or web browser

#### CivitAI (civitai.com)
- **Best source** for community fine-tuned models, LoRAs, and checkpoints
- Massive library of SDXL and SD 1.5 fine-tunes (thousands of models)
- Growing Flux.1 and SD 3.5 ecosystem
- Formats: safetensors, ckpt
- Includes preview images and community ratings
- Direct download links; no CLI tool required

### Model Formats Explained

| Format | Extension | Use Case | Framework Support |
|--------|-----------|----------|-------------------|
| safetensors | `.safetensors` | Standard safe format, fast loading | All frameworks |
| Diffusers | Directory with multiple files | HuggingFace diffusers library | Diffusers, some ComfyUI nodes |
| GGUF | `.gguf` | Quantized models, smaller files | ComfyUI (with GGUF nodes), mflux |
| Core ML | `.mlmodelc` / `.mlpackage` | Apple Neural Engine optimized | Draw Things, DiffusionKit, Apple ml-stable-diffusion |
| ckpt | `.ckpt` | Legacy PyTorch checkpoint | All (but less safe than safetensors) |
| DDUF | `.dduf` | Newer unified diffusion format | Diffusers (experimental) |

### Where to Find Specific Model Types

| What You Need | Best Source |
|--------------|------------|
| Official base models (Flux, SD 3.5, SDXL) | HuggingFace |
| GGUF quantized diffusion models | HuggingFace (city96 repos) |
| Fine-tuned artistic checkpoints | CivitAI |
| LoRAs (style, character, concept) | CivitAI |
| ControlNet models | HuggingFace |
| Upscaler models | HuggingFace, included in apps |
| Core ML converted models | HuggingFace (apple org) |

---

## 6. Setup & Prerequisites

### System Requirements

- **macOS:** 14.0 (Sonoma) or later recommended; macOS 15 (Sequoia) for latest optimizations
- **Chip:** Any Apple Silicon (M1/M2/M3/M4/M5 series). M4 Max with 128GB is top-tier.
- **Storage:** 100-500 GB free recommended (models are large)
- **Xcode Command Line Tools:** Required for most Python-based tools

### Option A: Draw Things (Easiest -- 5 minutes)

```
1. Open Mac App Store
2. Search "Draw Things"
3. Install (free)
4. Launch and download models from within the app
```

No terminal, no Python, no dependencies. Models download automatically.

### Option B: ComfyUI (Most flexible -- ~1 hour)

```bash
# 1. Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Python 3.11+ (avoid 3.13 for compatibility)
brew install python@3.12

# 3. Clone ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# 4. Create virtual environment
python3.12 -m venv venv
source venv/bin/activate

# 5. Install PyTorch with MPS support
pip install torch torchvision torchaudio

# 6. Install ComfyUI dependencies
pip install -r requirements.txt

# 7. Download models to ComfyUI/models/checkpoints/
# (manually download safetensors files from HuggingFace or CivitAI)

# 8. Launch
python main.py --force-fp16 --use-pytorch-cross-attention

# 9. Open http://127.0.0.1:8188 in browser
```

**For MLX acceleration (recommended):**
```bash
# Install ComfyUI-MLX nodes
cd ComfyUI/custom_nodes
git clone https://github.com/thoddnn/ComfyUI-MLX
cd ComfyUI-MLX
pip install -r requirements.txt
```

### Option C: mflux (Simplest CLI -- 5 minutes)

```bash
# Install
pip install mflux

# Generate an image with Flux.1 Schnell (fast)
mflux-generate --model schnell --prompt "a cat sitting on a windowsill" --steps 4

# Generate with Flux.1 Dev (higher quality)
mflux-generate --model dev --prompt "a cat sitting on a windowsill" --steps 20

# Use 4-bit quantization (saves memory, barely affects quality)
mflux-generate --model dev --prompt "a cat" --steps 20 --quantize 4
```

### Option D: HuggingFace Diffusers (Python scripting)

```bash
pip install diffusers transformers accelerate safetensors

# Example: Flux.1 Dev
python -c "
from diffusers import FluxPipeline
import torch

pipe = FluxPipeline.from_pretrained('black-forest-labs/FLUX.1-dev', torch_dtype=torch.float16)
pipe.to('mps')

image = pipe('a beautiful sunset over mountains', num_inference_steps=20).images[0]
image.save('output.png')
"
```

### Option E: InvokeAI

```bash
# Install via pip
pip install invokeai

# Initialize (downloads default models)
invokeai-configure

# Launch web UI
invokeai-web
```

### Recommended Model Downloads for 128GB System

Start with these models to cover the most ground:

| Model | Size | Priority | Source |
|-------|------|----------|--------|
| Flux.1 Dev (FP16) | 24 GB | High | `huggingface.co/black-forest-labs/FLUX.1-dev` |
| Flux.1 Schnell (FP16) | 24 GB | High | `huggingface.co/black-forest-labs/FLUX.1-schnell` |
| SD 3.5 Large | 16 GB | Medium | `huggingface.co/stabilityai/stable-diffusion-3.5-large` |
| SDXL Base 1.0 | 6.9 GB | Medium | `huggingface.co/stabilityai/stable-diffusion-xl-base-1.0` |
| T5-XXL encoder (for Flux) | 9.5 GB | Required | Bundled or auto-downloaded |
| CLIP encoders | 1-2 GB | Required | Bundled or auto-downloaded |
| Flux ControlNet (depth) | 1.5 GB | Optional | HuggingFace |
| Real-ESRGAN x4 | 64 MB | Optional | HuggingFace or Upscayl |

**Total initial download:** ~80-85 GB for a comprehensive setup. Your 128GB system handles all of this with room to spare.

### Environment Variables (Optional but Recommended)

```bash
# Allow PyTorch to use all available unified memory
export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0

# Improve MPS memory management
export PYTORCH_ENABLE_MPS_FALLBACK=1
```

---

## Summary: Best Setup for M4 Max 128GB

| Use Case | Recommended Tool | Why |
|----------|-----------------|-----|
| Quick, high-quality images | Draw Things | Fastest, zero setup |
| Complex workflows (ControlNet, multi-model) | ComfyUI + MLX extension | Most flexible, good speed |
| Scripting / automation | mflux or Diffusers | Clean Python API |
| Best image quality (no compromises) | Flux.1 Dev FP16, 30+ steps | Your memory supports full precision |
| Fastest acceptable quality | Flux.1 Schnell, 4 steps | ~10 sec per image |
| Largest model ecosystem | SDXL via ComfyUI | Thousands of CivitAI models |
| Upscaling | Upscayl app or Real-ESRGAN in ComfyUI | Simple and effective |

Your 128GB unified memory is a genuine advantage: you can run full-precision FP16 models that would require quantization on most NVIDIA GPUs, keep multiple models loaded simultaneously, and run complex multi-model pipelines without swapping. The main limitation is raw throughput -- expect 2-4x slower generation than an RTX 4090, but with the tradeoff of silence, efficiency, and the ability to run models that simply do not fit in 24GB of discrete VRAM.

---

Sources:
- [Mac Mini M4 Local AI Image Generation: ComfyUI vs Draw Things Benchmarked](https://www.heyuan110.com/posts/ai/2026-02-15-mac-mini-local-image-generation/)
- [Performance Comparison of Multiple Image Generation Models on Apple Silicon MacBook Pro](https://blog.exp-pi.com/2025/05/performance-comparison-of-multiple.html)
- [Flux on Apple Silicon: Complete Guide 2025](https://www.apatero.com/blog/flux-apple-silicon-m1-m2-m3-m4-complete-performance-guide-2025)
- [ComfyUI MLX Extension Guide](https://apatero.com/blog/comfyui-mlx-extension-70-faster-apple-silicon-guide-2025)
- [ComfyUI Mac M4 Max Setup Guide](https://apatero.com/blog/comfyui-mac-m4-max-complete-setup-guide-2025)
- [Metal FlashAttention 2.0 (Draw Things Engineering)](https://engineering.drawthings.ai/p/metal-flashattention-2-0-pushing-forward-on-device-inference-training-on-apple-silicon-fe8aac1ab23c)
- [mflux GitHub Repository](https://github.com/filipstrand/mflux)
- [DiffusionKit by Argmax](https://github.com/argmaxinc/DiffusionKit)
- [Flux + ComfyUI on Apple Silicon 2025](https://medium.com/@tchpnk/flux-comfyui-on-apple-silicon-with-hardware-acceleration-2025-ac8a3852f13f)
- [ComfyUI on Apple Silicon from Scratch 2025](https://medium.com/@tchpnk/comfyui-on-apple-silicon-from-scratch-2025-9facb41c842f)
- [MLX: Stable Diffusion for Local Image Generation](https://medium.com/@ingridwickstevens/mlx-stable-diffusion-for-local-image-generation-on-apple-silicon-2ec00ba1031a)
- [Stable Diffusion on Mac: MLX and Draw Things Guide](https://insiderllm.com/guides/stable-diffusion-mac-mlx/)
- [MacRumors: M4M and M3U Image Generation Speed](https://forums.macrumors.com/threads/m4m-and-m3u-for-image-generation-speed-sd-flux-etc.2454524/)
- [HuggingFace MPS Optimization Guide](https://huggingface.co/docs/diffusers/optimization/mps)
- [HuggingFace SDXL Core ML Quantization](https://huggingface.co/blog/stable-diffusion-xl-coreml)
- [city96/FLUX.1-dev-gguf (HuggingFace)](https://huggingface.co/city96/FLUX.1-dev-gguf)
- [Apple ml-stable-diffusion](https://github.com/apple/ml-stable-diffusion)
- [InvokeAI Requirements](https://invoke-ai.github.io/InvokeAI/installation/requirements/)
- [Stability AI: Introducing SD 3.5](https://stability.ai/news/introducing-stable-diffusion-3-5)
- [HiDream-I1 on HuggingFace](https://huggingface.co/HiDream-ai/HiDream-I1-Full)
- [Optimized AI Upscaling on Macs](https://medium.com/@ronregev/optimized-ai-image-video-upscaling-on-macs-with-apple-silicon-m1-m2-m3-m4-a248e128cdc6)
- [Best Open-Source AI Image Generation Models 2026](https://www.pixazo.ai/blog/top-open-source-image-generation-models)
- [WWDC25: Get Started with MLX](https://developer.apple.com/videos/play/wwdc2025/315/)
