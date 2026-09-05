/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { generateObject } from "ai";
import { AI_MODELS } from "../../ai/config";

export const UnifiedScoringAIOutputSchema = z.object({
  recoveryProbability: z.number()
    .min(0, "recoveryProbability must be at least 0")
    .max(1, "recoveryProbability must be at most 1"),
  reasoning: z.string(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
});

export type UnifiedScoringAIOutput = z.infer<typeof UnifiedScoringAIOutputSchema>;

export async function runUnifiedScoringAgent(
  source: string,
  amountAtRisk: number,
  currency: string,
  domainEvidence: Record<string, any>,
  merchantContext: { name: string }
): Promise<UnifiedScoringAIOutput> {
  if (process.env.MOCK_AI === "true") {
    // Return mock data for synthetic tests
    return {
      recoveryProbability: 0.5,
      reasoning: "Mock AI scoring logic.",
      urgency: "MEDIUM"
    };
  }

  // Use a capable model
  const model = AI_MODELS.paymentRecovery; 

  const prompt = `
You are the Unified AI Recovery Scoring Agent for Razorpay merchants.
Your ONLY task is to estimate the probability that a RevenueOpportunity can be successfully recovered, and to determine its urgency.

Important Constraints:
1. You must ONLY output recoveryProbability (0.0 to 1.0), reasoning, and urgency.
2. DO NOT determine amountAtRisk, expectedRecoveryValue, priorityScore, or any financial amount.
3. Keep your reasoning concise and strictly based on the provided factual evidence.
4. DO NOT invent financial metrics or customer history.

Context:
Merchant Name: ${merchantContext.name}
Opportunity Source: ${source}
Amount At Risk: ${amountAtRisk} ${currency}

Factual Evidence (Including domain analysis):
${JSON.stringify(domainEvidence, null, 2)}
  `;

  const result = await generateObject({
    model,
    schema: UnifiedScoringAIOutputSchema,
    prompt,
    temperature: 0.1,
    maxRetries: 3 // Vercel AI SDK handles retries automatically if Zod validation fails (e.g. out of bounds)
  });

  return result.object;
}
