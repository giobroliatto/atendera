// Registro de uma chamada à API da Anthropic (tabela LogChamadaIA)
export interface LogChamadaIA {
  id: number;
  agente: string;
  modelo: string | null;
  inputTokens: number;          // fora do prompt cache
  outputTokens: number;
  cacheEscritaTokens: number;   // gravados no prompt cache
  cacheLeituraTokens: number;   // lidos do prompt cache
  custoUsd: number;
  latenciaMs: number;
  toolCalls: number;
  ticketId: number | null;
  criadoEm: string;
}

// Agregados do Prisma — _sum/_avg/_max vêm null quando não há nenhum log
export interface TotaisLogs {
  _count: { id: number };
  _sum: {
    inputTokens: number | null; outputTokens: number | null; custoUsd: number | null; toolCalls: number | null;
    cacheEscritaTokens: number | null; cacheLeituraTokens: number | null;
  };
  _avg: { latenciaMs: number | null; inputTokens: number | null; outputTokens: number | null };
  _max: { latenciaMs: number | null };
}

export interface RespostaLogs {
  logs: LogChamadaIA[];
  totais: TotaisLogs;
}
