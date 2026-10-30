import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { InstallationChecker, PackageInstallCheckResult } from '../types';

const execFilePromise = promisify(execFile);
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

/** Inspect installed metadata only. Never download or execute an MCP package. */
export class NpmInstallationChecker implements InstallationChecker {
  async checkPackageInstalled(details: {
    packageName?: string;
  }): Promise<PackageInstallCheckResult> {
    const packageName = details.packageName || '';
    if (!PACKAGE_NAME.test(packageName)) {
      return {
        error: packageName ? 'Invalid npm package name' : 'Package name not provided',
        installed: false,
        packageName,
      };
    }

    try {
      const { stdout } = await execFilePromise(
        'npm',
        [
          'ls',
          '--global',
          '--json',
          '--depth=0',
          '--offline',
          '--ignore-scripts',
          '--no-update-notifier',
          '--no-audit',
          '--no-fund',
        ],
        { maxBuffer: 1024 * 1024, timeout: 10_000 },
      );
      const result = JSON.parse(stdout) as {
        dependencies?: Record<string, { missing?: boolean; version?: string }>;
      };
      const dependency = Object.hasOwn(result.dependencies || {}, packageName)
        ? result.dependencies?.[packageName]
        : undefined;
      return { installed: !!dependency?.version && !dependency.missing, packageName };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        installed: false,
        packageName,
      };
    }
  }
}
