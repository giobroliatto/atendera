-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LogChamadaIA" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agente" TEXT NOT NULL,
    "modelo" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheEscritaTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheLeituraTokens" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" REAL NOT NULL,
    "latenciaMs" INTEGER NOT NULL,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "ticketId" INTEGER,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_LogChamadaIA" ("agente", "criadoEm", "custoUsd", "id", "inputTokens", "latenciaMs", "modelo", "outputTokens", "ticketId", "toolCalls") SELECT "agente", "criadoEm", "custoUsd", "id", "inputTokens", "latenciaMs", "modelo", "outputTokens", "ticketId", "toolCalls" FROM "LogChamadaIA";
DROP TABLE "LogChamadaIA";
ALTER TABLE "new_LogChamadaIA" RENAME TO "LogChamadaIA";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
