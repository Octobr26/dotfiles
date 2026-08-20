# Research Basis

Last reviewed: 2026-08-19.

This note records the primary research behind the universal research, challenge, and model-routing rules.
The papers largely evaluate question answering or benchmark tasks rather than Luis's real software and operational work, so the pipeline rules below are practical inferences to validate through local outcomes.

## Bounded Debate

- [Kaesberg et al., Findings ACL 2025](https://aclanthology.org/2025.findings-acl.606/) compared seven multi-agent decision protocols across six knowledge and reasoning tasks. More discussion rounds before voting reduced performance, while independent drafting and bounded collective improvement performed better. The experiments used Llama 3 models and benchmark tasks, not software delivery.
- [Becker et al., Findings EACL 2026](https://aclanthology.org/2026.findings-eacl.268/) measured substantial problem drift in longer debates. Human review associated drift primarily with lack of progress, low-quality feedback, and unclear discussion.

Practical inference: use one focused challenge-response round by default, allow a second only for new evidence or a changed artifact, and adjudicate rather than waiting for conversational consensus.

## External Evidence Over Self-Correction

- [Huang et al., ICLR 2024](https://openreview.net/forum?id=IkmD3fKBPQ) found that intrinsic self-correction sometimes reduced reasoning accuracy and that debate did not outperform equal-cost self-consistency in the tested setup. The tested models and benchmark sample are older and narrower than this workflow.
- [CRITIC, ICLR 2024](https://arxiv.org/abs/2305.11738) improved several task types by grounding critique in external tools such as search and code execution. Tool output can also be wrong, so it remains evidence to interpret rather than an automatic verdict.
- [Tyen et al., Findings ACL 2024](https://aclanthology.org/2024.findings-acl.826/) found that models struggled to locate logical mistakes but corrected them more reliably when given the mistake location.
- [Agentic Rubrics, ACL 2026](https://aclanthology.org/2026.acl-long.697/) reported better SWE-Bench patch verification from repository-specific acceptance rubrics. Rubrics complement executable tests and direct inspection rather than replacing them.

Practical inference: require explicit acceptance criteria and direct code, configuration, documentation, test, tool, or runtime evidence. A request to reconsider is not verification.

## Independence, Diversity, and Judge Bias

- [Zhu et al., Findings ACL 2026](https://aclanthology.org/2026.findings-acl.1694/) found that homogeneous vanilla debate can underperform majority vote and reported gains from diverse initial candidates and calibrated confidence updates. Its confidence result depends on calibration and should not be approximated with unsupported self-reported scores.
- [Zheng et al., NeurIPS 2023](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91f18a1287b398d378ef22505bf41832-Abstract-Datasets_and_Benchmarks.html) documented position, verbosity, and self-enhancement concerns in LLM judges.
- [Panickssery et al., NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/hash/7f1f0218e45f5414c79c0679633e47bc-Abstract-Conference.html) found that evaluators can recognize and favor their own generations.

Practical inference: give the first Skeptic pass fresh context, explicit criteria, the artifact, and raw evidence before the Maker's defense. Use criterion-by-criterion review and, for high-risk work when available, a different capable model or model family. Model diversity never substitutes for authoritative evidence.

## Local Validation

Compare only similar task and risk cohorts.
Track verification coverage, material findings caught, findings rejected with evidence, correction rounds, user corrections, escaped defects, necessary user-question rate, elapsed time, and tokens when available.
Optimize speed or model cost only among outcomes that remain correct, accepted, and meaningfully verified.
