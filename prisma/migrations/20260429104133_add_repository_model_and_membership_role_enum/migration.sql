/*
  Warnings:

  - Changed the type of `role` on the `Membership` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('admin', 'member');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "role_new" "MembershipRole";
UPDATE "Membership"
SET "role_new" = CASE
  WHEN LOWER("role") = 'admin' THEN 'admin'::"MembershipRole"
  ELSE 'member'::"MembershipRole"
END;
ALTER TABLE "Membership" DROP COLUMN "role";
ALTER TABLE "Membership" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "Membership" ALTER COLUMN "role" SET NOT NULL;

-- CreateTable
CREATE TABLE "Repository" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_owner_name_workspaceId_key" ON "Repository"("owner", "name", "workspaceId");

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
