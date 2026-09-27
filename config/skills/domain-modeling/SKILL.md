---
name: domain-modeling
description: Resolve consequential ambiguity in project terminology, identifiers, states, ownership, or relationships; document established meanings and non-obvious decisions within authorized work. Ordinary code lookup does not require a glossary exercise.
---

# Domain modeling

Start with existing domain docs, runbooks, code, configuration, and verified examples.
Use established terms and document locations; follow any existing context map.
Separate business meaning from representation, identifier, owner, and state transitions.

## Resolve a material ambiguity

1. State the competing meanings and the concrete behavior each would imply.
2. Inspect the authoritative source and reachable code path rather than asking for facts available locally.
3. Use a small concrete scenario to distinguish the meanings.
   Label invented scenarios as examples, not evidence of live data or agreed behavior.
4. Record confirmed facts, proposed meanings, and unresolved disagreements separately.
   If docs, code, and user intent conflict, explain the conflict and resolve material requirements before implementation.
5. Ask the user only for a decision the evidence cannot settle and that materially changes the work.

Do not automatically rename code, reinterpret live records, or rewrite a glossary to make a disagreement disappear.

## Capture only durable knowledge

When documentation changes are authorized, update the existing glossary or decision record near its owner.
Create a small glossary only when a resolved recurring term warrants one and no existing home fits.
Use [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md) as a fallback format, not a required layout.
During read-only research or review, return proposed documentation instead of writing it into the project.

A decision record is useful when the choice is consequential to reverse, surprising without context, and based on a real tradeoff.
Use [ADR-FORMAT.md](ADR-FORMAT.md) only when those conditions apply and recording the decision is authorized.
Keep glossary meanings separate from temporary implementation plans; preserve evidence links for claims that may change.
