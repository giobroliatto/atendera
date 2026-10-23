export interface Ticket {
  id: number;
  titulo: string;
  descricao: string;
  status: 'aberto' | 'em_analise' | 'resolvido' | 'fechado';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  categoria: string;
  sugestaoIA: string | null;
  raciocinioIA: string | null;
  criadoEm: string;
  atualizadoEm: string;
  comentarios?: ComentarioTicket[];
}

export interface ComentarioTicket {
  id: number;
  ticketId: number;
  conteudo: string;
  autor: string;
  criadoEm: string;
}

export interface Mensagem {
  id: number;
  ticketId: number | null;
  role: 'user' | 'assistant';
  conteudo: string;
  criadoEm: string;
}

// Ação de escrita proposta pelo agente do chat, aguardando confirmação humana (HITL)
export interface AcaoPendente {
  id: number;
  tipo: 'alterar_status' | 'alterar_prioridade' | 'adicionar_comentario';
  ticketId: number;
  descricao: string;
  estado: 'pendente' | 'confirmada' | 'cancelada' | 'falhou';
}
