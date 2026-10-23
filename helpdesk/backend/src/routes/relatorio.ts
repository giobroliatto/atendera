import { Router, Request, Response } from "express";
import { agenteRelatorioStream } from "../agents/agenteRelatorios";
import { validarInput } from "../guardrails/validarInput";

const router = Router();

// POST /relatorio/stream — consulta ao agente de relatórios via SSE.
// Stateless: sem histórico persistido. Cada consulta é independente.
//
// Formato SSE:
//   data: {"chunk": "pedaço de texto"}\n\n
//   data: {"done": true}\n\n
router.post("/stream", async (req: Request, res: Response) => {
  const { mensagem } = req.body as { mensagem: string };

  if (!mensagem?.trim()) {
    res.status(400).json({ erro: "mensagem é obrigatória" });
    return;
  }

  const validacao = validarInput(mensagem);
  if (!validacao.valido) {
    res.status(400).json({ erro: validacao.motivo });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    await agenteRelatorioStream(mensagem, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    console.error("[RELATORIO] Erro no agente:", err);
    res.write(`data: ${JSON.stringify({ erro: "Erro ao gerar relatório" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
