# Deployment responsibilities

One runtime source: private GLOW Video Factory V2 on main. Existing sandbox is the research/test lane. Preserve original version and immutable research/evidence archives.

Hostinger deploys that private source, using its existing Node22 V2 adapter build recipe. This public repository is not the Hostinger application root and does not ship the private runtime. Archived host code must not be deployed.

A compatible update should keep the same MCP URL, OAuth identity/resource boundary and persistent mission state. Validate exact candidate, source identity, readiness and owner-state recovery; build completion alone is insufficient. Keep rollback evidence and data before promotion.

Move approved public documentation only after a declassification review. Never copy the private checkout or private handoff/logs into this repository.
