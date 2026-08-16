import cron from "node-cron";
import { getAllRepositories, syncRepoCommitsById } from "../services/repo.service";
import { syncRepoPRsById } from "../services/pr-sync.service";

import { prisma } from "../prisma";
import { decryptToken } from "../utils/tokenCrypto";

let isRunning = false;

export const resolveAccessTokenForRepo = async (repoId: number): Promise<string | undefined> => {
  try {
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      select: {
        workspace: {
          select: {
            memberships: {
              select: {
                role: true,
                user: {
                  select: {
                    githubConnection: {
                      select: {
                        encryptedAccessToken: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                role: "asc", // "admin" precedes "member"
              },
            },
          },
        },
      },
    });

    if (!repo?.workspace?.memberships) {
      return undefined;
    }

    const membershipsWithGitHub = repo.workspace.memberships.filter(
      (m) => Boolean(m.user?.githubConnection?.encryptedAccessToken)
    );

    if (membershipsWithGitHub.length === 0) {
      return undefined;
    }

    const preferredMembership =
      membershipsWithGitHub.find((m) => m.role === "admin") ||
      membershipsWithGitHub[0];

    const encryptedToken = preferredMembership.user.githubConnection!.encryptedAccessToken;
    return decryptToken(encryptedToken);
  } catch (err) {
    console.warn(`[SYNC] Could not resolve/decrypt GitHub token for repo ${repoId}:`, (err as Error).message);
    return undefined;
  }
};

const syncSingleRepoWithRetry = async (repoId: number, maxAttempts = 2) => {
  const accessToken = await resolveAccessTokenForRepo(repoId);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const commitCount = await syncRepoCommitsById(repoId, accessToken);
      const prCount = await syncRepoPRsById(repoId, accessToken);
      return { commitCount, prCount };
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
        const { commitCount, prCount } = await syncSingleRepoWithRetry(repo.id, 2);
        console.log(`[SYNC] Synced ${commitCount} commits, ${prCount} PRs for ${repo.name} (${repo.id})`);
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
