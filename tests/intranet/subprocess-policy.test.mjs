/** Exercise the actual dependency checkers with Node builtins only, without installing the monorepo. */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import { promisify } from 'node:util';

await test('dependency inspection cannot download or execute requested packages', async (t) => {
  const original = childProcess.execFile;
  const calls = [];
  let result;
  const stub = () => {
    throw new Error('Expected promisified execFile');
  };
  stub[promisify.custom] = async (...args) => {
    calls.push(args);
    if (result instanceof Error) throw result;
    return result;
  };
  childProcess.execFile = stub;
  syncBuiltinESMExports();
  try {
    const { NpmInstallationChecker } =
      await import('../../src/server/services/mcp/deps/checkers/NpmInstallationChecker.ts');
    const { PythonInstallationChecker } =
      await import('../../src/server/services/mcp/deps/checkers/PythonInstallationChecker.ts');
    const npm = new NpmInstallationChecker();
    const python = new PythonInstallationChecker();
    await t.test('npm only lists local metadata and matches exact package names', async () => {
      result = {
        stdout:
          '{"dependencies":{"@internal/mcp":{"version":"1.0.0"},"react-native":{"version":"1.0.0"}}}',
      };
      assert.equal(
        (await npm.checkPackageInstalled({ packageName: '@internal/mcp' })).installed,
        true,
      );
      assert.equal((await npm.checkPackageInstalled({ packageName: 'react' })).installed, false);
      assert.equal(
        (await npm.checkPackageInstalled({ packageName: 'constructor' })).installed,
        false,
      );
      for (const [command, args, options] of calls) {
        assert.equal(command, 'npm');
        for (const flag of [
          'ls',
          '--global',
          '--offline',
          '--ignore-scripts',
          '--no-update-notifier',
          '--json',
        ])
          assert.ok(args.includes(flag), flag);
        assert.equal(options.timeout, 10_000);
      }
      calls.length = 0;
    });
    await t.test('missing npm package never triggers npx or installation', async () => {
      result = { stdout: '{}' };
      assert.deepEqual(await npm.checkPackageInstalled({ packageName: 'missing' }), {
        installed: false,
        packageName: 'missing',
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], 'npm');
      calls.length = 0;
    });
    await t.test('untrusted npm specs never reach a subprocess', async () => {
      for (const packageName of [
        '',
        'x; curl example.com',
        '--registry=example.com',
        'https://example.com/a.tgz',
        'pkg@latest',
      ]) {
        assert.equal((await npm.checkPackageInstalled({ packageName })).installed, false);
      }
      assert.equal(calls.length, 0);
    });
    await t.test('Python reads distribution metadata in isolated no-site mode', async () => {
      result = { stdout: 'installed\n' };
      assert.equal(
        (
          await python.checkPackageInstalled({
            packageName: 'scikit-learn',
            pythonCommand: 'python3.11',
          })
        ).installed,
        true,
      );
      const [command, args, options] = calls[0];
      assert.equal(command, 'python3.11');
      assert.deepEqual(args.slice(0, 3), ['-I', '-S', '-c']);
      assert.match(args[3], /importlib\.metadata\.distributions/);
      assert.ok(!args[3].includes('scikit-learn'));
      assert.equal(args[4], 'scikit-learn');
      assert.equal(options.timeout, 10_000);
      calls.length = 0;
    });
    await t.test('missing Python package never triggers pip or imports the package', async () => {
      result = { stdout: 'missing\n' };
      assert.equal(
        (await python.checkPackageInstalled({ packageName: 'missing' })).installed,
        false,
      );
      assert.equal(calls.length, 1);
      calls.length = 0;
    });
    await t.test('Python command and package injection are rejected', async () => {
      for (const pythonCommand of [
        'python;curl example.com',
        '/tmp/evil',
        'uvx',
        'python -c evil',
      ]) {
        assert.equal(
          (await python.checkPackageInstalled({ packageName: 'numpy', pythonCommand })).installed,
          false,
        );
      }
      for (const packageName of [
        '',
        'x;curl example.com',
        '--index-url',
        'https://example.com/a.whl',
      ]) {
        assert.equal((await python.checkPackageInstalled({ packageName })).installed, false);
      }
      assert.equal(calls.length, 0);
    });
    await t.test('unavailable tools fail closed with no fallback', async () => {
      result = new Error('ENOENT');
      assert.equal((await npm.checkPackageInstalled({ packageName: 'missing' })).error, 'ENOENT');
      assert.equal(
        (await python.checkPackageInstalled({ packageName: 'missing' })).error,
        'ENOENT',
      );
      assert.equal(calls.length, 2);
    });
  } finally {
    childProcess.execFile = original;
    syncBuiltinESMExports();
  }
});
