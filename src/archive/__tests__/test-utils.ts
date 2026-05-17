/**
 * Thin async wrappers over `node:fs/promises` for test setup/teardown.
 * Tests exercise the `FileSystem` service for the code under test; these
 * helpers only set up and read back fixtures, so staying on the raw node
 * API keeps the test harness out of the Effect layer.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export const makeTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-bench-archive-"));
  return dir;
};

export const removeDir = async (dir: string): Promise<void> => {
  await fs.rm(dir, { recursive: true, force: true });
};

export const readFile = async (filePath: string): Promise<string> => {
  return fs.readFile(filePath, "utf8");
};

export const writeFile = async (filePath: string, content: string): Promise<void> => {
  await fs.writeFile(filePath, content, "utf8");
};
