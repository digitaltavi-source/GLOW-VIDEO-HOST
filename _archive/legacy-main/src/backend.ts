import { VideoResponse, type VideoRequestType, type VideoResponseType } from "./contracts.js";
import type { HostConfig } from "./config.js";

export class BackendError extends Error {}

export async function callProtectedService(
  config: HostConfig,
  subject: string,
  request: VideoRequestType,
  fetchImpl: typeof fetch = fetch
): Promise<VideoResponseType> {
  const response = await fetchImpl(`${config.protectedServiceUrl}/v1/video-missions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${config.protectedServiceToken}`,
      "x-glow-subject": subject
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) throw new BackendError(`PROTECTED_SERVICE_HTTP_${response.status}`);

  const raw: unknown = await response.json();
  const parsed = VideoResponse.safeParse(raw);
  if (!parsed.success) throw new BackendError("DECLASSIFICATION_SCHEMA_REJECTED");
  return parsed.data;
}

export async function checkProtectedReadiness(
  config: HostConfig,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; protected_service_authenticated: boolean; code: string }> {
  const probe: VideoRequestType = {
    request_id: "readiness-probe-v1",
    operation: "get_status",
    role: "unspecified",
    locale: "vi-VN",
    input: { mission_id: "M-READINESS-NONEXISTENT" }
  };

  try {
    const out = await callProtectedService(config, "readiness-probe", probe, fetchImpl);
    const code = out.errors?.[0]?.code ?? "";
    if (out.status === "failed" && code === "MISSION_NOT_FOUND") {
      return { ok: true, protected_service_authenticated: true, code: "PROTECTED_FACTORY_REACHABLE" };
    }
    return { ok: false, protected_service_authenticated: true, code: "PROTECTED_FACTORY_UNEXPECTED_RESPONSE" };
  } catch (error) {
    return {
      ok: false,
      protected_service_authenticated: false,
      code: error instanceof Error ? error.message : "PROTECTED_FACTORY_PROBE_FAILED"
    };
  }
}
