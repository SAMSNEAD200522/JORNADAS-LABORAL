-- CreateTable
CREATE TABLE "tokens_revocados" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_revocados_token_key" ON "tokens_revocados"("token");

-- CreateIndex
CREATE INDEX "tokens_revocados_expiresAt_idx" ON "tokens_revocados"("expiresAt");
