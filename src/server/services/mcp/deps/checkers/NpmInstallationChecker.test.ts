import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));
vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    default: { ...actual, promisify: () => mockExecFile },
    promisify: () => mockExecFile,
  };
});

import { NpmInstallationChecker } from './NpmInstallationChecker';

describe('NpmInstallationChecker (offline)', () => {
  const checker = new NpmInstallationChecker();
  beforeEach(() => vi.resetAllMocks());

  it.each(['typescript', '@scope/server', 'package.name'])(
    'detects exact installed metadata: %s',
    async (packageName) => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify({ dependencies: { [packageName]: { version: '1.0.0' } } }),
      });
      expect(await checker.checkPackageInstalled({ packageName })).toEqual({
        installed: true,
        packageName,
      });
      expect(mockExecFile).toHaveBeenCalledOnce();
      expect(mockExecFile).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['ls', '--offline', '--ignore-scripts', '--no-update-notifier']),
        expect.objectContaining({ timeout: 10_000 }),
      );
    },
  );

  it('does not confuse a similarly named package or inherited object key with an installation', async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({ dependencies: { 'react-native': { version: '1.0.0' } } }),
    });
    expect((await checker.checkPackageInstalled({ packageName: 'react' })).installed).toBe(false);
    expect((await checker.checkPackageInstalled({ packageName: 'constructor' })).installed).toBe(
      false,
    );
  });

  it('never falls back to npx when a package is missing', async () => {
    mockExecFile.mockResolvedValue({ stdout: '{}' });
    expect(await checker.checkPackageInstalled({ packageName: 'missing-package' })).toEqual({
      installed: false,
      packageName: 'missing-package',
    });
    expect(mockExecFile).toHaveBeenCalledOnce();
    expect(mockExecFile.mock.calls[0][0]).toBe('npm');
  });

  it('does not report missing npm metadata as installed', async () => {
    mockExecFile.mockResolvedValue({
      stdout: '{"dependencies":{"missing":{"missing":true,"version":"1.0.0"}}}',
    });
    expect((await checker.checkPackageInstalled({ packageName: 'missing' })).installed).toBe(false);
  });

  it.each([
    '',
    'x; curl example.com',
    '--registry=https://example.com',
    'https://example.com/a.tgz',
    'pkg@latest',
    '@scope/../../x',
  ])('rejects untrusted package specifier without a subprocess: %s', async (packageName) => {
    expect((await checker.checkPackageInstalled({ packageName })).installed).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('fails closed when npm is unavailable', async () => {
    mockExecFile.mockRejectedValue(new Error('ENOENT'));
    expect(await checker.checkPackageInstalled({ packageName: 'missing' })).toEqual({
      error: 'ENOENT',
      installed: false,
      packageName: 'missing',
    });
    expect(mockExecFile).toHaveBeenCalledOnce();
  });

  it('fails closed for malformed metadata', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'not json' });
    expect((await checker.checkPackageInstalled({ packageName: 'missing' })).installed).toBe(false);
    expect(mockExecFile).toHaveBeenCalledOnce();
  });
});
