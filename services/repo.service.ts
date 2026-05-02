import { prisma } from "../prisma";

export const syncRepoCommitsById = async (repoId: number) => {
  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  const githubResponse = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?per_page=50`,
  );

  if (!githubResponse.ok) {
    throw new Error("Failed to fetch commits from GitHub");
  }

  const githubCommits = await githubResponse.json();
  if (!Array.isArray(githubCommits)) {
    throw new Error("Invalid commit payload from GitHub");
  }

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

  await prisma.repository.update({
    where: { id: repo.id },
    data: { lastPrSyncAt: new Date() },
  });

  return result.count;
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
