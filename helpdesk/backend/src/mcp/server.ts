import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listarTickets, buscarTicketPorId, contarTicketsPorStatus, alterarStatus, alterarPrioridade, adicionarComentario } from "../tools/ticketTools";

// ================================================================
// SERVIDOR MCP DO HELPDESK
//
// Expõe as ferramentas de tickets no padrão MCP, permitindo que
// qualquer host compatível (VS Code Copilot, Claude Desktop, etc.)
// consulte o banco de dados diretamente — sem precisar da interface web.
//
// Transporte: stdio (processo local, comunicação via stdin/stdout)
// Para usar: configure .vscode/mcp.json apontando para este arquivo
// ================================================================

const server = new McpServer({
  name: "atendera",
  version: "1.0.0",
});

// -----------------------------------------------------------------
// TOOL: listar_tickets
// -----------------------------------------------------------------
server.tool(
  "listar_tickets",
  "Lista os tickets do helpdesk com filtros opcionais de status ou prioridade.",
  {
    status: z
      .enum(["aberto", "em_analise", "resolvido", "fechado"])
      .optional()
      .describe("Filtrar por status do ticket"),
    prioridade: z
      .enum(["baixa", "media", "alta", "critica"])
      .optional()
      .describe("Filtrar por prioridade do ticket"),
  },
  async ({ status, prioridade }) => {
    const tickets = await listarTickets({ status, prioridade });
    return {
      content: [{ type: "text", text: JSON.stringify(tickets, null, 2) }],
    };
  }
);

// -----------------------------------------------------------------
// TOOL: buscar_ticket
// -----------------------------------------------------------------
server.tool(
  "buscar_ticket",
  "Busca todos os detalhes de um ticket específico pelo ID, incluindo mensagens.",
  {
    id: z.number().describe("ID numérico do ticket"),
  },
  async ({ id }) => {
    const ticket = await buscarTicketPorId(id);
    if (!ticket) {
      return { content: [{ type: "text", text: `Ticket #${id} não encontrado.` }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
    };
  }
);

// -----------------------------------------------------------------
// TOOL: resumo_tickets
// -----------------------------------------------------------------
server.tool(
  "resumo_tickets",
  "Retorna a contagem de tickets agrupada por status. Útil para ter uma visão geral do sistema.",
  {},
  async () => {
    const resumo = await contarTicketsPorStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(resumo, null, 2) }],
    };
  }
);

// -----------------------------------------------------------------
// TOOL: alterar_status
// HITL: o host deve pedir confirmação antes de invocar esta tool.
// -----------------------------------------------------------------
server.tool(
  "alterar_status",
  "Altera o status de um ticket. Valores válidos: aberto, em_analise, resolvido, fechado. Usar apenas após confirmação explícita do usuário.",
  {
    id: z.number().describe("ID numérico do ticket"),
    status: z
      .enum(["aberto", "em_analise", "resolvido", "fechado"])
      .describe("Novo status do ticket"),
  },
  async ({ id, status }) => {
    const ticket = await alterarStatus(id, status);
    return {
      content: [{ type: "text", text: `Status do ticket #${id} alterado para "${status}".\n${JSON.stringify(ticket, null, 2)}` }],
    };
  }
);

// -----------------------------------------------------------------
// TOOL: alterar_prioridade
// HITL: o host deve pedir confirmação antes de invocar esta tool.
// -----------------------------------------------------------------
server.tool(
  "alterar_prioridade",
  "Altera a prioridade de um ticket. Valores válidos: baixa, media, alta, critica. Usar apenas após confirmação explícita do usuário.",
  {
    id: z.number().describe("ID numérico do ticket"),
    prioridade: z
      .enum(["baixa", "media", "alta", "critica"])
      .describe("Nova prioridade do ticket"),
  },
  async ({ id, prioridade }) => {
    const ticket = await alterarPrioridade(id, prioridade);
    return {
      content: [{ type: "text", text: `Prioridade do ticket #${id} alterada para "${prioridade}".\n${JSON.stringify(ticket, null, 2)}` }],
    };
  }
);

// -----------------------------------------------------------------
// TOOL: adicionar_comentario
// HITL: o host deve confirmar o texto antes de invocar esta tool.
// -----------------------------------------------------------------
server.tool(
  "adicionar_comentario",
  "Adiciona um comentário interno a um ticket. Usar apenas após confirmação do usuário sobre o conteúdo.",
  {
    id: z.number().describe("ID numérico do ticket"),
    conteudo: z.string().describe("Texto do comentário"),
  },
  async ({ id, conteudo }) => {
    const comentario = await adicionarComentario(id, conteudo);
    return {
      content: [{ type: "text", text: `Comentário adicionado ao ticket #${id}.\n${JSON.stringify(comentario, null, 2)}` }],
    };
  }
);

// -----------------------------------------------------------------
// Inicia o servidor com transporte stdio
// VS Code/Claude Desktop vai spawnar este processo e conversar
// com ele via stdin/stdout usando o protocolo MCP (JSON-RPC)
// -----------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Não printa nada no stdout — apenas o protocolo MCP passa por lá
  // Logs vão para stderr para não poluir a comunicação
  process.stderr.write("Servidor MCP do Atendera iniciado (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`Erro fatal no servidor MCP: ${err.message}\n`);
  process.exit(1);
});
