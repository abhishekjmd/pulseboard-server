import { prisma } from "../prisma";

export const syncRepoPRsById = async (repoId: number) => {
  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "pulseboard-app",
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  let page = 1;
  const perPage = 100;
  let hasMore = true;
  let prsProcessedTotal = 0;
  let latestUpdatedAtAcrossSync = repo.lastPrSyncAt;

  console.log(`[PR SYNC] Starting for ${repo.owner}/${repo.name} (last sync: ${repo.lastPrSyncAt || "never"})`);

  while (hasMore) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
    
    console.log(`[PR SYNC] Fetching page ${page}...`);
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PR SYNC] GitHub API Error (Page ${page}): ${response.status} - ${errorText}`);
      throw new Error(`Failed to fetch PRs from GitHub: ${response.status}`);
    }

    const prs = await response.json();
    
    if (!Array.isArray(prs) || prs.length === 0) {
      console.log(`[PR SYNC] No more PRs found on page ${page}`);
      hasMore = false;
      break;
    }

    console.log(`[PR SYNC] Page ${page}: Received ${prs.length} PRs`);
    let prsOnPageProcessed = 0;
    let foundSyncedPR = false;

    for (const pr of prs) {
      const updatedAt = new Date(pr.updated_at);

      // Incremental sync logic
      if (repo.lastPrSyncAt && updatedAt <= repo.lastPrSyncAt) {
        foundSyncedPR = true;
        break; 
      }

      if (!latestUpdatedAtAcrossSync || updatedAt > latestUpdatedAtAcrossSync) {
        latestUpdatedAtAcrossSync = updatedAt;
      }

      let state = pr.state;
      if (pr.merged_at) {
        state = "merged";
      }

      // @ts-ignore - Handle BigInt if Prisma types haven't refreshed yet
      await prisma.pullRequest.upsert({
        where: { githubId: BigInt(pr.id) },
        update: {
          state,
          title: pr.title,
          updatedAt: updatedAt,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
        },
        create: {
          githubId: BigInt(pr.id),
          number: pr.number,
          title: pr.title,
          state,
          authorName: pr.user?.login || "unknown",
          createdAt: new Date(pr.created_at),
          updatedAt: updatedAt,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
          repositoryId: repo.id,
        },
      });
      
      prsOnPageProcessed++;
    }

    prsProcessedTotal += prsOnPageProcessed;
    console.log(`[PR SYNC] Page ${page}: Processed ${prsOnPageProcessed} new/updated PRs`);

    if (foundSyncedPR) {
      hasMore = false;
      break;
    }

    // Safety limit for initial sync
    if (!repo.lastPrSyncAt && page >= 10) {
      console.log(`[PR SYNC] Reached max bootstrap pages (10)`);
      hasMore = false;
      break;
    }

    page++;
  }

  // Always update lastPrSyncAt to the current time to mark the sync as completed
  // This satisfies the 15-minute caching requirement.
  await prisma.repository.update({
    where: { id: repo.id },
    data: { lastPrSyncAt: new Date() },
  });
  console.log(`[PR SYNC] Updated lastPrSyncAt for ${repo.name} to now`);

  console.log(`[PR SYNC] Completed for ${repo.name}. Total PRs processed: ${prsProcessedTotal}`);
  return prsProcessedTotal;
};
