import { describe, it, expect } from 'vitest';
import { resolveLogLevel, shouldSuppressLog, createDomainLogger } from '../../src/server/logger.js';
import { Writable } from 'node:stream';

describe('Log Level Resolver (Seam: Log Level Resolver)', () => {
  it('defaults to "info" when no flags or LOG_LEVEL are set', () => {
    const level = resolveLogLevel({ argv: [], env: {} });
    expect(level).toBe('info');
  });

  it('switches to "debug" when --verbose or --debug flag is present', () => {
    expect(resolveLogLevel({ argv: ['--verbose'], env: {} })).toBe('debug');
    expect(resolveLogLevel({ argv: ['--debug'], env: {} })).toBe('debug');
  });

  it('respects LOG_LEVEL environment variable and lowercases it', () => {
    expect(resolveLogLevel({ argv: [], env: { LOG_LEVEL: 'warn' } })).toBe('warn');
    expect(resolveLogLevel({ argv: [], env: { LOG_LEVEL: 'ERROR' } })).toBe('error');
  });

  it('prioritizes CLI flags over LOG_LEVEL environment variable', () => {
    expect(resolveLogLevel({ argv: ['--debug'], env: { LOG_LEVEL: 'warn' } })).toBe('debug');
  });
});

describe('Log Suppression Filter (Seam: Log Suppression)', () => {
  it('suppresses static asset paths and favicon', () => {
    expect(shouldSuppressLog('/dist/main.js')).toBe(true);
    expect(shouldSuppressLog('/dist/assets/index.css')).toBe(true);
    expect(shouldSuppressLog('/favicon.ico')).toBe(true);
  });

  it('does not suppress regular API and application routes', () => {
    expect(shouldSuppressLog('/')).toBe(false);
    expect(shouldSuppressLog('/api/workspace')).toBe(false);
    expect(shouldSuppressLog('/api/specs')).toBe(false);
  });
});

describe('Domain Child Logger Factory (Seam: Domain Child Logger Factory)', () => {
  it('creates a child logger tagged with component name from parent logger', () => {
    const messages: any[] = [];
    const mockParent = {
      child: (bindings: any) => ({
        info: (msg: any) => messages.push({ ...bindings, msg })
      })
    };

    const domainLogger = createDomainLogger('runner', mockParent);
    domainLogger.info('Test runner dispatched');

    expect(messages).toHaveLength(1);
    expect(messages[0].component).toBe('runner');
    expect(messages[0].msg).toBe('Test runner dispatched');
  });

  it('creates an autonomous child logger when no parent logger is provided', () => {
    const logs: any[] = [];
    const stream = new Writable({
      write(chunk, _encoding, cb) {
        logs.push(JSON.parse(chunk.toString()));
        cb();
      }
    });

    const autonomousLogger = createDomainLogger('acp', { stream, level: 'info' });
    autonomousLogger.info('Handshake initialized');

    expect(logs).toHaveLength(1);
    expect(logs[0].component).toBe('acp');
    expect(logs[0].msg).toBe('Handshake initialized');
  });
});
