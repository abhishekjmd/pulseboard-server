import crypto from "crypto";
import { prisma } from "../prisma";
import { encryptToken } from "../utils/tokenCrypto";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const STATE_TTL_MINUTES = 10;
const GITHUB_OAUTH_SCOPE = "read:user repo";

const hashState = (state: string) => crypto.createHash("sha256").update(state).digest("hex");

const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

export const createGitHubOAuthUrl = async (userId: number) => {
  const state = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000);

  await prisma.gitHubOAuthState.create({
    data: {
      stateHash: hashState(state),
      userId,
      expiresAt,
    },
  });

  const params = new URLSearchParams({
    client_id: getRequiredEnv("GITHUB_CLIENT_ID"),
    redirect_uri: getRequiredEnv("GITHUB_OAUTH_REDIRECT_URI"),
    scope: GITHUB_OAUTH_SCOPE,
    state,
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
};

export const validateGitHubOAuthState = async (state: string) => {
  const stateHash = hashState(state);
  const oauthState = await prisma.gitHubOAuthState.findUnique({
    where: { stateHash },
  });

  if (!oauthState || oauthState.usedAt || oauthState.expiresAt <= new Date()) {
    return null;
  }

  await prisma.gitHubOAuthState.update({
    where: { id: oauthState.id },
    data: { usedAt: new Date() },
  });

  return oauthState.userId;
};

type GitHubTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export const exchangeGitHubCodeForToken = async (code: string) => {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "pulseboard-app",
    },
    body: JSON.stringify({
      client_id: getRequiredEnv("GITHUB_CLIENT_ID"),
      client_secret: getRequiredEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: getRequiredEnv("GITHUB_OAUTH_REDIRECT_URI"),
    }),
  });

  if (!response.ok) {
    throw new Error("GitHub token exchange failed");
  }

  const data = (await response.json()) as GitHubTokenResponse;
  if (!data.access_token || data.error) {
    throw new Error("GitHub token exchange failed");
  }

  return {
    accessToken: data.access_token,
    scopes: data.scope || null,
  };
};

type GitHubUserResponse = {
  id: number;
  login: string;
};

export const fetchGitHubUser = async (accessToken: string) => {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "pulseboard-app",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error("GitHub user fetch failed");
  }

  const data = (await response.json()) as GitHubUserResponse;
  if (!data.id || !data.login) {
    throw new Error("GitHub user fetch failed");
  }

  return {
    githubUserId: String(data.id),
    githubLogin: data.login,
  };
};

export const saveGitHubConnection = async (params: {
  userId: number;
  githubUserId: string;
  githubLogin: string;
  accessToken: string;
  scopes: string | null;
}) => {
  const existingConnectionForGitHubUser = await prisma.gitHubConnection.findUnique({
    where: { githubUserId: params.githubUserId },
    select: { userId: true },
  });

  if (existingConnectionForGitHubUser && existingConnectionForGitHubUser.userId !== params.userId) {
    throw new Error("GitHub account is already connected to another PulseBoard user");
  }

  return prisma.gitHubConnection.upsert({
    where: { userId: params.userId },
    update: {
      githubUserId: params.githubUserId,
      githubLogin: params.githubLogin,
      encryptedAccessToken: encryptToken(params.accessToken),
      scopes: params.scopes,
    },
    create: {
      userId: params.userId,
      githubUserId: params.githubUserId,
      githubLogin: params.githubLogin,
      encryptedAccessToken: encryptToken(params.accessToken),
      scopes: params.scopes,
    },
    select: {
      id: true,
      githubUserId: true,
      githubLogin: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export const getSafeGitHubConnection = async (userId: number) => {
  const connection = await prisma.gitHubConnection.findUnique({
    where: { userId },
    select: {
      githubUserId: true,
      githubLogin: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    githubUser: {
      id: connection.githubUserId,
      login: connection.githubLogin,
    },
    connectedAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
};

export const getFrontendRedirectUrl = (status: "connected" | "error") => {
  const frontendUrl = getRequiredEnv("FRONTEND_URL").replace(/\/$/, "");
  return `${frontendUrl}/dashboard?github=${status}`;
};