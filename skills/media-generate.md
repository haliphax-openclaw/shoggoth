---
id: media-generate
title: Media Generation
description: Multi-provider media generation via builtin-media-generate tool — images, video, and audio through OpenRouter and Google Gemini
tags:
  [media, generation, image, video, audio, openrouter, gemini, flux, recraft, veo, imagen, lyria]
category: media
enabled: true
---

The `builtin-media-generate` tool provides unified access to multiple media generation providers through a pluggable adapter architecture. Provider routing is automatic — specify the model and the system resolves the correct provider and adapter from configuration.

---

## Discovering Available Models

To see which models are available, use `builtin-config-show` and inspect the `mediaGeneration.providers` section. Each provider lists its models with their `name` and `mediaType`. The model `name` is what you pass as the `model` parameter to `builtin-media-generate`.

---

## Tool Parameters

| Parameter     | Type    | Required | Description                                                   |
| ------------- | ------- | -------- | ------------------------------------------------------------- |
| `model`       | string  | yes      | Model identifier (must match a configured model name exactly) |
| `prompt`      | string  | yes      | Text prompt describing the desired output                     |
| `params`      | object  | yes      | Generation parameters — must include `kind`                   |
| `output_path` | string  | no       | Workspace-relative output path (auto-generated if omitted)    |
| `show`        | boolean | no       | Surface generated images inline (default: `true`)             |

### Params Object

| Field             | Kind        | Description                                           |
| ----------------- | ----------- | ----------------------------------------------------- |
| `kind`            | all         | Required. One of: `image`, `video`, `speech`, `music` |
| `aspectRatio`     | image/video | Aspect ratio (e.g., `16:9`, `1:1`, `9:16`)            |
| `numberOfImages`  | image       | Number of images to generate                          |
| `input_image`     | image/video | Base64-encoded input image for editing/i2v            |
| `last_frame`      | video       | Base64-encoded last frame (video only)                |
| `durationSeconds` | video/music | Duration in seconds                                   |
| `voice`           | speech      | Voice name for TTS                                    |

---

## Adapters

The system uses adapter types selected automatically based on provider kind and model media type:

| Adapter                   | Provider Kind     | Media Type | Description                             |
| ------------------------- | ----------------- | ---------- | --------------------------------------- |
| `openai-chat-image`       | openai-compatible | image      | Chat completions with image modalities  |
| `openai-video-async`      | openai-compatible | video      | Async video generation with polling     |
| `gemini-generate-content` | gemini            | image      | Gemini generateContent for image models |
| `gemini-long-running`     | gemini            | video      | Gemini long-running operations (Veo)    |
| `gemini-predict`          | gemini            | image      | Vertex-style predict endpoint (Imagen)  |

Per-model adapter overrides are supported in config for special cases (e.g., Imagen uses `gemini-predict` instead of the default `gemini-generate-content`).

---

## OpenRouter Modalities

The `openai-chat-image` adapter automatically sets the correct `modalities` parameter based on model name:

- **Multimodal models** (names containing `gpt`, `gemini`, or `claude`): sends `["text", "image"]`
- **Pure-image models** (Recraft, FLUX, Sourceful, Seedream, etc.): sends `["image"]`

This distinction is required by OpenRouter — pure-image models reject requests with `["text", "image"]` modalities.

---

## Example Invocations

### Image — Pure-image model (OpenRouter)

```json
{
  "model": "black-forest-labs/flux.2-klein-4b",
  "prompt": "A red fox sitting in a snowy forest clearing",
  "params": { "kind": "image" },
  "output_path": "tmp/fox.png"
}
```

### Image — Multimodal model (OpenRouter)

```json
{
  "model": "openai/gpt-5-image-mini",
  "prompt": "A watercolor painting of a lighthouse at dusk",
  "params": { "kind": "image", "aspectRatio": "16:9" },
  "output_path": "tmp/lighthouse.png"
}
```

### Image — Direct Gemini

```json
{
  "model": "gemini-2.5-flash-preview-image",
  "prompt": "A futuristic cityscape with flying cars",
  "params": { "kind": "image" }
}
```

### Video — Async (returns in_progress, poll with media_generate_poll)

```json
{
  "model": "veo-3.1-generate-preview",
  "prompt": "Time-lapse of a flower blooming in a garden",
  "params": { "kind": "video", "durationSeconds": 8 }
}
```

### Speech — TTS

```json
{
  "model": "gemini-2.5-flash-preview-tts",
  "prompt": "Hello! Welcome to our service.",
  "params": { "kind": "speech", "voice": "Kore" }
}
```

---

## Provider Routing

Model resolution searches all configured providers for an exact name match. The first provider with a matching model entry wins. The `mediaGeneration` config section defines providers, each with a `kind` (determines adapter selection) and a `models` array.

---

## Async Operations

Video generation models (Veo, Sora, etc.) return `{ "status": "in_progress", "operation_id": "..." }`. Use the `media_generate_poll` control op to check completion status.

---

## Error Handling

| Error                                | Cause                         | Resolution                                     |
| ------------------------------------ | ----------------------------- | ---------------------------------------------- |
| `model is required`                  | Missing model parameter       | Provide a model name                           |
| `prompt is required`                 | Missing prompt parameter      | Provide a text prompt                          |
| `params with kind is required`       | Missing or invalid params     | Include `{ "kind": "image" }` (or video, etc.) |
| `Media generation not configured`    | No providers/models in config | Add `mediaGeneration` config section           |
| `API error 404: No endpoints found`  | Wrong modalities for model    | Check model type (pure-image vs multimodal)    |
| `No image content found in response` | Unexpected response format    | Check model supports image output              |
