import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import ticketsRouter from "./routes/tickets";
import chatRouter from "./routes/chat";
import relatorioRouter from "./routes/relatorio";
import orquestradorRouter from "./routes/orquestrador";
import logsRouter from "./routes/logs";

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

// Rotas
app.use("/tickets", ticketsRouter);
app.use("/chat", chatRouter);
app.use("/relatorio", relatorioRouter);
app.use("/orquestrador", orquestradorRouter);
app.use("/logs", logsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler — captura erros de rotas async e retorna JSON (evita respostas pendentes)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERRO]", err.message);
  res.status(500).json({ erro: err.message || "Erro interno do servidor" });
});

app.listen(PORT, () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log(`\n✅ Backend rodando em http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY: ${apiKey ? "✅ carregada" : "❌ NÃO definida!"}`);
  console.log(`   Rotas disponíveis:`);
  console.log(`   GET    /health`);
  console.log(`   GET    /tickets`);
  console.log(`   GET    /tickets/:id`);
  console.log(`   POST   /tickets       ← dispara agente automático`);
  console.log(`   PATCH  /tickets/:id`);
  console.log(`   POST   /chat          ← agente interativo`);
  console.log(`   GET    /chat/historico`);
});

