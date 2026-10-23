import { z } from "zod";
import prisma from "../db/prisma";
import { validarArgs } from "./validarArgs";

// ================================================================
// FERRAMENTAS DO AGENTE DE RELATÓRIOS
// Funções de leitura/análise — sem nenhuma escrita no banco.
// ================================================================

export async function ticketsPorPeriodo(dias: number) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const tickets = await prisma.ticket.findMany({
    where: { criadoEm: { gte: desde } },
    orderBy: { criadoEm: "desc" },
  });
  return { periodo: `${dias} dias`, total: tickets.length, tickets };
}

export async function distribuicaoTickets() {
  const [porCategoria, porPrioridade, porStatus] = await Promise.all([
    prisma.ticket.groupBy({ by: ["categoria"], _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
    prisma.ticket.groupBy({ by: ["prioridade"], _count: { id: true } }),
    prisma.ticket.groupBy({ by: ["status"], _count: { id: true } }),
  ]);
  return {
    porCategoria: porCategoria.map((r) => ({ categoria: r.categoria, total: r._count.id })),
    porPrioridade: porPrioridade.map((r) => ({ prioridade: r.prioridade, total: r._count.id })),
    porStatus: porStatus.map((r) => ({ status: r.status, total: r._count.id })),
  };
}

export async function ticketsSemAtualizacao(dias: number) {
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const tickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["fechado", "resolvido"] },
      atualizadoEm: { lte: limite },
    },
    orderBy: { atualizadoEm: "asc" },
  });
  return { diasSemAtualizacao: dias, total: tickets.length, tickets };
}

// Definição das ferramentas no formato Anthropic
export const relatorioToolsSchema = [
  {
    name: "tickets_por_periodo",
    description:
      "Busca todos os tickets criados nos últimos N dias com detalhes completos. " +
      "Use para relatórios de volume, tendências e atividade recente.",
    input_schema: {
      type: "object" as const,
      properties: {
        dias: {
          type: "number",
          description: "Número de dias para olhar no passado (ex: 7, 30, 90)",
        },
      },
      required: ["dias"],
    },
  },
  {
    name: "distribuicao_tickets",
    description:
      "Retorna a distribuição de tickets por categoria, prioridade e status. " +
      "Ideal para visão geral do sistema e identificação de gargalos.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "tickets_sem_atualizacao",
    description:
      "Lista tickets abertos/em análise que não foram atualizados há N dias. " +
      "Útil para identificar possíveis violações de SLA ou tickets esquecidos.",
    input_schema: {
      type: "object" as const,
      properties: {
        dias: {
          type: "number",
          description: "Número de dias sem atualização (ex: 3, 7, 14)",
        },
      },
      required: ["dias"],
    },
  },
];

// Período em dias: inteiro entre 1 e 365 (evita consultas negativas ou absurdas)
const argsPeriodo = z.object({ dias: z.coerce.number().int().min(1).max(365) });

// Executor: recebe nome e input da tool, chama a função certa
export async function executarRelatorioTool(
  nome: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (nome) {
    case "tickets_por_periodo":
      return ticketsPorPeriodo(validarArgs(argsPeriodo, input).dias);
    case "distribuicao_tickets":
      return distribuicaoTickets();
    case "tickets_sem_atualizacao":
      return ticketsSemAtualizacao(validarArgs(argsPeriodo, input).dias);
    default:
      throw new Error(`Ferramenta de relatório desconhecida: ${nome}`);
  }
}
