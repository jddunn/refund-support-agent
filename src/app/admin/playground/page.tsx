import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '@/db';
import { ChatWindow, type Scenario } from '@/components/chat/ChatWindow';
import { availableModelOptions } from '@/agent/models';
import { listCustomersWithOrders } from '@/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The pre-canned demo scenarios, captured from real runs by build-demo-scenarios. */
function loadScenarios(): Scenario[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'seed', 'demo-scenarios.json'), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.scenarios) ? (data.scenarios as Scenario[]) : [];
  } catch {
    return [];
  }
}

// The staff playground: the same chat as consumers, plus the model selector and
// the scenario demo runner (auto-play the red-team cases, canned or live).
export default async function PlaygroundPage() {
  const db = await getDb();
  const customers = await listCustomersWithOrders(db);
  return (
    <ChatWindow
      customers={customers}
      models={availableModelOptions()}
      scenarios={loadScenarios()}
    />
  );
}
