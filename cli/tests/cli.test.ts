/**
 * CLI integration tests — command output, flags, exit codes.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(__dirname, '../src/index.ts');
const TSX = 'npx tsx';

function run(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX} ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout || '', exitCode: err.status || 1 };
  }
}

describe('glintbase --help', () => {
  it('prints command list', () => {
    const { stdout, exitCode } = run('--help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('scan');
    expect(stdout).toContain('init');
    expect(stdout).toContain('config');
    expect(stdout).toContain('report');
  });
});

describe('glintbase --version', () => {
  it('prints version', () => {
    const { stdout, exitCode } = run('--version');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('0.1.0');
  });
});

describe('glintbase scan --help', () => {
  it('prints scan flags', () => {
    const { stdout, exitCode } = run('scan --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--json');
    expect(stdout).toContain('--markdown');
    expect(stdout).toContain('--fail-under');
    expect(stdout).toContain('--profile');
    expect(stdout).toContain('--provider');
    expect(stdout).toContain('--save');
  });
});

describe('glintbase config list', () => {
  it('prints config without error', () => {
    const { stdout, exitCode } = run('config list');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Provider');
    expect(stdout).toContain('Profile');
  });
});

describe('glintbase scan (invalid URL)', () => {
  it('exits with error for invalid URL', () => {
    const { exitCode } = run('scan not-a-url --quiet');
    expect(exitCode).not.toBe(0);
  });
});
