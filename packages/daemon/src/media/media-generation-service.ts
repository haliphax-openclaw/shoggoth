import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getLogger } from "../logging.js";

const log = getLogger("media-generation-service");
import { generateContentAdapter } from "./adapters/generate-content-adapter";
import { predictAdapter } from "./adapters/predict-adapter";
import { longRunningAdapter } from "./adapters/long-running-adapter";
import type {
  MediaAdapterRequest,
  MediaAdapterResult,
  MediaGenerateParams,
} from "./adapters/types";

export interface PollRequest {
  provider_id: string;
  operation_id: string;
  output_path?: string;
}

const BUILTIN_MODEL_ADAPTER_MAP: Record<string, "generateContent" | "predict" | "longRunning"> = {
  // Nano Banana image generation models (generateContent with responseModalities: ["IMAGE"])
  "gemini-2.5-flash-image": "generateContent",
  "gemini-3-pro-image-preview": "generateContent",
  "gemini-3.1-flash-image-preview": "generateContent",
  // TTS models (generateContent with responseModalities: ["AUDIO"])
  "gemini-2.5-flash-preview-tts": "generateContent",
  "gemini-2.5-pro-preview-tts": "generateContent",
  "gemini-3.1-flash-tts-preview": "generateContent",
  // Lyria music models (prefix matches lyria-3-pro-preview, lyria-3-clip-preview)
  "lyria-3": "generateContent",
  // Imagen (prefix matches imagen-*)
  imagen: "predict",
  // Veo video models (prefix matches veo-3.1-generate-preview, veo-2.0-generate-001, etc.)
  veo: "longRunning",
};

interface ProviderConfig {
  id: string;
  kind: string;
  apiKey?: string;
  baseUrl?: string;
  models?: Array<{ name: string }>;
}

interface ServiceConfig {
  providers: ProviderConfig[];
  modelAdapterMap?: Record<string, "generateContent" | "predict" | "longRunning">;
}

interface GenerateRequest {
  model: string;
  prompt: string;
  provider_id: string;
  params: MediaGenerateParams;
  output_path: string;
  timeout_ms?: number;
}

function resolveAdapter(
  model: string,
  mergedMap: Record<string, "generateContent" | "predict" | "longRunning">,
): "generateContent" | "predict" | "longRunning" | undefined {
  // Exact match first
  if (mergedMap[model]) {
    return mergedMap[model];
  }
  // Prefix match: find the longest key that is a prefix of the model name
  let bestKey: string | undefined;
  for (const key of Object.keys(mergedMap)) {
    if (model.startsWith(key)) {
      if (!bestKey || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }
  return bestKey ? mergedMap[bestKey] : undefined;
}

export class MediaGenerationService {
  private readonly config: ServiceConfig;
  private readonly mergedMap: Record<string, "generateContent" | "predict" | "longRunning">;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.mergedMap = { ...BUILTIN_MODEL_ADAPTER_MAP, ...config.modelAdapterMap };
  }

  async generate(req: GenerateRequest): Promise<MediaAdapterResult> {
    const adapterType = resolveAdapter(req.model, this.mergedMap);
    if (!adapterType) {
      return {
        status: "error",
        error: `No adapter found for model: ${req.model}`,
      };
    }

    const provider = this.config.providers.find((p) => p.id === req.provider_id);
    if (!provider) {
      return {
        status: "error",
        error: `Provider not found: ${req.provider_id}`,
      };
    }

    if (provider.kind !== "gemini") {
      return {
        status: "error",
        error: `Provider ${req.provider_id} is kind '${provider.kind}', but media generation requires kind 'gemini'`,
      };
    }

    const adapterReq: MediaAdapterRequest = {
      model: req.model,
      prompt: req.prompt,
      apiKey: provider.apiKey ?? "",
      baseUrl: provider.baseUrl ?? "https://generativelanguage.googleapis.com",
      outputPath: req.output_path,
      params: req.params,
    };

    switch (adapterType) {
      case "generateContent":
        return generateContentAdapter(adapterReq);
      case "predict":
        return predictAdapter(adapterReq);
      case "longRunning":
        return longRunningAdapter(adapterReq);
    }
  }

  async poll(req: PollRequest): Promise<MediaAdapterResult> {
    const provider = this.config.providers.find((p) => p.id === req.provider_id);
    if (!provider) {
      return {
        status: "error",
        error: `Provider not found: ${req.provider_id}`,
      };
    }

    if (provider.kind !== "gemini") {
      return {
        status: "error",
        error: `Provider ${req.provider_id} is kind '${provider.kind}', but media generation requires kind 'gemini'`,
      };
    }

    const baseUrl = provider.baseUrl ?? "https://generativelanguage.googleapis.com";
    const apiKey = provider.apiKey ?? "";
    const apiVersion = "v1beta";
    const pollUrl = `${baseUrl}/${apiVersion}/${req.operation_id}?key=${apiKey}`;

    try {
      const response = await fetch(pollUrl);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          status: "error",
          error: `Poll error ${response.status}: ${errorText}`,
        };
      }

      const json = (await response.json()) as Record<string, unknown>;

      if (json.done !== true) {
        return {
          status: "in_progress",
          operation_id: req.operation_id,
        };
      }

      // Parse completed response
      const resp = json.response as Record<string, unknown> | undefined;
      const videoResp = resp?.generateVideoResponse as Record<string, unknown> | undefined;
      const samples = videoResp?.generatedSamples as Array<Record<string, unknown>> | undefined;

      if (!samples || samples.length === 0) {
        return { status: "error", error: "No generated samples in response" };
      }

      const video = samples[0].video as Record<string, unknown> | undefined;
      if (!video) {
        log.warn("media_generation_service.poll_parse_failed", {
          error: "No video data in generated sample",
          sampleKeys: Object.keys(samples[0]),
        });
        return { status: "error", error: "No video data in generated sample" };
      }

      const videoUri = video.uri as string | undefined;
      const base64Data = video.bytesBase64Encoded as string | undefined;
      const encoding = (video.encoding as string) || "video/mp4";
      const outputPath =
        req.output_path || `/tmp/media/${req.operation_id.replace(/\//g, "_")}.mp4`;

      // Prefer URI download (standard Veo 3.1 response), fall back to inline base64
      if (videoUri) {
        try {
          const downloadUrl = apiKey ? `${videoUri}&key=${apiKey}` : videoUri;
          const dlRes = await fetch(downloadUrl, { redirect: "follow" });
          if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
          const buf = Buffer.from(await dlRes.arrayBuffer());
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, buf);
          return { status: "complete", path: outputPath, mime_type: encoding };
        } catch (err) {
          log.warn("media_generation_service.poll_uri_download_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          if (!base64Data) {
            return {
              status: "error",
              error: `Video URI download failed: ${err instanceof Error ? err.message : String(err)}`,
            };
          }
        }
      }

      if (base64Data) {
        const decoded = Buffer.from(base64Data, "base64");
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, decoded);
        return { status: "complete", path: outputPath, mime_type: encoding };
      }

      log.warn("media_generation_service.poll_parse_failed", {
        error: "No video URI or bytesBase64Encoded in response",
        videoKeys: Object.keys(video),
      });
      return { status: "error", error: "No video URI or bytesBase64Encoded in video response" };
    } catch (err) {
      return {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
