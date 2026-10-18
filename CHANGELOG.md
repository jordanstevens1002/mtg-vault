# Changelog

## Unreleased

- Public GPL-3.0-only repository, contribution guidelines, protected main/develop branches, issue milestones and a delivery board.
- React/TypeScript interface and FastAPI API backed by collection-scoped PostgreSQL, Alembic migrations and Docker Compose.
- Locally synchronised Scryfall catalogue, translated and multi-face name searches, cached printing images and independent cover preferences.
- Grouped owned-card library with colour, mana and type filters, printing details and readable in-deck/owned quantities.
- Named storage, physical stock adjustments and transactional, idempotent transfers to and from built decks.
- Independent planned decks, shortage reporting, atomic builds and deck disassembly.
- Commander construction warnings, pairing and copy-limit exceptions, and persisted chosen-colour preferences.
- Browser camera capture and locally served English OCR with manual correction and explicit printing, finish, quantity and destination confirmation.
- Previewed native collection CSV and planned decklist imports, exports, complete database backups and documented restoration.
- PostgreSQL integration tests, component tests, Compose browser journeys and CI checks for quality, PR policy and generated API types.
- Indexed name searches reduce the measured Plains query from 15.48 seconds to 0.17 seconds with 118,773 catalogue printings.

This remains a development candidate. Real Android Chrome, iPhone Safari and desktop camera acceptance, plus maintainer review, are required before merging the release into main and publishing v1.0.
