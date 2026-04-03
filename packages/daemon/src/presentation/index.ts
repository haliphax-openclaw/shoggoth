// Presentation layer — barrel re-exports.

export {
  formatDegradedPrefix,
  formatModelTagFooter,
  formatErrorUserText,
  formatAssistantReply,
  formatAssistantReplyWithImages,
  type FailoverMeta,
  type FormattedReplyWithImages,
} from "./reply-formatter.js";

export {
  createCoalescingStreamPusher,
} from "./stream-coordinator.js";

export {
  PresentationTurnOrchestrator,
  type OrchestrateTurnInput,
  type PresentationTurnOrchestratorDeps,
} from "./turn-orchestrator.js";

export {
  formatHitlPayloadExcerpt,
  buildHitlQueuedNoticeLines,
  HITL_NOTICE_PAYLOAD_MAX_CHARS,
  type HitlPendingActionRow,
} from "./hitl-notice-formatter.js";

export {
  setNoticeResolver,
  daemonNotice,
} from "./notices.js";

export type {
  PlatformAdapter,
  PlatformCapabilities,
  StreamHandle,
  HitlNoticeData,
  OutboundAttachment,
} from "./platform-adapter.js";

export {
  routeReaction,
  parseReactionLegend,
  type ReactionRouteInput,
  type ReactionRouteResult,
  type ReactionLegendEntry,
  type ParsedReactionLegend,
} from "./reaction-router.js";

export {
  ReactionQueue,
  type QueuedReaction,
} from "./reaction-queue.js";

export {
  buildMinimalContextMessages,
  formatGlobalReactionEventContext,
  formatAdhocReactionEventContext,
  type MinimalContextInput,
} from "./minimal-context.js";

export {
  extractOutboundImages,
  type OutboundImageAttachment,
  type OutboundImageResult,
} from "./image-outbound.js";

export {
  ingestAttachmentImage,
  type ImageIngestOptions,
} from "./image-ingest.js";
