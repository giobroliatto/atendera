import { Router, Request, Response, NextFunction } from "express";
import prisma from "../db/prisma";

const router = Router();

// GET /logs?limit=100&agente=interativo
// Retorna logs recentes + totais agregados (custo, tokens, latência média)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const agente = req.query.agente as string | undefined;

    const where = agente ? { agente } : {};

    const [logs, totais] = await Promise.all([
      prisma.logChamadaIA.findMany({
        where,
        orderBy: { criadoEm: "desc" },
        take: limit,
      }),
      prisma.logChamadaIA.aggregate({
        where,
        _sum:   { inputTokens: true, outputTokens: true, cacheEscritaTokens: true, cacheLeituraTokens: true, custoUsd: true, toolCalls: true },
        _avg:   { latenciaMs: true, inputTokens: true, outputTokens: true },
        _count: { id: true },
        _max:   { latenciaMs: true },
      }),
    ]);

    res.json({ logs, totais });
  } catch (err) {
    next(err);
  }
});

export default router;
