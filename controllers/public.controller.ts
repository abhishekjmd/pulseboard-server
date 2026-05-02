import { Request, Response } from "express";
import { prisma } from "../prisma";
import { syncRepoCommitsById } from "../services/repo.service";
import { syncRepoPRsById } from "../services/pr-sync.service";

export const analyzePublicRepo = async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, message: "URL is required" });
    }

    // Parse URL: https://github.com/facebook/react
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid GitHub URL format" });
    }

    const owner = match[1];
    const name = match[2].replace(/\.git$/, "");

    // 1. Check if repo exists (globally unique owner/name)
    let repo = await prisma.repository.findUnique({
      where: {
        owner_name: {
          owner,
          name,
        },
      },
    });

    const CACHE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

    if (repo) {
      const now = new Date();
      const lastSync = repo.lastPrSyncAt ? new Date(repo.lastPrSyncAt) : null;
      const isRecentlySynced = lastSync && (now.getTime() - lastSync.getTime() < CACHE_THRESHOLD_MS);

      if (isRecentlySynced) {
        return res.status(200).json({
          success: true,
          repoId: repo.id,
          status: "ready",
        });
      }

      // If not recently synced, trigger background sync
      syncRepoPRsById(repo.id).catch(err => console.error("[PUBLIC ANALYZE] PR Sync Error:", err));
      syncRepoCommitsById(repo.id).catch(err => console.error("[PUBLIC ANALYZE] Commit Sync Error:", err));

      return res.status(200).json({
        success: true,
        repoId: repo.id,
        status: "processing",
      });
    }

    // 2. Create Repository if it doesn't exist
    let sandbox = await prisma.workspace.findFirst({
      where: { name: "Public Sandbox" },
    });

    if (!sandbox) {
      sandbox = await prisma.workspace.create({
        data: { name: "Public Sandbox" },
      });
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "pulseboard-app",
        },
      }
    );

    if (!githubResponse.ok) {
      return res.status(404).json({ success: false, message: "Repository not found on GitHub" });
    }

    const githubData = await githubResponse.json();

    repo = await prisma.repository.create({
      data: {
        name: githubData.name,
        owner: githubData.owner.login,
        githubId: String(githubData.id),
        workspaceId: sandbox.id,
        lastPrSyncAt: new Date(0), // Set to epoch so first sync always runs
      },
    });

    // 3. Trigger initial sync
    syncRepoPRsById(repo.id).catch(err => console.error("[PUBLIC ANALYZE] Initial PR Sync Error:", err));
    syncRepoCommitsById(repo.id).catch(err => console.error("[PUBLIC ANALYZE] Initial Commit Sync Error:", err));

    return res.status(201).json({
      success: true,
      repoId: repo.id,
      status: "processing",
    });

  } catch (error) {
    console.error("[analyzePublicRepo] Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
