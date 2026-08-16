-- CreateTable
CREATE TABLE "GitHubConnection" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubOAuthState" (
    "id" SERIAL NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_userId_key" ON "GitHubConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_githubUserId_key" ON "GitHubConnection"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOAuthState_stateHash_key" ON "GitHubOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "GitHubOAuthState_userId_idx" ON "GitHubOAuthState"("userId");

-- CreateIndex
CREATE INDEX "GitHubOAuthState_expiresAt_idx" ON "GitHubOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubOAuthState" ADD CONSTRAINT "GitHubOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;