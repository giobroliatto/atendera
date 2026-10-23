import { Router, Request, Response } from "express";
import prisma from "../db/prisma";
import { orquestradorStream, AgenteRoteado } from "../agents/orquestrador";
import { validarInput } from "../guardrails/validarInput";
import { usuarioAtual } from "../auth/token";

const router = Router();

// POST /orquestrador/stream — ponto de entrada único para o chat.
// O orquestrador classifica a intenção e delega para o agente correto.
//
// Formato SSE:
//   data: {"agente": "interativo"}\n\n   ← primeiro evento: qual agente foi acionado
//   data: {"chunk": "texto..."}\n\n       ← chunks de texto em streaming
//   data: {"acao": {...}}\n\n             ← ação de escrita proposta, aguardando confirmação (HITL)
//   data: {"done": true}\n\n              ← fim da resposta
router.post("/stream", async (req: Request, res: Response) => {
  const { mensagem, ticketId } = req.body as { mensagem: string; ticketId?: number };

  if (!mensagem?.trim()) {
    res.status(400).json({ erro: "mensagem é obrigatória" });
    return;
  }

  const validacao = validarInput(mensagem);
  if (!validacao.valido) {
    res.status(400).json({ erro: validacao.motivo });
    return;
  }

  // Carrega histórico antecipadamente — o agente interativo precisa dele;
  // o de relatórios ignora (stateless), mas o custo é mínimo.
  const usuarioId = usuarioAtual(res).id;
  const historico = await prisma.mensagemChat.findMany({
    where: { ticketId: ticketId ?? null, usuarioId },
    orderBy: { criadoEm: "desc" },
    take: 8,
  });
  const historicoFormatado = historico.reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.conteudo,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let respostaAcumulada = '';
    await orquestradorStream(
      ticketId ?? null,
      usuarioId,
      mensagem,
      historicoFormatado,
      (agente: AgenteRoteado) => {
        res.write(`data: ${JSON.stringify({ agente })}\n\n`);
      },
      (chunk: string) => {
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
    console.error("[ORQUESTRADOR] Erro:", err);
    res.write(`data: ${JSON.stringify({ erro: "Erro ao processar mensagem" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
