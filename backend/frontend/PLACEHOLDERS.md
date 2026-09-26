# UI Placeholder Tracker

Items marked `[PLACEHOLDER]` in the frontend need backend API additions.

| Screen | Field | Current value | API needed |
|--------|-------|---------------|------------|
| Boards | Camera count | Hardcoded "—" | `GET /api/boards` → `cameras` field |
| Boards | Bridge version | Hardcoded "—" | `GET /api/boards` → `bridgeVersion` field |
| Boards | Game count | Hardcoded "—" | `GET /api/boards` → `totalGames` field |
| Boards | Latency | Hardcoded "— ms" | `GET /api/boards` → `latencyMs` field |
| Boards | Detail panel (cameras, event feed) | Not shown | Separate board detail endpoint |
| GameDisplay | Board name in header | Hardcoded "Board" | Session board name from snapshot |
