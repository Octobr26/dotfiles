# Current Model Evidence

Checked against first-party documentation on 2026-08-19.
This file is a refreshable snapshot; `model-routing.md` contains the operating policy.

## Current Models and Price Anchors

Prices are first-party API list prices per million input/output tokens.
They are useful for relative routing decisions; Claude subscription quotas and third-party provider billing can differ.

| Provider | Current model | Documented purpose | Supported effort | Input / output |
| --- | --- | --- | --- | --- |
| OpenAI | `gpt-5.6-luna` | Cost-sensitive, high-volume workloads. | `none`, `low`, `medium`, `high`, `xhigh`, `max` | $0.20 / $1.20 |
| OpenAI | `gpt-5.6-terra` | Balance intelligence and cost. | `none`, `low`, `medium`, `high`, `xhigh`, `max` | $2 / $12 |
| OpenAI | `gpt-5.6-sol` | Frontier complex professional reasoning and coding. | `none`, `low`, `medium`, `high`, `xhigh`, `max` | $5 / $30 |
| Anthropic | Claude Haiku 4.5 | Fastest model for simple, efficient work. | Claude Code effort is unsupported. | $1 / $5 |
| Anthropic | Claude Sonnet 5 | Best combination of speed and intelligence; daily coding. | `low`, `medium`, `high`, `xhigh`, `max` | $2 / $10 |
| Anthropic | Claude Opus 5 | Complex agentic coding and reasoning. | `low`, `medium`, `high`, `xhigh`, `max` | $5 / $25 |
| Anthropic | Claude Fable 5 | Highest capability for long-running agents and work larger than one sitting. | `low`, `medium`, `high`, `xhigh`, `max` | $10 / $50 |

## Evidence-Based Defaults

- OpenAI documents Terra as the cost/intelligence balance and Luna as the cost-sensitive tier; the pipeline therefore uses Luna only for bounded evidence and Terra for normal judgment.
- OpenAI recommends `medium` as a balanced start and reserving higher levels for measured quality gains; Luis' manual escalation ceiling is `high`, and the pipeline never selects `xhigh`, `max`, or Ultra automatically.
- Anthropic describes Haiku as fast and efficient for simple tasks, Sonnet as daily coding, Opus as complex reasoning, and Fable as hardest and longest-running work.
- Anthropic does not list Haiku 4.5 among models supporting effort, so the Haiku collector deliberately omits `effort`.
- Anthropic states that effort changes reasoning volume rather than imposing a hard token ceiling; each pipeline stage therefore also needs a stop condition and delegation budget.
- Claude `ultracode` and `xhigh` are not pipeline defaults because Luis has not seen enough benefit to justify their token cost; explicit High escalation uses Opus at `high`.
- The provider descriptions do not prescribe these exact agent roles. The routing table is an inference that must be evaluated on Luis' representative tasks.

## Primary Sources

- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [OpenAI GPT-5.6 model and effort guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Claude Code model aliases and effort support](https://code.claude.com/docs/en/model-config)
- [Claude Code custom subagent configuration](https://code.claude.com/docs/en/sub-agents)
- [Anthropic current model comparison](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

Refresh this snapshot when a provider changes a model alias or price, a selected model is unavailable, or the routing evaluation shows a quality or cost regression.
