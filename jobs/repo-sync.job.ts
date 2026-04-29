import cron from "node-cron";
import { getAllRepositories, syncRepoCommitsById } from "../services/repo.service";

let isRunning = false;

const syncSingleRepoWithRetry = async (repoId: number, maxAttempts = 2) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await syncRepoCommitsById(repoId);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.warn(`[SYNC] Retry ${attempt}/${maxAttempts - 1} for repo ${repoId}`);
      }
    }
  }
  throw lastError;
};

export const runRepoSyncBatch = async () => {
  if (isRunning) {
    console.log("[SYNC] Skipping sync, previous run still in progress");
    return;
  }

  isRunning = true;
  try {
    console.log("[SYNC] Starting repository sync...");
    const repositories = await getAllRepositories(20);
    for (const repo of repositories) {
      try {
        console.log(`[SYNC] Repo: ${repo.name} (${repo.id})`);
        const count = await syncSingleRepoWithRetry(repo.id, 2);
        console.log(`[SYNC] Synced ${count} commits for ${repo.name} (${repo.id})`);
      } catch (error) {
        console.error(`[SYNC] Failed repo ${repo.name} (${repo.id})`, error);
      }
    }
  } catch (error) {
    console.error("[SYNC] Batch sync failed", error);
  } finally {
    isRunning = false;
  }
};

export const startRepoSyncJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    await runRepoSyncBatch();
  });
};
