import * as z from "zod/v4";

export const VideoRequest = z.object({
  request_id: z.string().min(1).max(128),
  operation: z.enum(["create_video_mission","get_work","submit_work","approve_stage","get_status","get_delivery"]),
  role: z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
  locale: z.string().min(2).max(32).default("vi-VN"),
  input: z.record(z.string(), z.unknown()),
  client_context: z.record(z.string(), z.unknown()).optional()
}).strict();

export const VideoResponse = z.object({
  request_id: z.string(),
  status: z.enum(["accepted","completed","blocked","degraded","failed"]),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  public_evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  errors: z.array(z.object({
    code:z.string(),
    message:z.string(),
    retryable:z.boolean().optional()
  }).strict()).default([]),
  exposure: z.enum(["PUBLIC_DECLASSIFIED","MODEL_SESSION_PRIVATE"])
}).strict();

export type VideoRequestType=z.infer<typeof VideoRequest>;
export type VideoResponseType=z.infer<typeof VideoResponse>;
