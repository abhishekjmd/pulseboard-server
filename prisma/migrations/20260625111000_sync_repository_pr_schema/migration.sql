-- Bring the database in line with the current Prisma schema.
ALTER TABLE "Repository"
ADD COLUMN IF NOT EXISTS "lastPrSyncAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "Repository_owner_name_workspaceId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Repository_owner_name_key" ON "Repository"("owner", "name");

CREATE TABLE IF NOT EXISTS "PullRequest" (
    "id" SERIAL NOT NULL,
    "githubId" BIGINT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "repositoryId" INTEGER NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PullRequest_githubId_key" ON "PullRequest"("githubId");
CREATE INDEX IF NOT EXISTS "PullRequest_repositoryId_state_idx" ON "PullRequest"("repositoryId", "state");
CREATE INDEX IF NOT EXISTS "PullRequest_repositoryId_authorName_idx" ON "PullRequest"("repositoryId", "authorName");
CREATE UNIQUE INDEX IF NOT EXISTS "PullRequest_repositoryId_number_key" ON "PullRequest"("repositoryId", "number");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'PullRequest_repositoryId_fkey'
    ) THEN
        ALTER TABLE "PullRequest"
        ADD CONSTRAINT "PullRequest_repositoryId_fkey"
        FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
