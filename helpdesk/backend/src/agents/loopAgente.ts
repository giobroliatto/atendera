import Anthropic from "@anthropic-ai/sdk";
import { client, MODELO_PRINCIPAL } from "../ia/claude";
import { logChamadaIA } from "../observabilidade/logger";
import { executarToolComoResultado } from "../tools/executarTool";

// ================================================================
// LOOP DE TOOL USE — compartilhado pelos agentes interativo e de relatórios
//
//   1. Chama o Claude (em streaming: o texto vai para onChunk conforme chega)
//   2. stop_reason "tool_use"? Executa TODAS as ferramentas pedidas e devolve
//      os tool_result numa única mensagem user. Volta para 1.
//   3. Qualquer outro stop_reason: a resposta final está pronta.
//
// Prompt caching:
//   O system vai em dois blocos. O primeiro (instruções fixas) leva cache_control:
//   como a API monta o prompt na ordem tools → system → messages, esse breakpoint
//   guarda tools + instruções no cache. Nas chamadas seguintes (as outras iterações
//   do loop e as próximas mensagens, por 5 minutos) esse trecho custa 10% do preço.
//   A parte que muda a cada chamada (data, artigos do RAG) fica no segundo bloco,
//   DEPOIS do breakpoint — se viesse antes, invalidaria o cache toda vez.
//
// Proteções:
//   - maxIteracoes: o modelo não fica chamando ferramentas para sempre
//   - "max_tokens": avisa que a resposta foi cortada em vez de terminar em silêncio
//   - "refusal": devolve uma mensagem em vez de uma resposta vazia
//   - o log de tokens/custo é gravado mesmo se a chamada falhar no meio
// ================================================================

export interface OpcoesLoopAgente {
  agente: string;                                   // nome no log de observabilidade
  systemFixo: string;                               // instruções que não mudam (vão para o cache)
  systemVariavel?: string;                          // data, contexto do RAG... (fora do cache)
  tools: Anthropic.Tool[];
  executor: (nome: string, input: Record<string, unknown>) => Promise<unknown>;
  messages: Anthropic.MessageParam[];               // histórico + mensagem atual (é modificado)
  maxTokens: number;
  ticketId?: number | null;
  onChunk?: (chunk: string) => void;                // recebe o texto em tempo real (SSE)
  maxIteracoes?: number;
}

export const AVISO_LIMITE_TOKENS = "\n\n_(Resposta interrompida: limite de tamanho atingido.)_";
export const AVISO_MUITAS_ITERACOES = "Não consegui concluir: foram necessárias chamadas de ferramentas demais. Tente uma pergunta mais específica.";
export const AVISO_RECUSA = "Não posso ajudar com esse pedido.";

// Devolve o texto da resposta final do modelo
export async function executarLoopAgente(opcoes: OpcoesLoopAgente): Promise<string> {
  const { agente, tools, executor, messages, maxTokens, onChunk } = opcoes;
  const maxIteracoes = opcoes.maxIteracoes ?? 8;

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: opcoes.systemFixo, cache_control: { type: "ephemeral" } },
  ];
  if (opcoes.systemVariavel) system.push({ type: "text", text: opcoes.systemVariavel });

  const emitir = (texto: string) => onChunk?.(texto);

  // acumuladores de observabilidade — somam tokens de TODAS as iterações do loop
  const inicio = Date.now();
  let totalInputTokens = 0, totalOutputTokens = 0, toolCallCount = 0;
  let cacheEscritaTokens = 0, cacheLeituraTokens = 0;

  try {
    for (let iteracao = 1; iteracao <= maxIteracoes; iteracao++) {
      const stream = client.messages.stream({
        model: MODELO_PRINCIPAL,
        max_tokens: maxTokens,
        system,
        tools,
        messages,
      });

      // Repassa só os pedaços de texto (eventos de tool_use e metadata ficam de fora)
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emitir(event.delta.text);
        }
      }

      const resposta = await stream.finalMessage();
      totalInputTokens += resposta.usage.input_tokens;
      totalOutputTokens += resposta.usage.output_tokens;
      cacheEscritaTokens += resposta.usage.cache_creation_input_tokens ?? 0;
      cacheLeituraTokens += resposta.usage.cache_read_input_tokens ?? 0;

      if (resposta.stop_reason !== "tool_use") {
        let texto = resposta.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        if (resposta.stop_reason === "max_tokens") {
          emitir(AVISO_LIMITE_TOKENS);
          texto += AVISO_LIMITE_TOKENS;
        } else if (resposta.stop_reason === "refusal" && !texto) {
          emitir(AVISO_RECUSA);
          texto = AVISO_RECUSA;
        }
        return texto;
      }

      // Claude pode pedir várias ferramentas numa resposta: todas precisam de um
      // tool_result, e todos vão juntos numa única mensagem user
      const chamadas = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      toolCallCount += chamadas.length;
      messages.push({ role: "assistant", content: resposta.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const chamada of chamadas) {
        toolResults.push(await executarToolComoResultado(chamada, executor));
      }
      messages.push({ role: "user", content: toolResults });
    }

    console.warn(`[${agente.toUpperCase()}] Limite de ${maxIteracoes} iterações de tool use atingido.`);
    emitir(AVISO_MUITAS_ITERACOES);
    return AVISO_MUITAS_ITERACOES;
  } finally {
    logChamadaIA({
      modelo:       MODELO_PRINCIPAL,
      agente,
      inputTokens:  totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheEscritaTokens,
      cacheLeituraTokens,
      latenciaMs:   Date.now() - inicio,
      toolCalls:    toolCallCount,
      ticketId:     opcoes.ticketId ?? null,
    }).catch(console.error);
  }
}
