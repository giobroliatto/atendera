import prisma from "../db/prisma";
import { validarArgs } from "../tools/validarArgs";
import {
  argsSchemas,
  alterarStatus,
  alterarPrioridade,
  adicionarComentario,
  executarTicketTool,
  ehFerramentaEscrita,
  FerramentaEscrita,
} from "../tools/ticketTools";

// ================================================================
// HUMAN-IN-THE-LOOP NO SERVIDOR
//
// Antes, a confirmação dependia só do system prompt: o modelo "prometia"
// perguntar antes de alterar um ticket. Agora a regra é aplicada em código:
//
//   1. O agente chama alterar_status/alterar_prioridade/adicionar_comentario
//   2. Em vez de executar, criamos uma AcaoPendente no banco
//   3. O frontend mostra um cartão com "Confirmar" / "Cancelar"
//   4. SÓ o clique em Confirmar (POST /acoes/:id/confirmar) executa a escrita
//
// Um "sim" digitado no chat — ou um prompt injection — não executa nada.
// ================================================================

export const EXPIRACAO_MS = 15 * 60 * 1000; // proposta vale por 15 minutos

export interface AcaoProposta {
  id: number;
  tipo: string;
  ticketId: number;
  descricao: string;
  estado: string;
}

export class ErroAcao extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function paraProposta(acao: { id: number; tipo: string; ticketId: number; descricao: string; estado: string }): AcaoProposta {
  const { id, tipo, ticketId, descricao, estado } = acao;
  return { id, tipo, ticketId, descricao, estado };
}

// Valida os argumentos, confere se o ticket existe e registra a proposta
export async function proporAcao(tipo: FerramentaEscrita, input: Record<string, unknown>): Promise<AcaoProposta> {
  const args = validarArgs(argsSchemas[tipo], input);

  const ticket = await prisma.ticket.findUnique({ where: { id: args.id } });
  if (!ticket) throw new Error("Ticket não encontrado.");

  let descricao: string;
  if (tipo === "alterar_status") {
    const { status } = args as { status: string };
    descricao = `Alterar status do ticket #${ticket.id} "${ticket.titulo}": ${ticket.status} → ${status}`;
  } else if (tipo === "alterar_prioridade") {
    const { prioridade } = args as { prioridade: string };
    descricao = `Alterar prioridade do ticket #${ticket.id} "${ticket.titulo}": ${ticket.prioridade} → ${prioridade}`;
  } else {
    const { conteudo } = args as { conteudo: string };
    descricao = `Adicionar comentário no ticket #${ticket.id} "${ticket.titulo}": "${conteudo}"`;
  }

  const acao = await prisma.acaoPendente.create({
    data: { tipo, ticketId: ticket.id, dados: JSON.stringify(args), descricao },
  });
  console.log(`[HITL] Ação #${acao.id} proposta: ${descricao}`);
  return paraProposta(acao);
}

// Executor usado pelos agentes do chat: leituras rodam direto, escritas viram proposta.
// onAcaoProposta avisa a rota SSE para enviar o cartão de confirmação ao frontend.
export async function executarToolComHITL(
  nome: string,
  input: Record<string, unknown>,
  onAcaoProposta?: (acao: AcaoProposta) => void
): Promise<unknown> {
  if (!ehFerramentaEscrita(nome)) return executarTicketTool(nome, input);

  const acao = await proporAcao(nome, input);
  onAcaoProposta?.(acao);
  return {
    acaoPendenteId: acao.id,
    estado: "aguardando_confirmacao",
    descricao: acao.descricao,
    instrucao:
      "A ação AINDA NÃO foi executada. O usuário verá um cartão com os botões Confirmar e Cancelar. " +
      "Diga o que foi proposto e peça para ele confirmar no cartão. Não afirme que a alteração foi feita.",
  };
}

// Busca a ação e explica por que ela não pode mais ser resolvida
async function erroAcaoIndisponivel(id: number): Promise<ErroAcao> {
  const acao = await prisma.acaoPendente.findUnique({ where: { id } });
  if (!acao) return new ErroAcao("Ação não encontrada.", 404);
  if (acao.estado !== "pendente") return new ErroAcao(`Esta ação já foi ${acao.estado}.`, 409);
  return new ErroAcao("Esta ação expirou. Peça novamente ao assistente.", 410);
}

// Transição atômica pendente → novoEstado: dois cliques simultâneos não executam a ação duas vezes
async function resolverAcao(id: number, novoEstado: "confirmada" | "cancelada") {
  const { count } = await prisma.acaoPendente.updateMany({
    where: { id, estado: "pendente", criadoEm: { gte: new Date(Date.now() - EXPIRACAO_MS) } },
    data: { estado: novoEstado, resolvidoEm: new Date() },
  });
  if (count === 0) throw await erroAcaoIndisponivel(id);
  return prisma.acaoPendente.findUniqueOrThrow({ where: { id } });
}

export async function confirmarAcao(id: number): Promise<{ acao: AcaoProposta; resultado: unknown }> {
  const acao = await resolverAcao(id, "confirmada");
  const dados = JSON.parse(acao.dados);

  try {
    let resultado: unknown;
    if (acao.tipo === "alterar_status") resultado = await alterarStatus(dados.id, dados.status);
    else if (acao.tipo === "alterar_prioridade") resultado = await alterarPrioridade(dados.id, dados.prioridade);
    else if (acao.tipo === "adicionar_comentario") resultado = await adicionarComentario(dados.id, dados.conteudo);
    else throw new Error(`Tipo de ação desconhecido: ${acao.tipo}`);

    console.log(`[HITL] Ação #${id} confirmada e executada.`);
    return { acao: paraProposta(acao), resultado };
  } catch (err) {
    await prisma.acaoPendente.update({ where: { id }, data: { estado: "falhou" } });
    console.error(`[HITL] Ação #${id} falhou ao executar:`, err);
    throw new ErroAcao("Não foi possível executar a ação (o ticket ainda existe?).", 422);
  }
}

export async function cancelarAcao(id: number): Promise<AcaoProposta> {
  const acao = await resolverAcao(id, "cancelada");
  console.log(`[HITL] Ação #${id} cancelada pelo usuário.`);
  return paraProposta(acao);
}
