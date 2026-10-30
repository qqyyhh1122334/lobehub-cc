import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { InstallationChecker, PackageInstallCheckResult } from '../types';

const execFilePromise = promisify(execFile);
const PACKAGE_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const PYTHON_COMMAND = /^python(?:3(?:\.\d+)?)?$/;

// -I -S disables user paths, sitecustomize and executable .pth startup hooks.
// Inspect distribution metadata without importing package code or invoking pip.
const CHECK_DISTRIBUTION = [
  'import importlib.metadata, re, sys, sysconfig',
  'normalize = lambda name: re.sub(r"[-_.]+", "-", name).lower()',
  'paths = sysconfig.get_paths()',
  'distributions = importlib.metadata.distributions(path=[paths["purelib"], paths["platlib"]])',
  'print("installed" if any(normalize(d.metadata.get("Name", "")) == normalize(sys.argv[1]) for d in distributions) else "missing")',
].join('\n');

export class PythonInstallationChecker implements InstallationChecker {
  async checkPackageInstalled(details: {
    packageName?: string;
    pythonCommand?: string;
  }): Promise<PackageInstallCheckResult> {
    const packageName = details.packageName || '';
    const pythonCommand = details.pythonCommand || 'python';

    if (!PACKAGE_NAME.test(packageName) || !PYTHON_COMMAND.test(pythonCommand)) {
      return {
        error: !packageName ? 'Package name not provided' : 'Invalid Python package or command',
        installed: false,
        packageName,
      };
    }

    try {
      const { stdout } = await execFilePromise(
        pythonCommand,
        ['-I', '-S', '-c', CHECK_DISTRIBUTION, packageName],
        { maxBuffer: 1024 * 1024, timeout: 10_000 },
      );
      return { installed: stdout.trim() === 'installed', packageName };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        installed: false,
        packageName,
      };
    }
  }
}
