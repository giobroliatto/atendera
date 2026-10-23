import { Router, Request, Response, NextFunction } from "express";
import prisma from "../db/prisma";
import { agenteAuditarTicket } from "../agents/agenteAutomatico";

const router = Router();

// Converte o :id da URL em número inteiro positivo; null se inválido ("abc", "1.5", "-3")
function parseId(valor: string | string[] | undefined): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /tickets — lista todos os tickets
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: { criadoEm: "desc" },
    });
    res.json(tickets);
  } catch (err) {
    next(err);
  }
});

// GET /tickets/:id — busca um ticket pelo ID com suas mensagens e comentários
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ erro: "id do ticket inválido" });
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        mensagens: { orderBy: { criadoEm: "asc" } },
        comentarios: { orderBy: { criadoEm: "asc" } },
      },
    });

    if (!ticket) {
      res.status(404).json({ erro: "Ticket não encontrado" });
      return;
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// POST /tickets/:id/comentarios — adiciona um comentário manual ao ticket
router.post("/:id/comentarios", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) {
      res.status(400).json({ erro: "id do ticket inválido" });
      return;
    }
    const { conteudo, autor } = req.body as { conteudo: string; autor?: string };

    if (!conteudo?.trim()) {
      res.status(400).json({ erro: "conteudo é obrigatório" });
      return;
    }

    const existe = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!existe) {
      res.status(404).json({ erro: "Ticket não encontrado" });
      return;
    }

    const comentario = await prisma.comentarioTicket.create({
      data: { ticketId, conteudo: conteudo.trim(), autor: autor?.trim() || "Usuário" },
    });

    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
});

// POST /tickets — cria um novo ticket e dispara o agente automático
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titulo, descricao, comRaciocinio } = req.body as {
      titulo: string;
      descricao: string;
      comRaciocinio?: boolean;
    };

    if (!titulo?.trim() || !descricao?.trim()) {
      res.status(400).json({ erro: "titulo e descricao são obrigatórios" });
      return;
    }

    const ticket = await prisma.ticket.create({
      data: { titulo, descricao },
    });

    // Dispara o agente automático de forma assíncrona (não bloqueia a resposta HTTP)
    // comRaciocinio === true ativa CoT + Few-Shot (~600 tokens); false usa modo simples (~200 tokens)
    agenteAuditarTicket(ticket.id, comRaciocinio === true).catch((err) =>
      console.error("[ROTA] Erro no agente automático:", err)
    );

    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

// PATCH /tickets/:id — atualiza status de um ticket
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ erro: "id do ticket inválido" });
      return;
    }

    const { status } = req.body as { status: string };
    const statusValidos = ["aberto", "em_analise", "resolvido", "fechado"];

    if (!statusValidos.includes(status)) {
      res.status(400).json({ erro: `Status deve ser um de: ${statusValidos.join(", ")}` });
      return;
    }

    const existe = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!existe) {
      res.status(404).json({ erro: "Ticket não encontrado" });
      return;
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: { status },
    });

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

export default router;

