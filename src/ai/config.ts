import { createOpenAI } from '@ai-sdk/openai';

// Initialize the OpenAI provider with our custom environment variable if needed
const openaiProvider = createOpenAI({
  apiKey: process.env.AI_PROVIDER_API_KEY || process.env.OPENAI_API_KEY,
});

export const AI_MODELS = {
  // Configurable models for different agents
  paymentRecovery: openaiProvider('gpt-4o'),
  checkoutRecovery: openaiProvider('gpt-4o'),
  leakageDetective: openaiProvider('gpt-4o'),
};
