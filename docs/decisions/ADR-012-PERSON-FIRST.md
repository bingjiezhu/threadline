# ADR-012: person-first entry, project-aware depth

Status: implemented in release 1.2.0.

Context: the verified v1.0 interface required a contact and project-oriented workflow before its most distinctive feature became visible. The prior narrated v1.1 was not actually packaged. This iteration must restore trust with verifiable code and lower first-use friction without turning a narrow product into an unbounded “second brain.”

Decision: keep the real v1.0 backend. Add a small relationship module, additive SQLite metadata, and a progressive English UI. Basic capture and reminders need no project. Advanced project conditions continue to require exact sources and explicit approval. No new distributed infrastructure or auto-send capability.

Consequences: source capture and daily use are easier to explain; there are two retrieval layers, both clearly labeled. Local people search is lexical. Project matching uses exact normalized topics plus date, certainty and restriction rules. Optional AI remains extraction/drafting only. A real model evaluation and one high-value authorized connector are separate future gates.

Validation: preserve the existing domain/HTTP/provider-contract/operator tests and legacy UI flows; add capture rollback, deletion-replay protection, metadata migration/restore, relationship discovery, reminders, calendar-file format, mobile navigation and session recovery tests. See current verification artifacts for results, not this decision's existence.
