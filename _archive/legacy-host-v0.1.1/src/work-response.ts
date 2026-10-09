type WorkResponse = {
  status?: string;
  exposure?: string;
  [key: string]: unknown;
};

export function classifyWorkResponse(out: WorkResponse): "PRIVATE_WORK" | "SAFE_PUBLIC_FAILURE" {
  if (out.exposure === "MODEL_SESSION_PRIVATE" && out.status !== "failed") return "PRIVATE_WORK";
  if (out.exposure === "PUBLIC_DECLASSIFIED" && out.status === "failed") return "SAFE_PUBLIC_FAILURE";
  throw new Error("WORK_EXPOSURE_INVALID");
}
