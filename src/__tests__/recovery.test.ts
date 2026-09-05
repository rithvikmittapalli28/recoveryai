import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PaymentRecoverySchema } from '../ai/agents/payment-recovery';
import { RecoveryPolicy } from '../business/recovery/policy';

describe('Recovery AI Structured Output Validation', () => {
    it('should validate correctly structured recoverable AI output', () => {
        const validOutput = {
            recoverable: true,
            confidence: 0.85,
            reason: "Network timeout during payment",
            recommendedAction: "CREATE_PAYMENT_LINK",
            priority: "HIGH"
        };
        const parsed = PaymentRecoverySchema.parse(validOutput);
        assert.strictEqual(parsed.recoverable, true);
        assert.strictEqual(parsed.recommendedAction, "CREATE_PAYMENT_LINK");
    });

    it('should validate non-recoverable output', () => {
        const validOutput = {
            recoverable: false,
            confidence: 0.1,
            reason: "Suspected fraud",
            recommendedAction: "NONE",
            priority: "LOW"
        };
        const parsed = PaymentRecoverySchema.parse(validOutput);
        assert.strictEqual(parsed.recoverable, false);
    });

    it('should reject invalid AI output', () => {
        const invalidOutput = {
            recoverable: "maybe", 
            confidence: 1.5,      
            reason: "Idk",
            recommendedAction: "SEND_EMAIL", 
            priority: "URGENT"    
        };
        
        assert.throws(() => {
            PaymentRecoverySchema.parse(invalidOutput);
        });
    });
});

describe('Recovery Policy Idempotency and Safety', () => {
    it('should reject if opportunity is not found', () => {
        const result = RecoveryPolicy.validate(null, 100, 'INR');
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, "Opportunity not found.");
    });

    it('should reject if amount mismatches', () => {
        const opportunity = {
            id: 'opp-1',
            amountSubunits: 500,
            currency: 'INR',
            status: 'OPEN',
            recoveryActions: []
        };
        const result = RecoveryPolicy.validate(opportunity, 100, 'INR');
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, "Amount or currency mismatch.");
    });

    it('should reject if duplicate active action exists (idempotency)', () => {
        const opportunity = {
            id: 'opp-1',
            amountSubunits: 100,
            currency: 'INR',
            status: 'OPEN',
            recoveryActions: [{ status: 'PENDING_APPROVAL' }]
        };
        const result = RecoveryPolicy.validate(opportunity, 100, 'INR');
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, "An active recovery action already exists for this opportunity.");
    });

    it('should reject if opportunity is already RECOVERED', () => {
        const opportunity = {
            id: 'opp-1',
            amountSubunits: 100,
            currency: 'INR',
            status: 'RECOVERED',
            recoveryActions: []
        };
        const result = RecoveryPolicy.validate(opportunity, 100, 'INR');
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.reason, "Opportunity is no longer actionable.");
    });

    it('should pass validation if opportunity is actionable and no duplicates exist', () => {
        const opportunity = {
            id: 'opp-1',
            amountSubunits: 100,
            currency: 'INR',
            status: 'OPEN',
            recoveryActions: [{ status: 'REJECTED' }]
        };
        const result = RecoveryPolicy.validate(opportunity, 100, 'INR');
        assert.strictEqual(result.valid, true);
    });
});
