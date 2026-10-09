# MCP integration

App: GLOW VIDEO. URL: https://peachpuff-frog-205135.hostingersite.com/mcp-v2. OAuth is required for protected work; operator acceptance additionally requires backend-verified permission. The stable URL is independent of repository branch naming.

The current tool family includes:
- glow_video_v2_public_profile
- glow_start_video_v2_mission
- glow_get_video_v2_status
- glow_prepare_video_v2_phase_acceptance
- glow_accept_video_v2_phase
- glow_revise_video_v2_phase
- glow_get_video_v2_mcp_work_package
- glow_record_video_v2_external_result
- glow_get_video_v2_external_result
- glow_review_video_v2_external_result
- glow_start_video_v2_trial (synthetic evidence only)

Start/resume the intended mission. Prepare the exact phase content; inspect the returned review material. Accept only after explicit operator approval. Stale or changed content requires new preparation. Never invent approval identifiers, payload hashes or actor permissions.

If tools are stale, refresh the existing app's tools once and inspect discovery. Do not recreate apps or repeatedly reconnect in response to a documentation commit. Report the exact bounded error and current state before another attempt.

Legacy /mcp and /mcp-v3 are not supported operating routes. Archived source is not a fallback gateway.
