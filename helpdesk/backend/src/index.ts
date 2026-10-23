import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import ticketsRouter from "./routes/tickets";
import chatRouter from "./routes/chat";
import relatorioRouter from "./routes/relatorio";
import orquestradorRouter from "./routes/orquestrador";
import logsRouter from "./routes/logs";
import acoesRouter from "./routes/acoes";
import authRouter from "./routes/auth";
import { exigirAutenticacao } from "./auth/token";

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
// CORS: só o frontend pode chamar a API pelo navegador.
// CORS_ORIGIN aceita várias origens separadas por vírgula.
const origensPermitidas = (process.env.CORS_ORIGIN || "http://localhost:4200")
  .split(",")
  .map((o) => o.trim());
app.use(cors({ origin: origensPermitidas }));
app.use(express.json());

// Rotas públicas
app.use("/auth", authRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Daqui pra baixo, toda rota exige login (Authorization: Bearer <token>)
app.use(exigirAutenticacao);
app.use("/tickets", ticketsRouter);
app.use("/chat", chatRouter);
app.use("/relatorio", relatorioRouter);
app.use("/orquestrador", orquestradorRouter);
app.use("/logs", logsRouter);
app.use("/acoes", acoesRouter);

// Error handler — captura erros de rotas async e retorna JSON (evita respostas pendentes)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERRO]", err.message);
  res.status(500).json({ erro: err.message || "Erro interno do servidor" });
});

// Sem JWT_SECRET não há como assinar nem validar tokens — melhor falhar já na inicialização
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET não definido no .env. Gere um com: openssl rand -base64 32");
  process.exit(1);
}

app.listen(PORT, () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log(`\n✅ Backend rodando em http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY: ${apiKey ? "✅ carregada" : "❌ NÃO definida!"}`);
  console.log(`   Rotas públicas: GET /health, POST /auth/login`);
  console.log(`   Rotas autenticadas (Bearer token):`);
  console.log(`   GET    /auth/me`);
  console.log(`   GET    /tickets | /tickets/:id`);
  console.log(`   POST   /tickets                  ← dispara agente automático`);
  console.log(`   PATCH  /tickets/:id`);
  console.log(`   POST   /tickets/:id/comentarios`);
  console.log(`   POST   /orquestrador/stream      ← chat (SSE), roteia entre os agentes`);
  console.log(`   GET    /chat/historico | DELETE /chat/historico`);
  console.log(`   POST   /acoes/:id/confirmar | /acoes/:id/cancelar   ← human-in-the-loop`);
  console.log(`   GET    /logs                     ← observabilidade`);
});
