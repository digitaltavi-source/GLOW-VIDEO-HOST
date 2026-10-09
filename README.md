# GLOW Video

A governed video production workflow: customer brief → reviewed creative plan → external generation → evidence-linked output review.

This public repository contains factory information, operating guidance and MCP integration specifications. The deployed runtime is maintained in the private Factory repository. Archived host implementations are historical source, not installation packages or active deployment instructions.

## Connect
- Existing app name: **GLOW VIDEO**.
- Stable MCP endpoint: **https://peachpuff-frog-205135.hostingersite.com/mcp-v2**.
- Authentication: OAuth. Sign in with the operator account authorized for the factory.
- Keep the same app and URL across compatible server upgrades. Refresh tools when tool definitions change; reconnect only when an actual authorization problem requires it.

Read [integration](docs/MCP_INTEGRATION.md), [operating workflow](docs/OPERATING_WORKFLOW.md), [deployment boundary](docs/DEPLOYMENT_BOUNDARY.md) and [security policy](SECURITY_BOUNDARY.md).

## Demonstrated scope
Local regression and live intake/H1 preparation with restart persistence have been demonstrated. Complete live phase acceptance, finished customer video and independent five-star qualification remain to be demonstrated. Professional quality is assessed on actual output; neither a working connector nor a synthetic test establishes it.

See [public status](PUBLIC_RELEASE_STATE.json). The public Host repository is documentation, not a second Factory source.
