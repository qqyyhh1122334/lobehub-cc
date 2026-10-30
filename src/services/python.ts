import { type CodeInterpreterResponse } from '@lobechat/types';
class PythonService {
  async runPython(
    _code: string,
    _packages: string[],
    _files: File[],
  ): Promise<CodeInterpreterResponse> {
    throw new Error(
      'Browser Python execution is disabled in the intranet edition: the Pyodide and package distribution requires an audited offline bundle.',
    );
  }
}
export const pythonService = new PythonService();
