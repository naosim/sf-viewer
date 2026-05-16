import * as path from "path";

export function resolveUserDataDir(userDataDir?: string | null): string {
  const baseDir = process.env.SF_VIEWER_ORIGINAL_CWD || process.cwd();

  if (userDataDir) {
    return path.isAbsolute(userDataDir)
      ? userDataDir
      : path.resolve(baseDir, userDataDir);
  }
  const envPath = process.env.SF_USER_DATA_DIR;
  if (envPath) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(baseDir, envPath);
  }
  return path.join(__dirname, "..", "userData");
}

export function resolveUserDataSubDir(subDir: string): string {
  return path.join(resolveUserDataDir(), subDir);
}
