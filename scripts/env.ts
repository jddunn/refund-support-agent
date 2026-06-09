import { loadEnvConfig } from '@next/env';

/** Load .env for standalone tsx scripts; Next already does this for the app. */
loadEnvConfig(process.cwd());
