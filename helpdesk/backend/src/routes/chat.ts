import { Router, Request, Response, NextFunction } from "express";
import prisma from "../db/prisma";
import { agenteChatInterativo, agenteChatInterativoStream } from "../agents/agenteInterativo";
import { validarInput } from "../guardrails/validarInput";
import { usuarioAtual } from "../auth/token";

const router = Router();

// POST /chat — envia uma mensagem para o agente interativo
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mensagem, ticketId } = req.body as {
      mensagem: string;
      ticketId?: number;
    };

    if (!mensagem?.trim()) {
      res.status(400).json({ erro: "mensagem é obrigatória" });
      return;
    }

    const validacao = validarInput(mensagem);
    if (!validacao.valido) {
      res.status(400).json({ erro: validacao.motivo });
      return;
    }

    const usuarioId = usuarioAtual(res).id;
    const historico = await prisma.mensagemChat.findMany({
      where: { ticketId: ticketId ?? null, usuarioId },
      orderBy: { criadoEm: "desc" },
      take: 8, // Apenas as 4 trocas mais recentes — evita contexto obsoleto que confunde o agente
    });

    // Inverte para ordem cronológica (findMany DESC + reverse = mantém só os últimos)
    const historicoFormatado = historico.reverse().map((m: { role: string; conteudo: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.conteudo,
    }));

    const resposta = await agenteChatInterativo(
      ticketId ?? null,
      usuarioId,
      mensagem,
      historicoFormatado
    );

    res.json({ resposta });
  } catch (err) {
    next(err);
  }
});

// POST /chat/stream — versão SSE: a conexão HTTP fica aberta e chunks chegam conforme o Claude gera.
// O frontend lê via fetch() + ReadableStream e vai exibindo o texto em tempo real.
//
// Formato dos eventos SSE:
//   data: {"chunk": "pedaço de texto"}\n\n   ← texto parcial da resposta
//   data: {"acao": {...}}\n\n               ← ação de escrita proposta, aguardando confirmação (HITL)
//   data: {"done": true}\n\n               ← sinaliza que terminou
//   data: {"erro": "mensagem"}\n\n            ← erro durante o processamento
router.post("/stream", async (req: Request, res: Response) => {
  const { mensagem, ticketId } = req.body as {
    mensagem: string;
    ticketId?: number;
  };

  if (!mensagem?.trim()) {
    res.status(400).json({ erro: "mensagem é obrigatória" });
    return;
  }

  const validacao = validarInput(mensagem);
  if (!validacao.valido) {
    res.status(400).json({ erro: validacao.motivo });
    return;
  }

  const usuarioId = usuarioAtual(res).id;
  const historico = await prisma.mensagemChat.findMany({
    where: { ticketId: ticketId ?? null, usuarioId },
    orderBy: { criadoEm: "desc" },
    take: 8,
  });

  const historicoFormatado = historico.reverse().map((m: { role: string; conteudo: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.conteudo,
  }));

  // Headers SSE: mantém a conexão aberta para enviar eventos ao longo do tempo
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let respostaAcumulada = '';
    await agenteChatInterativoStream(
      ticketId ?? null,
      usuarioId,
      mensagem,
      historicoFormatado,
      (chunk) => {
        respostaAcumulada += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      (acao) => {
        res.write(`data: ${JSON.stringify({ acao })}\n\n`);
      }
    );
    await prisma.mensagemChat.createMany({
      data: [
        { ticketId: ticketId ?? null, usuarioId, role: "user",      conteudo: mensagem },
        { ticketId: ticketId ?? null, usuarioId, role: "assistant", conteudo: respostaAcumulada || "Sem resposta" },
      ],
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ erro: "Erro interno ao processar mensagem" })}\n\n`);
  } finally {
    res.end();
  }
});

// GET /chat/historico — histórico do usuário logado (opcional: filtrado por ticket)
router.get("/historico", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.query.ticketId ? Number(req.query.ticketId) : undefined;

    const mensagens = await prisma.mensagemChat.findMany({
      where: { ticketId: ticketId ?? null, usuarioId: usuarioAtual(res).id },
      orderBy: { criadoEm: "asc" },
      take: 50,
    });

    res.json(mensagens);
  } catch (err) {
    next(err);
  }
});

// DELETE /chat/historico — apaga as mensagens do chat geral (ticketId = null) do usuário logado
router.delete("/historico", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { count } = await prisma.mensagemChat.deleteMany({ where: { ticketId: null, usuarioId: usuarioAtual(res).id } });
    res.json({ ok: true, removidas: count });
  } catch (err) {
    next(err);
  }
});

export default router;

