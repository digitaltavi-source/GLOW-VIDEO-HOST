# GLOW Video Public Security Boundary

Public-safe:
- MCP request/response contracts
- authentication/resource metadata code
- Hostinger deployment metadata
- user-facing docs/UI
- bounded status/error vocabulary

Forbidden:
- KIT A/B/C internals
- Capability System internals
- Factory Control/private runtime
- internal evaluator rules, thresholds and prompts
- restricted evidence and release hashes
- credentials and provider secrets

Laws:
- `PUBLIC HOST != PROTECTED BACKEND`
- `PUBLIC ADAPTER != SOURCE OF TRUTH`
- `PUBLIC_DECLASSIFIED = USER-SAFE EGRESS`
- `MODEL_SESSION_PRIVATE = AUTHENTICATED CHATGPT WORK CONTEXT`
- `BACKEND UNAVAILABLE -> FAIL CLOSED / DEGRADED`
