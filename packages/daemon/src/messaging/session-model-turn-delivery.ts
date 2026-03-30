/**
 * How a session model turn delivers its assistant output to the user. Core uses these shapes; each
 * messaging transport interprets them (e.g. Discord maps `messaging_surface` to REST channel post).
 */
export type SessionModelTurnDelivery =
  | { readonly kind: "internal" }
  | {
      readonly kind: "messaging_surface";
      readonly userId: string;
      readonly replyToMessageId?: string;
    };
