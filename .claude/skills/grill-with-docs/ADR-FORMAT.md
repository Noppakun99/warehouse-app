# ADR format

An **Architecture Decision Record** captures one significant decision: what was decided, why, and what it costs. One decision per file. Write it so a future reader who wasn't in the room understands *why*, not just *what*.

Only write an ADR when all three are true: the decision is **hard to reverse**, **surprising without context**, and **the result of a real trade-off**. Otherwise skip it.

## File naming

`docs/adr/NNNN-short-kebab-title.md` — sequential, zero-padded, never reused.

Examples: `0001-event-sourced-orders.md`, `0002-postgres-for-write-model.md`

## Template

```markdown
# NNNN. <Short imperative title>

- **Status:** Proposed | Accepted | Superseded by [ADR-XXXX](XXXX-....md) | Deprecated
- **Date:** YYYY-MM-DD

## Context

What forces are at play? The problem, the constraints, the requirements that
make this decision necessary. Written so a newcomer understands the pressure
without already knowing the answer. State facts, not the choice.

## Decision

The choice, in active voice: "We will <do X>." Be specific and unambiguous.

## Consequences

What becomes easier and what becomes harder as a result. Include the costs you
accepted, not just the benefits — this is the section future readers come for.

- Positive: <…>
- Negative / trade-off: <…>
- Follow-ups / risks: <…>

## Alternatives considered

- **<Option A>** — why it was rejected.
- **<Option B>** — why it was rejected.
```

## Rules

- **Immutable once Accepted.** Don't edit the decision later. If it changes, write a *new* ADR and set this one's status to `Superseded by …`.
- **The Context must not give away the answer.** If a reader can guess the Decision from the Context alone, you've under-described the trade-off.
- **Alternatives are mandatory.** "The result of a real trade-off" means there were genuine options — name them and say why they lost.
- **Be honest about the negatives.** An ADR with only upsides is marketing, not a record.

## Example

```markdown
# 0001. Event-source the Order write model

- **Status:** Accepted
- **Date:** 2026-06-06

## Context

Orders move through many states (Placed → Confirmed → Fulfilled → Cancelled),
and finance, support, and fulfilment all need an accurate history of *how* an
Order reached its current state — not just the latest snapshot. Disputes
require reconstructing the exact sequence of changes after the fact.

## Decision

We will model the Order aggregate as an event-sourced stream, persisting domain
events as the source of truth and deriving the current state by folding them.

## Consequences

- Positive: complete, immutable audit history for free; temporal queries become natural.
- Negative / trade-off: every read of current state requires a fold or a maintained projection; higher write-model complexity; team must learn event-sourcing patterns.
- Follow-ups: requires a separate read model (see [ADR-0002](0002-postgres-for-write-model.md)).

## Alternatives considered

- **CRUD with an audit table** — simpler, but the audit trail drifts from the
  real state and can't reconstruct intermediate states reliably.
- **Snapshot + changelog** — less rigorous; loses the guarantee that history
  and state are derived from the same source.
```