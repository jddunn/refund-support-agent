import { NextResponse } from 'next/server';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const runtime = 'nodejs';

/**
 * Return the adversarial case set, and the most recent run results when the
 * red-team suite has been run (it writes dated reports under reports/redteam/).
 */
export async function GET() {
  let cases: unknown[] = [];
  try {
    const casesPath = join(process.cwd(), 'tests', 'adversarial', 'cases.json');
    const parsed = JSON.parse(readFileSync(casesPath, 'utf8')) as { cases?: unknown[] };
    cases = parsed.cases ?? [];
  } catch {
    return NextResponse.json({ error: 'Failed to load adversarial cases' }, { status: 500 });
  }

  let results: unknown = null;
  const reportsDir = join(process.cwd(), 'reports', 'redteam');
  if (existsSync(reportsDir)) {
    const files = readdirSync(reportsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    const latest = files.at(-1);
    if (latest) {
      try {
        results = JSON.parse(readFileSync(join(reportsDir, latest), 'utf8'));
      } catch {
        results = null; // treat a malformed report as unavailable
      }
    }
  }

  return NextResponse.json({ cases, results });
}
