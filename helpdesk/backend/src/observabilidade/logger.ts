import prisma from "../db/prisma";

// ================================================================
// OBSERVABILIDADE — logger de chamadas à API da Anthropic
//
// O custo é calculado com o preço do modelo que atendeu a chamada
// (tabela PRECOS abaixo, em USD por 1 milhão de tokens).
//
// Prompt caching: a API separa o input em três partes, com preços diferentes:
//   input_tokens                 → fora do cache, preço cheio
//   cache_creation_input_tokens  → gravados no cache agora, 1,25× o preço de entrada
//   cache_read_input_tokens      → lidos do cache, ~0,1× o preço de entrada
//
// Por que input e output têm preços diferentes?
//   O modelo precisa processar CADA token do input antes de gerar
//   qualquer output. Output requer mais computação (geração autoregressiva
//   token a token) — por isso custa bem mais que input.
//
// O que é rastreado:
//   - Modelo usado
//   - Tokens de input e output separados (preços diferentes)
//   - Custo estimado em USD por chamada
//   - Latência total (do create() ao retorno)
//   - Quantas tool_use calls aconteceram no loop
//   - Qual agente / qual ticketId (para correlação)
// ================================================================

// Preços da API da Anthropic (USD por 1M de tokens) — out/2026.
// Ao trocar ANTHROPIC_MODEL para um modelo fora da lista, adicione o preço aqui.
// leituraCache só aparece quando foge da regra de 10% do preço de entrada.
const PRECOS: Record<string, { entrada: number; saida: number; leituraCache?: number }> = {
  "claude-haiku-5-5":  { entrada: 0.10, saida: 0.50 },
  "claude-haiku-4-5":  { entrada: 1.00, saida: 5.00 },
  "claude-sonnet-5-5": { entrada: 2.00, saida: 10.00 },
  "claude-sonnet-5":   { entrada: 2.00, saida: 10.00 },
  "claude-sonnet-4-6": { entrada: 3.00, saida: 15.00 },
  "claude-sonnet-4-5": { entrada: 3.00, saida: 15.00 },
  "claude-opus-5-5":   { entrada: 4.00, saida: 20.00, leituraCache: 0.20 },
  "claude-opus-5":     { entrada: 5.00, saida: 25.00 },
};
const PRECO_PADRAO = PRECOS["claude-sonnet-4-5"];
const avisados = new Set<string>();

function precoDoModelo(modelo: string) {
  const preco = PRECOS[modelo];
  if (!preco && !avisados.has(modelo)) {
    avisados.add(modelo);
    console.warn(`[OBS] Modelo "${modelo}" sem preço em logger.ts — usando o preço do claude-sonnet-4-5 no cálculo de custo.`);
  }
  return preco ?? PRECO_PADRAO;
}

export interface LogParams {
  modelo: string;
  agente: string;
  inputTokens: number;
  outputTokens: number;
  cacheEscritaTokens?: number;
  cacheLeituraTokens?: number;
  latenciaMs: number;
  toolCalls?: number;
  ticketId?: number | null;
}

export async function logChamadaIA(params: LogParams): Promise<void> {
  const preco = precoDoModelo(params.modelo);
  const cacheEscrita = params.cacheEscritaTokens ?? 0;
  const cacheLeitura = params.cacheLeituraTokens ?? 0;
  const custoUsd =
    (params.inputTokens  * preco.entrada +
     cacheEscrita        * preco.entrada * 1.25 +
     cacheLeitura        * (preco.leituraCache ?? preco.entrada * 0.1) +
     params.outputTokens * preco.saida) / 1_000_000;

  await prisma.logChamadaIA.create({
    data: {
      modelo:       params.modelo,
      agente:       params.agente,
      inputTokens:  params.inputTokens,
      outputTokens: params.outputTokens,
      cacheEscritaTokens: cacheEscrita,
      cacheLeituraTokens: cacheLeitura,
      custoUsd,
      latenciaMs:   params.latenciaMs,
      toolCalls:    params.toolCalls ?? 0,
      ticketId:     params.ticketId ?? null,
    },
  });

  // Log no console em formato compacto para debug
  console.log(
    `[OBS] ${params.agente.padEnd(16)} | ${params.modelo} | ` +
    `in:${String(params.inputTokens).padStart(5)} out:${String(params.outputTokens).padStart(4)} ` +
    `cache(+${cacheEscrita}/↺${cacheLeitura}) | ` +
    `$${custoUsd.toFixed(5)} | ` +
    `${params.latenciaMs}ms | ` +
    `tools:${params.toolCalls ?? 0}`
  );
}
