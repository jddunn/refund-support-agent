/**
 * Use the model to generate a synthetic CRM dataset. Writes to
 * seed/customers.generated.json so it does not overwrite the curated fixtures
 * the app ships with. Demonstrates bootstrapping the data with an LLM.
 *
 *   npm run gen:data
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { makeAgentModel } from '@/agent/model-factory';

const Schema = z.object({
  customers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      since: z.string(),
      priorRefunds: z.number(),
      orders: z.array(
        z.object({
          id: z.string(),
          item: z.string(),
          category: z.string(),
          price: z.number(),
          finalSale: z.boolean(),
          purchasedAt: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
});

async function main(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { model } = makeAgentModel('auto', { injectionFlags: [], message: '', turnCount: 0 });
    const structured = model.withStructuredOutput(Schema, { name: 'crm' });

    const data = await structured.invoke(
      `Generate a synthetic CRM dataset of 15 fictional customers for testing a refund support agent. ` +
        `Use ids like CUST-1001 and order ids like ORD-58000. Include realistic variety and at least: ` +
        `one final-sale item, one order over $500, one order purchased more than 40 days before ${today}, ` +
        `and one customer with three or more prior refunds. Use categories like electronics, apparel, and home. ` +
        `Dates must be YYYY-MM-DD. Order status is one of delivered, shipped, processing, or cancelled.`,
    );

    const out = join(process.cwd(), 'seed', 'customers.generated.json');
    writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
    console.log(
      `Wrote ${data.customers.length} customers to ${out}. The app uses the curated seed/customers.json.`,
    );
  } catch (err) {
    console.error(`Failed to generate synthetic data: ${String(err)}`);
    process.exitCode = 1;
  }
}

void main();
