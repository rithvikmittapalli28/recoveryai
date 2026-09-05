/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { generateObject } from "ai";
import { AI_MODELS } from "../../ai/config";
import { AbandonmentCandidate } from "./detector";

export const CheckoutAbandonmentAIOutputSchema = z.object({
  recommendedAction: z.enum(["CREATE_PAYMENT_LINK", "SEND_REMINDER", "MANUAL_REVIEW"]),
  reasoning: z.string(),
  suggestedRecoveryApproach: z.string()
});

export type CheckoutAbandonmentAIOutput = z.infer<typeof CheckoutAbandonmentAIOutputSchema>;

export async function runAbandonmentAgent(
  candidate: AbandonmentCandidate,
  merchantContext: any
): Promise<CheckoutAbandonmentAIOutput> {
  if (process.env.MOCK_AI_FAIL === 'true') throw new Error("Mock AI Failure");
  if (process.env.MOCK_AI === "true") {
    return {
      recommendedAction: "CREATE_PAYMENT_LINK",
      reasoning: "Customer has no successful history but made payment attempts, indicating intent.",
      suggestedRecoveryApproach: "Send a fresh payment link highlighting support."
    };
  }

  const model = AI_MODELS.checkoutRecovery || AI_MODELS.paymentRecovery; // fallback if not explicitly defined

  const prompt = `
You are an expert AI Checkout Abandonment Recovery Agent for Razorpay merchants.
Your goal is to analyze deterministic factual evidence about a likely checkout abandonment candidate and recommend a recovery strategy.

Important Constraints:
1. Do not claim certainty that the customer abandoned the checkout unless explicit telemetry exists. Use wording such as "likely checkout abandonment".
2. Rely strictly on the provided factual evidence. Do not invent customer history or financial values.
3. Recommend actions within the existing Human-in-the-Loop model (e.g., CREATE_PAYMENT_LINK).
4. Do not directly execute actions.

Merchant Name: ${merchantContext.name}
Evidence:
${JSON.stringify(candidate.evidence, null, 2)}
  `;

  const result = await generateObject({
    model,
    schema: CheckoutAbandonmentAIOutputSchema,
    prompt,
    temperature: 0.1,
  });

  return result.object;
}
