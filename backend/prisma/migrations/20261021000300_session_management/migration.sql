ALTER TABLE "AuthSession" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "AuthSession_id_key" ON "AuthSession"("id");
