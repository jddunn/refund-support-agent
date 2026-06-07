import pino from 'pino';

/**
 * Structured JSON logger. Each module takes a child with its own name so logs
 * can be filtered per subsystem:
 *
 *   const log = logger.child({ module: 'graph' });
 *   log.info({ runId }, 'run started');
 *
 * Logs are JSON lines on stdout. Pipe through `pino-pretty` for a readable view
 * during development.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
