import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { profileSchema, type Profile } from "./schema.js";

const PROFILE_DIR = ".geofrey";
const PROFILE_FILE = "profile.json";

let cached: Profile | null = null;
let baseDir = process.cwd();

export function setProfileBaseDir(dir: string): void {
  baseDir = dir;
  cached = null;
}

function profilePath(): string {
  return join(baseDir, PROFILE_DIR, PROFILE_FILE);
}

export async function loadProfile(): Promise<Profile | null> {
  if (cached) return cached;
  try {
    const raw = await readFile(profilePath(), "utf-8");
    const parsed = profileSchema.parse(JSON.parse(raw));
    cached = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  const validated = profileSchema.parse(profile);
  const dir = join(baseDir, PROFILE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(profilePath(), JSON.stringify(validated, null, 2) + "\n", "utf-8");
  cached = validated;
}

export function getCachedProfile(): Profile | null {
  return cached;
}
