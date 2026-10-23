import { z } from "zod";
import prisma from "../db/prisma";
import { validarArgs } from "./validarArgs";

// Ferramentas que o agente pode usar para interagir com o banco de dados
// Cada função aqui é chamada pelo agente quando ele decide que precisa dela

export async function listarTickets(filtros?: { status?: string; prioridade?: string }) {
  const tickets = await prisma.ticket.findMany({
    where: {
      ...(filtros?.status && { status: filtros.status }),
      ...(filtros?.prioridade && { prioridade: filtros.prioridade }),
    },
    orderBy: { criadoEm: "desc" },
    take: 20,
  });
  return tickets;
}

export async function buscarTicketPorId(id: number) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { criadoEm: "asc" } },
      comentarios: { orderBy: { criadoEm: "asc" } },
    },
  });
  return ticket;
}

export async function atualizarTicket(
  id: number,
  dados: { status?: string; prioridade?: string; categoria?: string; sugestaoIA?: string }
) {
  const ticket = await prisma.ticket.update({
    where: { id },
    data: dados,
  });
  return ticket;
}

export async function contarTicketsPorStatus() {
  const resultados = await prisma.ticket.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  return resultados.map((r: { status: string; _count: { id: number } }) => ({ status: r.status, total: r._count.id }));
}

export async function alterarStatus(id: number, status: string) {
  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status },
  });
  return ticket;
}

export async function alterarPrioridade(id: number, prioridade: string) {
  const ticket = await prisma.ticket.update({
    where: { id },
    data: { prioridade },
  });
  return ticket;
}

export async function adicionarComentario(ticketId: number, conteudo: string) {
  const comentario = await prisma.comentarioTicket.create({
    data: { ticketId, conteudo },
  });
  return comentario;
}

// Definição das ferramentas no formato que a Anthropic espera (schema)
export const ticketToolsSchema = [
  {
    name: "listar_tickets",
    description:
      "Lista os tickets do sistema com filtros opcionais por status ou prioridade. Use quando o usuário pedir para ver tickets.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description: "Filtrar por status: aberto, em_analise, resolvido, fechado",
        },
        prioridade: {
          type: "string",
          description: "Filtrar por prioridade: baixa, media, alta, critica",
        },
      },
    },
  },
  {
    name: "buscar_ticket",
    description:
      "Busca detalhes completos de um ticket específico pelo ID, incluindo mensagens.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID numérico do ticket" },
      },
      required: ["id"],
    },
  },
  {
    name: "resumo_tickets",
    description:
      "Retorna um resumo com contagem de tickets por status. Útil para visão geral do sistema.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "alterar_status",
    description:
      "Altera o status de um ticket para qualquer valor: aberto, em_analise, resolvido ou fechado. " +
      "REGRA OBRIGATÓRIA (HUMAN-IN-THE-LOOP): antes de chamar esta tool, use buscar_ticket para " +
      "mostrar os detalhes atuais e pergunte explicitamente ao usuário se confirma a mudança. " +
      "SÓ execute após confirmação clara ('sim', 'pode', 'confirmo', etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID numérico do ticket" },
        status: {
          type: "string",
          enum: ["aberto", "em_analise", "resolvido", "fechado"],
          description: "Novo status do ticket",
        },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "alterar_prioridade",
    description:
      "Altera a prioridade de um ticket para: baixa, media, alta ou critica. " +
      "REGRA OBRIGATÓRIA (HUMAN-IN-THE-LOOP): antes de chamar esta tool, use buscar_ticket para " +
      "mostrar a prioridade atual e pergunte ao usuário se confirma a mudança. " +
      "SÓ execute após confirmação clara.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID numérico do ticket" },
        prioridade: {
          type: "string",
          enum: ["baixa", "media", "alta", "critica"],
          description: "Nova prioridade do ticket",
        },
      },
      required: ["id", "prioridade"],
    },
  },
  {
    name: "adicionar_comentario",
    description:
      "Adiciona um comentário interno ao ticket. Use para registrar observações, " +
      "atualizações de andamento ou comunicados sobre o ticket. " +
      "REGRA OBRIGATÓRIA (HUMAN-IN-THE-LOOP): mostre o texto do comentário ao usuário " +
      "e peça confirmação antes de registrá-lo.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID numérico do ticket" },
        conteudo: { type: "string", description: "Texto do comentário a registrar" },
      },
      required: ["id", "conteudo"],
    },
  },
];

// Schemas de validação dos argumentos — o modelo pode mandar "7" em vez de 7,
// um status fora da lista ou omitir campos. Validamos antes de tocar no banco;
// se falhar, o erro volta ao Claude como tool_result com is_error.
const STATUS = ["aberto", "em_analise", "resolvido", "fechado"] as const;
const PRIORIDADES = ["baixa", "media", "alta", "critica"] as const;
const idTicket = z.coerce.number().int().positive();

const argsSchemas = {
  listar_tickets: z.object({
    status: z.enum(STATUS).optional(),
    prioridade: z.enum(PRIORIDADES).optional(),
  }),
  buscar_ticket: z.object({ id: idTicket }),
  alterar_status: z.object({ id: idTicket, status: z.enum(STATUS) }),
  alterar_prioridade: z.object({ id: idTicket, prioridade: z.enum(PRIORIDADES) }),
  adicionar_comentario: z.object({ id: idTicket, conteudo: z.string().trim().min(1).max(2000) }),
};

// Executor: recebe nome e input da tool, chama a função certa
export async function executarTicketTool(
  nome: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (nome) {
    case "listar_tickets":
      return listarTickets(validarArgs(argsSchemas.listar_tickets, input));
    case "buscar_ticket": {
      const { id } = validarArgs(argsSchemas.buscar_ticket, input);
      return buscarTicketPorId(id);
    }
    case "resumo_tickets":
      return contarTicketsPorStatus();
    case "alterar_status": {
      const { id, status } = validarArgs(argsSchemas.alterar_status, input);
      return alterarStatus(id, status);
    }
    case "alterar_prioridade": {
      const { id, prioridade } = validarArgs(argsSchemas.alterar_prioridade, input);
      return alterarPrioridade(id, prioridade);
    }
    case "adicionar_comentario": {
      const { id, conteudo } = validarArgs(argsSchemas.adicionar_comentario, input);
      return adicionarComentario(id, conteudo);
    }
    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
