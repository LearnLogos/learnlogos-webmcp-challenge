# Pre-existing and Challenge-Period Work

LearnLogos existed before the WebMCP Challenge. The immutable private-repository
baseline used for this entry is commit
`b3023a9b0c588bd8ffe4d6a384ee91fbb5871c3d`, authored August 24, 2026, before the
challenge opened. The private history remains the timestamped evidence source.

## Pre-existing foundation

- The production storefront, accounts, catalog, purchases, subscriptions, and
  deployment pipeline.
- Timestamped transcript and caption ingestion.
- PostgreSQL transcript search and administrator-only video-search/clip prototypes.
- Other existing LearnLogos study and learning tools.

None of those production systems, routes, databases, customer records, credentials,
or private content is included or connected to this public candidate.

## Work added during the challenge

- Browser WebMCP registration and the versioned
  `learnlogos.search_training.v1` contract.
- A reusable search application service with separate contest ports and adapters.
- A deterministic corpus limited to two approved teaching segments.
- Exact-digest, surface-specific rights policy and fail-closed content activation.
- Dedicated Redis-backed contest sessions and layered request budgets.
- Short-lived media/caption grants bound to session, segment, and asset version.
- Host/deployment isolation, default-off capabilities, nonce CSP, and strict public
  response schemas.
- The allowlist-only source-and-assets exporter, compliance evidence, tests,
  challenge page, setup documentation, and demonstration plan.

## Not claimed

This entry does not claim production WebMCP integration, authenticated or
transactional tools, account mutation, recommendations, database migrations, or
access to the complete LearnLogos training library. Judging should evaluate the
challenge-period WebMCP extension listed above.
