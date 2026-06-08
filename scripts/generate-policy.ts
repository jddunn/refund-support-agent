/**
 * Use the model to draft a refund policy. Writes to
 * seed/refund-policy.generated.md so it does not overwrite the curated policy
 * the app enforces. Demonstrates bootstrapping the policy document with an LLM.
 *
 *   npm run gen:policy
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { makeAgentModel } from '@/agent/model-factory';

async function main(): Promise<void> {
  try {
    const { model } = makeAgentModel('auto', { injectionFlags: [], message: '', turnCount: 0 });
    const result = await model.invoke([
      new HumanMessage(
        'Write a short e-commerce refund policy in markdown with numbered clauses (for example §2.1) covering: ' +
          'final-sale items are not refundable; a 30-day return window; the order must belong to the customer; ' +
          'refunds over $500 require human escalation; customers with three or more prior refunds are escalated; ' +
          'and a refund cannot exceed the amount paid. Keep it firm and clear.',
      ),
    ]);

    const text =
      typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    const out = join(process.cwd(), 'seed', 'refund-policy.generated.md');
    writeFileSync(out, `${text}\n`);
    console.log(
      `Wrote a policy draft to ${out}. The app enforces the curated seed/refund-policy.md.`,
    );
  } catch (err) {
    console.error(`Failed to generate policy: ${String(err)}`);
    process.exitCode = 1;
  }
}

void main();
