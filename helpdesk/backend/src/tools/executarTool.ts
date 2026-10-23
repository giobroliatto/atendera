import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";

// ================================================================
// EXECUÇÃO SEGURA DE TOOLS
//
// Se uma ferramenta falhar (ticket inexistente, argumento inválido...),
// o erro NÃO deve derrubar a resposta inteira. Em vez disso, devolvemos
// um tool_result com is_error: true — o Claude lê a mensagem de erro e
// explica ao usuário o que aconteceu (ex: "o ticket #999 não existe").
// ================================================================

function mensagemDeErro(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: registro não encontrado no update | P2003: FK inválida (ticket inexistente)
    if (err.code === "P2025" || err.code === "P2003") return "Ticket não encontrado.";
  }
  return err instanceof Error ? err.message : String(err);
}

export async function executarToolComoResultado(
  block: Anthropic.ToolUseBlock,
  executor: (nome: string, input: Record<string, unknown>) => Promise<unknown>
): Promise<Anthropic.ToolResultBlockParam> {
  try {
    const resultado = await executor(block.name, block.input as Record<string, unknown>);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify(resultado),
    };
  } catch (err) {
    const mensagem = mensagemDeErro(err);
    console.warn(`[TOOL] Erro em ${block.name}(${JSON.stringify(block.input)}): ${mensagem}`);
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Erro ao executar ${block.name}: ${mensagem}`,
      is_error: true,
    };
  }
}
