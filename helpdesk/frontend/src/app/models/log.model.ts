// Registro de uma chamada à API da Anthropic (tabela LogChamadaIA)
export interface LogChamadaIA {
  id: number;
  agente: string;
  inputTokens: number;
  outputTokens: number;
  custoUsd: number;
  latenciaMs: number;
  toolCalls: number;
  ticketId: number | null;
  criadoEm: string;
}

// Agregados do Prisma — _sum/_avg/_max vêm null quando não há nenhum log
export interface TotaisLogs {
  _count: { id: number };
  _sum: { inputTokens: number | null; outputTokens: number | null; custoUsd: number | null; toolCalls: number | null };
  _avg: { latenciaMs: number | null; inputTokens: number | null; outputTokens: number | null };
  _max: { latenciaMs: number | null };
}

export interface RespostaLogs {
  logs: LogChamadaIA[];
  totais: TotaisLogs;
}
