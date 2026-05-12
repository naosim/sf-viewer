import * as path from "path";

export function resolveUserDataDir(userDataDir?: string | null): string {
  if (userDataDir) {
    return path.isAbsolute(userDataDir)
      ? userDataDir
      : path.resolve(process.cwd(), userDataDir);
  }
  const envPath = process.env.SF_USER_DATA_DIR;
  if (envPath) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }
  return path.join(__dirname, "..", "userData");
}

export function resolveUserDataSubDir(subDir: string): string {
  return path.join(resolveUserDataDir(), subDir);
}
