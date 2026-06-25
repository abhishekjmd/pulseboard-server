import { Request, Response } from "express";
import { isDatabaseConnectionError, prisma } from "../prisma";
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

    const urlString = String(url).trim();
    let owner: string;
    let name: string;

    try {
      const parsedUrl = new URL(urlString);
      if (!["github.com", "www.github.com"].includes(parsedUrl.hostname.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Invalid GitHub URL format" });
      }

      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      if (pathParts.length < 2) {
        return res.status(400).json({ success: false, message: "Invalid GitHub URL format" });
      }

      owner = pathParts[0];
      name = pathParts[1].replace(/\.git$/, "");
    } catch {
      const fallbackMatch = urlString.match(/github\.com[:/]+([^/]+)\/([^/]+)(?:\.git)?/);
      if (!fallbackMatch) {
        return res.status(400).json({ success: false, message: "Invalid GitHub URL format" });
      }

      owner = fallbackMatch[1];
      name = fallbackMatch[2].replace(/\.git$/, "");
    }

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

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "pulseboard-app",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    let githubResponse = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers,
    });

    if (githubResponse.status === 401 && headers.Authorization) {
      console.warn(`[PUBLIC ANALYZE] GitHub GITHUB_TOKEN authentication failed (401) for ${owner}/${name}. Retrying without token...`);
      delete headers.Authorization;
      githubResponse = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
        headers,
      });
    }

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error(`[PUBLIC ANALYZE] GitHub repo check failed for ${owner}/${name}: ${githubResponse.status} ${errorText}`);

      if (githubResponse.status === 404) {
        return res.status(404).json({ success: false, message: "Repository not found on GitHub" });
      }

      if (githubResponse.status === 401) {
        return res.status(502).json({ success: false, message: "GitHub authentication failed. Check GITHUB_TOKEN." });
      }

      if (githubResponse.status === 403) {
        return res.status(502).json({ success: false, message: "GitHub API access denied or rate limited. Try again later." });
      }

      return res.status(502).json({ success: false, message: "Unable to verify repository on GitHub." });
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

    if (isDatabaseConnectionError(error)) {
      return res.status(503).json({
        success: false,
        message: "Database connection unavailable. Please check DATABASE_URL and database availability.",
      });
    }

    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
