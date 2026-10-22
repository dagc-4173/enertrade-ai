CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER', ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
CREATE TABLE "AdminAudit" (
 "id" UUID NOT NULL, "actorId" UUID NOT NULL, "targetId" UUID NOT NULL,
 "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AdminAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AdminAudit_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AdminAudit_createdAt_id_idx" ON "AdminAudit"("createdAt", "id");
CREATE INDEX "AdminAudit_targetId_idx" ON "AdminAudit"("targetId");
