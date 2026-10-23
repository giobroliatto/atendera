-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AcaoPendente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "dados" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendente',
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoEm" DATETIME,
    CONSTRAINT "AcaoPendente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AcaoPendente" ("criadoEm", "dados", "descricao", "estado", "id", "resolvidoEm", "ticketId", "tipo") SELECT "criadoEm", "dados", "descricao", "estado", "id", "resolvidoEm", "ticketId", "tipo" FROM "AcaoPendente";
DROP TABLE "AcaoPendente";
ALTER TABLE "new_AcaoPendente" RENAME TO "AcaoPendente";
CREATE TABLE "new_MensagemChat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketId" INTEGER,
    "usuarioId" INTEGER,
    "role" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MensagemChat_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MensagemChat_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MensagemChat" ("conteudo", "criadoEm", "id", "role", "ticketId") SELECT "conteudo", "criadoEm", "id", "role", "ticketId" FROM "MensagemChat";
DROP TABLE "MensagemChat";
ALTER TABLE "new_MensagemChat" RENAME TO "MensagemChat";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
