/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '../../lib/db/prisma';

export class RecoveryPolicy {
  /**
   * Pure function to validate action proposal based on opportunity state.
   */
  static validate(opportunity: any, proposedAmount: number, proposedCurrency: string) {
    if (!opportunity) {
      return { valid: false, reason: "Opportunity not found." };
    }

    if (opportunity.amountSubunits !== proposedAmount || opportunity.currency !== proposedCurrency) {
       return { valid: false, reason: "Amount or currency mismatch." };
    }

    // Check for duplicate active actions
    const activeActions = opportunity.recoveryActions.filter((a: any) => 
      ['PENDING_APPROVAL', 'APPROVED', 'EXECUTED'].includes(a.status)
    );

    if (activeActions.length > 0) {
       return { valid: false, reason: "An active recovery action already exists for this opportunity." };
    }

    if (opportunity.status === 'RECOVERED' || opportunity.status === 'EXPIRED') {
       return { valid: false, reason: "Opportunity is no longer actionable." };
    }

    return { valid: true };
  }

  /**
   * Database wrapper for validate()
   */
  static async validateActionProposal(
    opportunityId: string,
    actionType: string,
    proposedAmount: number,
    proposedCurrency: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const opportunity = await prisma.revenueOpportunity.findUnique({
      where: { id: opportunityId },
      include: { recoveryActions: true }
    });

    return this.validate(opportunity, proposedAmount, proposedCurrency);
  }
}
