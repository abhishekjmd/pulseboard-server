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
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  let page = 1;
  const perPage = 100;
  let hasMore = true;
  let prsProcessed = 0;
  let latestUpdatedAt = repo.lastPrSyncAt;

  console.log(`[PR SYNC] Starting for ${repo.owner}/${repo.name} (last sync: ${repo.lastPrSyncAt || "never"})`);

  while (hasMore) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch PRs from GitHub: ${response.status} - ${errorText}`);
    }

    const prs = await response.json();
    
    if (!Array.isArray(prs) || prs.length === 0) {
      hasMore = false;
      break;
    }

    const prsToUpsert = [];

    for (const pr of prs) {
      const updatedAt = new Date(pr.updated_at);

      // Incremental sync logic
      if (repo.lastPrSyncAt && updatedAt <= repo.lastPrSyncAt) {
        hasMore = false;
        break;
      }

      if (!latestUpdatedAt || updatedAt > latestUpdatedAt) {
        latestUpdatedAt = updatedAt;
      }

      let state = pr.state;
      if (pr.merged_at) {
        state = "merged";
      }

      prsToUpsert.push({
        githubId: pr.id,
        number: pr.number,
        title: pr.title,
        state,
        authorName: pr.user.login,
        createdAt: new Date(pr.created_at),
        updatedAt: updatedAt,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
        repositoryId: repo.id,
      });
    }

    if (prsToUpsert.length > 0) {
      await prisma.$transaction(
        prsToUpsert.map((prData) =>
          prisma.pullRequest.upsert({
            where: { githubId: prData.githubId },
            update: {
              state: prData.state,
              title: prData.title,
              updatedAt: prData.updatedAt,
              mergedAt: prData.mergedAt,
              closedAt: prData.closedAt,
            },
            create: prData,
          })
        )
      );
      prsProcessed += prsToUpsert.length;
    }

    // Stop early if we didn't process the full page (meaning we hit the break condition)
    if (prsToUpsert.length < prs.length) {
      hasMore = false;
      break;
    }

    // Safety limit for initial sync (prevent infinite loop / massive rate limit hit)
    // 10 pages * 100 = 1000 PRs max per sync run for initial bootstrap
    if (!repo.lastPrSyncAt && page >= 10) {
      console.log(`[PR SYNC] Reached max bootstrap pages (10) for ${repo.owner}/${repo.name}`);
      hasMore = false;
      break;
    }

    page++;
  }

  // Update last sync time if we successfully processed PRs or if it was null
  if (latestUpdatedAt && (!repo.lastPrSyncAt || latestUpdatedAt > repo.lastPrSyncAt)) {
    await prisma.repository.update({
      where: { id: repo.id },
      data: { lastPrSyncAt: latestUpdatedAt },
    });
  }

  return prsProcessed;
};
