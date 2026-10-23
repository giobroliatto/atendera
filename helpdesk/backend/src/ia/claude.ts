import Anthropic from "@anthropic-ai/sdk";

// ================================================================
// CLIENTE E MODELOS DA ANTHROPIC — um lugar só
//
// Todos os agentes usam este cliente. Para trocar de modelo, basta
// definir ANTHROPIC_MODEL no .env (sem mexer no código).
// ================================================================

export const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Modelo dos agentes automático, interativo e de relatórios
export const MODELO_PRINCIPAL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Modelo do classificador do orquestrador: a tarefa é escolher entre 3 palavras,
// então um modelo pequeno basta — mais rápido e bem mais barato que o principal
export const MODELO_CLASSIFICADOR = process.env.ANTHROPIC_MODEL_CLASSIFICADOR || "claude-haiku-5-5";
