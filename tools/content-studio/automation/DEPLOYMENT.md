# Content Studio deployment

Development-only integration. Node 22+. Set OPENAI_API_KEY in a secrets manager.

Commands:
- `node automation/cli.mjs generate carousel`
- `node automation/cli.mjs generate reel`
- `node automation/cli.mjs schedule` drafts due 08:00, 13:00, 19:00 IST slots
- `node automation/cli.mjs render <draft-id>` exports SVGs and experimental MP4 (ffmpeg and ImageMagick required for video)
- `node automation/cli.mjs publish <draft-id>` requires approved draft, explicit ENABLE_INSTAGRAM_PUBLISH=true, Instagram credentials and hosted HTTPS media manifest under data/exports/<draft-id>/media.json.

Publishing is disabled by default. Meta OAuth and professional account authorization must be configured externally. The current tool has no automatic R2 upload, live trend verification, hosted authentication, transactional database, metrics analytics, monitoring, reliable publish reconciliation, or production-grade unattended scheduling. Review content and media before any live publication. Remove tools/content-studio to uninstall.
