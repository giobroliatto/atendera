import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

// O cliente da Anthropic e o logger são simulados: os testes não chamam a API nem o banco
const { respostasFila, chamadas, logs } = vi.hoisted(() => ({
  respostasFila: [] as Anthropic.Message[],
  chamadas: [] as Anthropic.MessageStreamParams[],
  logs: [] as Array<Record<string, unknown>>,
}));

vi.mock("../ia/claude", () => ({
  MODELO_PRINCIPAL: "modelo-teste",
  client: {
    messages: {
      stream: (params: Anthropic.MessageStreamParams) => {
        // Guarda uma cópia: o loop continua modificando o array de messages
        chamadas.push({ ...params, messages: [...params.messages] });
        const resposta = respostasFila.shift();
        if (!resposta) throw new Error("nenhuma resposta simulada na fila");
        const textos = resposta.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
        return {
          async *[Symbol.asyncIterator]() {
            for (const t of textos) {
              yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t.text } };
            }
          },
          finalMessage: async () => resposta,
        };
      },
    },
  },
}));

vi.mock("../observabilidade/logger", () => ({
  logChamadaIA: async (params: Record<string, unknown>) => { logs.push(params); },
}));

import { executarLoopAgente, AVISO_LIMITE_TOKENS, AVISO_MUITAS_ITERACOES } from "./loopAgente";

function mensagem(
  stop_reason: Anthropic.StopReason,
  content: Array<Record<string, unknown>>,
  usage = { input_tokens: 100, output_tokens: 10 }
): Anthropic.Message {
  return { id: "msg", type: "message", role: "assistant", model: "modelo-teste", stop_reason, content, usage } as unknown as Anthropic.Message;
}
const texto = (t: string) => ({ type: "text", text: t });
const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });

type Executor = (nome: string, input: Record<string, unknown>) => Promise<unknown>;

function opcoes(executor: Executor = vi.fn(async () => ({ ok: true })), onChunk?: (c: string) => void) {
  return {
    agente: "teste",
    systemFixo: "instruções fixas",
    systemVariavel: "Data de hoje: 23/10/2026.",
    tools: [],
    executor,
    messages: [{ role: "user" as const, content: "pergunta" }],
    maxTokens: 1000,
    onChunk,
  };
}

describe("executarLoopAgente", () => {
  beforeEach(() => {
    respostasFila.length = 0;
    chamadas.length = 0;
    logs.length = 0;
  });

  it("executa as ferramentas pedidas e devolve todos os tool_result numa única mensagem", async () => {
    respostasFila.push(
      mensagem("tool_use", [toolUse("t1", "resumo_tickets", {}), toolUse("t2", "buscar_ticket", { id: 3 })]),
      mensagem("end_turn", [texto("Há 3 tickets abertos.")])
    );
    const executor = vi.fn(async (nome: string) => ({ ferramenta: nome }));

    const resposta = await executarLoopAgente(opcoes(executor));

    expect(resposta).toBe("Há 3 tickets abertos.");
    expect(executor).toHaveBeenCalledTimes(2);
    const segundaChamada = chamadas[1].messages;
    const resultados = segundaChamada[segundaChamada.length - 1];
    expect(resultados.role).toBe("user");
    expect((resultados.content as Anthropic.ToolResultBlockParam[]).map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
    expect(logs[0]).toMatchObject({ agente: "teste", inputTokens: 200, outputTokens: 20, toolCalls: 2 });
  });

  it("ferramenta que falha volta ao modelo como is_error em vez de derrubar o loop", async () => {
    respostasFila.push(
      mensagem("tool_use", [toolUse("t1", "buscar_ticket", { id: 999 })]),
      mensagem("end_turn", [texto("O ticket #999 não existe.")])
    );
    const executor = vi.fn(async () => { throw new Error("Ticket não encontrado."); });

    const resposta = await executarLoopAgente(opcoes(executor));

    expect(resposta).toBe("O ticket #999 não existe.");
    const resultado = (chamadas[1].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0];
    expect(resultado.is_error).toBe(true);
  });

  it("repassa o texto em streaming para onChunk", async () => {
    respostasFila.push(mensagem("end_turn", [texto("Olá!")]));
    const chunks: string[] = [];

    await executarLoopAgente(opcoes(undefined, (c) => chunks.push(c)));

    expect(chunks).toEqual(["Olá!"]);
  });

  it("avisa quando a resposta é cortada pelo limite de tokens", async () => {
    respostasFila.push(mensagem("max_tokens", [texto("| # | Título |")]));
    const chunks: string[] = [];

    const resposta = await executarLoopAgente(opcoes(undefined, (c) => chunks.push(c)));

    expect(resposta).toBe("| # | Título |" + AVISO_LIMITE_TOKENS);
    expect(chunks.at(-1)).toBe(AVISO_LIMITE_TOKENS);
  });

  it("para depois de maxIteracoes chamadas de ferramenta", async () => {
    for (let i = 0; i < 3; i++) respostasFila.push(mensagem("tool_use", [toolUse(`t${i}`, "resumo_tickets", {})]));

    const resposta = await executarLoopAgente({ ...opcoes(), maxIteracoes: 3 });

    expect(resposta).toBe(AVISO_MUITAS_ITERACOES);
    expect(chamadas).toHaveLength(3);
  });

  it("grava o log de custo mesmo quando a chamada falha", async () => {
    respostasFila.push(mensagem("tool_use", [toolUse("t1", "resumo_tickets", {})], { input_tokens: 50, output_tokens: 5 }));
    // segunda chamada: fila vazia → o stream simulado lança erro

    await expect(executarLoopAgente(opcoes())).rejects.toThrow();
    expect(logs[0]).toMatchObject({ inputTokens: 50, outputTokens: 5, toolCalls: 1 });
  });

  it("prompt caching: breakpoint só nas instruções fixas e tokens de cache somados no log", async () => {
    respostasFila.push(
      mensagem("tool_use", [toolUse("t1", "resumo_tickets", {})],
        { input_tokens: 40, output_tokens: 5, cache_creation_input_tokens: 1800, cache_read_input_tokens: 0 } as never),
      mensagem("end_turn", [texto("ok")],
        { input_tokens: 60, output_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 1800 } as never)
    );

    await executarLoopAgente(opcoes());

    expect(chamadas[0].system).toEqual([
      { type: "text", text: "instruções fixas", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Data de hoje: 23/10/2026." },
    ]);
    expect(logs[0]).toMatchObject({ inputTokens: 100, cacheEscritaTokens: 1800, cacheLeituraTokens: 1800 });
  });
});
