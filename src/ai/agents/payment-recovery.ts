/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateObject } from 'ai';
import { z } from 'zod';
import { AI_MODELS } from '../config';

export const PaymentRecoverySchema = z.object({
  recoverable: z.boolean().describe("Whether the payment failure can reasonably be recovered (e.g., skip fraud or permanent errors)."),
  reason: z.string().describe("A brief explanation of why this is or isn't recoverable, based on the failure reason."),
  recommendedAction: z.enum(['CREATE_PAYMENT_LINK', 'NONE']).describe("The specific action proposed to recover the revenue.")
});

export type PaymentRecoveryDecision = z.infer<typeof PaymentRecoverySchema>;

export async function analyzePaymentFailure(
  opportunity: any, // Using any for now to avoid Prisma import issues if the schema hasn't generated correctly yet
  event: any
): Promise<PaymentRecoveryDecision> {
  if (process.env.MOCK_AI === 'true') {
    return { recoverable: true, reason: 'Mocked reason', recommendedAction: 'CREATE_PAYMENT_LINK' };
  }

  const { object } = await generateObject({
    model: AI_MODELS.paymentRecovery,
    schema: PaymentRecoverySchema,
    system: `You are the Payment Recovery Agent for RecoverAI, an AI revenue recovery platform.
Your task is to analyze a failed payment and determine if it is recoverable.
Consider network errors, insufficient funds, timeout, or customer drops as highly recoverable via a payment link.
Consider suspected fraud, invalid cards, or hard bank restrictions as non-recoverable (recoverable: false, action: NONE).

Do not hallucinate actions. Only recommend 'CREATE_PAYMENT_LINK' if recoverable.
Respond strictly in JSON matching the schema.`,
    prompt: `Analyze the following failed payment opportunity:
Opportunity ID: ${opportunity.id}
Amount: ${opportunity.amountSubunits} ${opportunity.currency}
Failure Reason: ${opportunity.reason || 'Unknown'}
Event Metadata: ${JSON.stringify(event.metadata || {})}
`
  });

  return object;
}
