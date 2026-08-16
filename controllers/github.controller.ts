import { Request, Response, NextFunction } from "express";
import {
  createGitHubOAuthUrl,
  exchangeGitHubCodeForToken,
  fetchGitHubUser,
  getFrontendRedirectUrl,
  getSafeGitHubConnection,
  saveGitHubConnection,
  validateGitHubOAuthState,
} from "../services/github-oauth.service";
import { prisma } from "../prisma";
import { decryptToken } from "../utils/tokenCrypto";

type RepoItem = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  default_branch?: string;
  html_url: string;
};

export const listGitHubRepositories = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const connection = await prisma.gitHubConnection.findUnique({ where: { userId } });
    if (!connection) return res.status(403).json({ success: false, message: "Connect GitHub first" });

    let token: string;
    try {
      token = decryptToken(connection.encryptedAccessToken);
    } catch (err) {
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 30));

    const params = new URLSearchParams({ per_page: String(perPage), page: String(page), affiliation: "owner,collaborator,organization_member" });
    const url = `https://api.github.com/user/repos?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "pulseboard-app",
      },
    });

    if (response.status === 401) {
      return res.status(401).json({ success: false, message: "GitHub authorization invalid, please reconnect" });
    }
    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: "GitHub API error" });
    }

    const data = (await response.json()) as RepoItem[];
    const repositories = data.map((r) => ({
      githubId: String(r.id),
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch || "main",
      htmlUrl: r.html_url,
    }));

    const hasNextPage = data.length === perPage;

    return res.status(200).json({ success: true, repositories, page, perPage, hasNextPage });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const startGitHubOAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const url = await createGitHubOAuthUrl(userId);
    return res.status(200).json({ success: true, url });
  } catch (error) {
    next(error);
  }
};

export const handleGitHubOAuthCallback = async (req: Request, res: Response) => {
  const redirectWithError = () => res.redirect(getFrontendRedirectUrl("error"));

  try {
    const { code, state, error } = req.query;
    if (error) {
      return redirectWithError();
    }

    if (typeof code !== "string" || typeof state !== "string") {
      return redirectWithError();
    }

    const userId = await validateGitHubOAuthState(state);
    if (!userId) {
      return redirectWithError();
    }

    const token = await exchangeGitHubCodeForToken(code);
    const githubUser = await fetchGitHubUser(token.accessToken);

    await saveGitHubConnection({
      userId,
      githubUserId: githubUser.githubUserId,
      githubLogin: githubUser.githubLogin,
      accessToken: token.accessToken,
      scopes: token.scopes,
    });

    return res.redirect(getFrontendRedirectUrl("connected"));
  } catch (error) {
    console.error("[GITHUB OAUTH] Callback failed");
    return redirectWithError();
  }
};

export const getGitHubConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const connection = await getSafeGitHubConnection(userId);
    return res.status(200).json({ success: true, ...connection });
  } catch (error) {
    next(error);
  }
};