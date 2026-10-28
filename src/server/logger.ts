import pino from 'pino';

export interface LogLevelOptions {
  argv?: string[];
  env?: Record<string, string | undefined>;
}

export function resolveLogLevel(options: LogLevelOptions = {}): string {
  const argv = options.argv || [];
  if (argv.includes('--verbose') || argv.includes('--debug')) {
    return 'debug';
  }
  const envLevel = options.env?.LOG_LEVEL?.trim().toLowerCase();
  if (envLevel) {
    return envLevel;
  }
  return 'info';
}

export function shouldSuppressLog(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/dist/') || url === '/dist') return true;
  if (url === '/favicon.ico' || url.startsWith('/favicon.')) return true;
  if (url.includes('ping') && !url.startsWith('/api/')) return true;
  return false;
}

export function getFastifyLoggerConfig(options?: {
  level?: string;
  logger?: any;
  pretty?: boolean;
}) {
  if (options?.logger !== undefined) {
    return options.logger;
  }
  const level = options?.level || 'info';
  if (options?.pretty !== false) {
    return {
      level,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    };
  }
  return { level };
}

export function createDomainLogger(
  name: string,
  parentOrOptions?: any
) {
  if (parentOrOptions && typeof parentOrOptions.child === 'function') {
    return parentOrOptions.child({ component: name });
  }

  const baseOptions = {
    level: parentOrOptions?.level || resolveLogLevel({ argv: process.argv.slice(2), env: process.env })
  };

  const stream = parentOrOptions?.stream;
  const loggerInstance = stream
    ? pino(baseOptions, stream)
    : pino({
        ...baseOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
          }
        }
      });

  return loggerInstance.child({ component: name });
}
