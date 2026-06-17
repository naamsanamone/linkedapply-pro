/* ============================================================
   LinkedApply Pro — Structured Logger
   Consistent logging across all extension contexts
   ============================================================ */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#94a3b8',
  info: '#6366f1',
  warn: '#f59e0b',
  error: '#ef4444',
};

const LOG_PREFIX = '🚀 LinkedApply';

function formatTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function log(level: LogLevel, context: string, message: string, data?: any): void {
  const timestamp = formatTimestamp();
  const color = LOG_COLORS[level];
  const prefix = `%c${LOG_PREFIX}%c [${timestamp}] [${context}]`;

  const args: any[] = [
    prefix,
    `color: ${color}; font-weight: bold;`,
    `color: ${color};`,
    message,
  ];

  if (data !== undefined) {
    args.push(data);
  }

  switch (level) {
    case 'debug':
      console.debug(...args);
      break;
    case 'info':
      console.info(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
}

/**
 * Creates a scoped logger for a specific module/context
 */
export function createLogger(context: string) {
  return {
    debug: (message: string, data?: any) => log('debug', context, message, data),
    info: (message: string, data?: any) => log('info', context, message, data),
    warn: (message: string, data?: any) => log('warn', context, message, data),
    error: (message: string, data?: any) => log('error', context, message, data),
  };
}

// Default logger
export const logger = createLogger('Core');
