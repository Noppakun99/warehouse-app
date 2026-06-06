# CONTEXT.md format

`CONTEXT.md` is a **glossary** — the canonical language of one context. It defines what each term means *here*, so that the same word always points to the same concept. It is not a spec, a design doc, or a scratch pad. No implementation details.

## Structure

```markdown
# <Context name> — Glossary

> One line on what this context is responsible for.

## <Term>

<One or two sentences defining the term precisely, in domain language.>

- **Is not:** <the thing it's commonly confused with, and why it's different>
- **Lifecycle / states:** <only if the term has meaningful states>
- **Related:** [[Other Term]]
```

## Rules

- **One concept per entry.** If a word means two things, split it into two precisely-named terms and record the disambiguation.
- **Define, don't describe behaviour.** "An Order is a customer's committed intent to purchase," not "An Order is created when the user clicks checkout and we insert a row."
- **Capture the distinctions that bit you.** The most valuable entries are the ones that say *X is not Y* — that's where the confusion lives.
- **Use the user's words, sharpened.** Prefer the team's existing term over a textbook one, but make it unambiguous.
- **Link related terms** with `[[Term]]` so the glossary stays navigable.
- **Alphabetical or grouped by aggregate** — pick one ordering and keep it.

## Example

```markdown
# Ordering — Glossary

> Owns the lifecycle of a customer's purchase from intent to fulfilment hand-off.

## Order

A customer's committed intent to purchase one or more Line Items, priced at the moment of commitment.

- **Is not:** a Cart. A Cart is mutable and unpriced; an Order is immutable once placed.
- **States:** Placed → Confirmed → Fulfilled → Closed (or Cancelled)
- **Related:** [[Line Item]], [[Cancellation]]

## Cancellation

The voiding of an entire Order before fulfilment begins. Always whole-Order.

- **Is not:** a Return (post-fulfilment) or a partial removal of Line Items (not supported).
- **Related:** [[Order]], [[Return]]
```