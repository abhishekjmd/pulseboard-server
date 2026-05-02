import { prisma } from "../prisma";

export const syncRepoCommitsById = async (repoId: number) => {
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
  let totalSynced = 0;

  console.log(`[COMMIT SYNC] Starting for ${repo.owner}/${repo.name}`);

  while (hasMore) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?per_page=${perPage}&page=${page}`;
    const githubResponse = await fetch(url, { headers });

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error(`[COMMIT SYNC] Error (Page ${page}): ${githubResponse.status} - ${errorText}`);
      break;
    }

    const githubCommits = await githubResponse.json();
    if (!Array.isArray(githubCommits) || githubCommits.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`[COMMIT SYNC] Page ${page}: Received ${githubCommits.length} commits`);

    const mappedCommits = githubCommits
      .map((commit) => {
        const sha = commit?.sha;
        const message = commit?.commit?.message;
        const authorName = commit?.commit?.author?.name;
        const authorEmail = commit?.commit?.author?.email;
        const authorDate = commit?.commit?.author?.date;

        if (!sha || !message || !authorName || !authorEmail || !authorDate) {
          return null;
        }

        return {
          sha,
          message,
          authorName,
          authorEmail,
          date: new Date(authorDate),
          repositoryId: repo.id,
        };
      })
      .filter((commit): commit is NonNullable<typeof commit> => commit !== null);

    const result = await prisma.commit.createMany({
      data: mappedCommits,
      skipDuplicates: true,
    });

    totalSynced += result.count;
    
    // If we received fewer than perPage, we're done
    if (githubCommits.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }

    // Safety limit: only sync up to 10 pages (1000 commits) for now to avoid timeouts
    if (page > 10) break;
  }

  await prisma.repository.update({
    where: { id: repo.id },
    data: { lastPrSyncAt: new Date() }, // We reuse this for now, or could add lastCommitSyncAt
  });

  console.log(`[COMMIT SYNC] COMPLETED for ${repo.owner}/${repo.name}. Total new: ${totalSynced}`);
  return totalSynced;
};

export const getAllRepositories = async (take = 20) => {
  return prisma.repository.findMany({
    select: {
      id: true,
      name: true,
    },
    take,
  });
};
