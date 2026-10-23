import { Router, Request, Response, NextFunction } from "express";
import { confirmarAcao, cancelarAcao, ErroAcao } from "../hitl/acoesPendentes";
import { usuarioAtual } from "../auth/token";

const router = Router();

// Human-in-the-loop: única forma de executar uma escrita proposta pelo agente do chat.
// Respostas de erro: 403 (pedida por outro usuário), 404 (não existe), 409 (já resolvida),
// 410 (expirou), 422 (falhou ao executar)

function parseId(valor: string | string[] | undefined): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function tratarErro(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof ErroAcao) {
    res.status(err.status).json({ erro: err.message });
    return;
  }
  next(err);
}

// POST /acoes/:id/confirmar — executa a ação proposta
router.post("/:id/confirmar", async (req: Request, res: Response, next: NextFunction) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ erro: "id da ação inválido" });
    return;
  }
  try {
    res.json(await confirmarAcao(id, usuarioAtual(res).id));
  } catch (err) {
    tratarErro(err, res, next);
  }
});

// POST /acoes/:id/cancelar — descarta a ação proposta
router.post("/:id/cancelar", async (req: Request, res: Response, next: NextFunction) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ erro: "id da ação inválido" });
    return;
  }
  try {
    res.json({ acao: await cancelarAcao(id, usuarioAtual(res).id) });
  } catch (err) {
    tratarErro(err, res, next);
  }
});

export default router;
