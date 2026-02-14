/**
 * Guard: skip E2E tests if Docker is not available.
 */

import { isDockerAvailable } from "../../../sandbox/container.js";

export async function ensureDocker(): Promise<{
  skip: boolean;
  reason?: string;
}> {
  const available = await isDockerAvailable();
  if (!available) {
    return { skip: true, reason: "Docker not available" };
  }
  return { skip: false };
}
