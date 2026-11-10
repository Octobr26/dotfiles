# Model evidence

OpenAI guidance checked on 2026-11-03.
This is supporting evidence; [model-routing.md](model-routing.md) owns the operating policy and explicit model/effort choices.

## OpenAI

| Model | Documented fit |
| --- | --- |
| `gpt-6.1-sol` | Complex coding and professional work with a balance of capability, time and cost. |
| `gpt-6-astra` | Demanding reasoning, ambiguous problems and deep analysis. |
| `gpt-6.1-terra` | Scoped code fixes, visual reasoning and computer use with clear inputs and verification. |
| `gpt-6-luna` | Focused, cost-sensitive workloads and bounded collection. |

GPT-6.1 Sol supports explicit `high` effort and native tool use; a custom API integration must use Responses for tool calling.
The 2026-11-03 harness update adopts Sol for substantive Codex work in response to Luis's request to use GPT-6.1 Sol and improve the harness.
Choosing high effort is a local quality preference, not a measured guarantee of fewer escaped defects.
Compare model outputs on fixed representative tasks and acceptance criteria before optimizing cost; count review and repair time.

Model availability differs across APIs, local catalogs and agent-spawn interfaces.
Verify the execution surface and read back the effective model; an older model listed in a catalog is not automatically unavailable or a valid fallback for another interface.

## Claude and pricing

The Claude route uses portable family aliases in the installed agent definitions.
Read back the effective version because aliases and provider availability can change.
This OpenAI routing update does not change Claude's role definitions or defaults.
Check current provider pricing for cost comparisons instead of using a historical table as a current quote.
The metrics pricing registry and historical evaluation profiles are separate from executor routing.

## Primary sources

- [GPT-6.1 Sol capabilities and effort](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [OpenAI model selection and comparison guidance](https://developers.openai.com/api/docs/guides/model-selection)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [Claude Code aliases and effort](https://code.claude.com/docs/en/model-config)
- [Claude Code subagent configuration](https://code.claude.com/docs/en/sub-agents)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

Refresh the relevant evidence when a selected model is unavailable or a representative evaluation shows a quality or cost regression.
