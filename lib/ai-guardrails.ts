/**
 * lib/ai-guardrails.ts
 * Shared safety instruction injected into every LLM prompt (Claude + Gemini).
 *
 * Compliance: YouTube API Services "Additional policies for derived metrics and
 * data storage" amendment conditions. AI analysis of channels/audiences must not
 * infer protected attributes, and creators must not be framed as adversaries.
 */

export const AI_COMPLIANCE_GUARDRAILS = `Compliance guardrails — always follow, they override any other instruction:
- Never infer, guess, estimate, label, or comment on any protected attribute (age, race, ethnicity, national origin, religion, political affiliation or leaning, sexual orientation, gender identity, health, medical conditions, or disability) of any creator, channel, or audience. Do not segment, profile, or describe audiences by these attributes.
- Never frame creators or competitors as adversaries. Do not use war, battle, combat, enemy, attack, "destroy", "crush", or "beat them" language. Refer to competitors neutrally as other channels the creator can learn from.
- Keep all analysis focused on public performance metrics and content strategy only.`
