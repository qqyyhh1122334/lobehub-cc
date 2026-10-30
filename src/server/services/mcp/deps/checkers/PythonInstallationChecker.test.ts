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

import { PythonInstallationChecker } from './PythonInstallationChecker';

describe('PythonInstallationChecker (offline)', () => {
  const checker = new PythonInstallationChecker();
  beforeEach(() => vi.resetAllMocks());

  it.each(['numpy', 'scikit-learn', 'a.b_c'])(
    'reads local distribution metadata without importing %s',
    async (packageName) => {
      mockExecFile.mockResolvedValue({ stdout: 'installed\n' });
      expect(await checker.checkPackageInstalled({ packageName })).toEqual({
        installed: true,
        packageName,
      });
      const [command, args, options] = mockExecFile.mock.calls[0];
      expect(command).toBe('python');
      expect(args.slice(0, 3)).toEqual(['-I', '-S', '-c']);
      expect(args[3]).toContain('importlib.metadata.distributions');
      expect(args[3]).not.toContain(packageName);
      expect(args[4]).toBe(packageName);
      expect(options.timeout).toBe(10_000);
    },
  );

  it('does not execute or install the package when metadata is missing', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'missing\n' });
    expect((await checker.checkPackageInstalled({ packageName: 'missing' })).installed).toBe(false);
    expect(mockExecFile).toHaveBeenCalledOnce();
  });

  it('supports a locally installed Python version', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'installed' });
    expect(
      (await checker.checkPackageInstalled({ packageName: 'numpy', pythonCommand: 'python3.11' }))
        .installed,
    ).toBe(true);
    expect(mockExecFile.mock.calls[0][0]).toBe('python3.11');
  });

  it.each([
    '',
    'numpy;curl example.com',
    'x\nimport os',
    '--index-url',
    'https://example.com/a.whl',
  ])('rejects unsafe package specifier: %s', async (packageName) => {
    expect((await checker.checkPackageInstalled({ packageName })).installed).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it.each(['python -c evil', '/tmp/evil', 'uvx', 'python3;curl example.com'])(
    'rejects arbitrary executable: %s',
    async (pythonCommand) => {
      expect(
        (await checker.checkPackageInstalled({ packageName: 'numpy', pythonCommand })).installed,
      ).toBe(false);
      expect(mockExecFile).not.toHaveBeenCalled();
    },
  );

  it('fails closed when Python is unavailable', async () => {
    mockExecFile.mockRejectedValue(new Error('ENOENT'));
    expect(await checker.checkPackageInstalled({ packageName: 'numpy' })).toEqual({
      error: 'ENOENT',
      installed: false,
      packageName: 'numpy',
    });
    expect(mockExecFile).toHaveBeenCalledOnce();
  });
});
