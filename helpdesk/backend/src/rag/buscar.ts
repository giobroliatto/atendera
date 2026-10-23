import prisma from "../db/prisma";
import { gerarEmbedding } from "./embeddings";

// ================================================================
// BUSCA POR SIMILARIDADE (RAG — Passo 2)
//
// Dado uma pergunta do usuário:
// 1. Gera o embedding da pergunta
// 2. Carrega todos os artigos da base de conhecimento
// 3. Calcula a similaridade de cosseno entre a pergunta e cada artigo
// 4. Retorna os topK mais similares (acima de um threshold mínimo)
// ================================================================

export interface ResultadoBusca {
  titulo: string;
  conteudo: string;
  similaridade: number;
}

// Similaridade de cosseno: mede o ângulo entre dois vetores.
// Resultado 1.0 = idênticos, 0.0 = sem relação, -1.0 = opostos
// Para textos normalizados, fica sempre entre 0 e 1.
function similaridadeCosseno(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function buscarConhecimentoRelevante(
  pergunta: string,
  topK = 3,
  threshold = 0.35   // só retorna artigos com similaridade >= 35%
): Promise<ResultadoBusca[]> {
  const entradas = await prisma.baseConhecimento.findMany();
  if (entradas.length === 0) return [];

  // O RAG é um complemento: se o modelo de embeddings não carregar (sem internet
  // no primeiro download, por exemplo), o agente segue respondendo sem contexto extra
  // em vez de a requisição inteira falhar.
  let embeddingPergunta: number[];
  try {
    embeddingPergunta = await gerarEmbedding(pergunta);
  } catch (err) {
    console.warn(`[RAG] Busca ignorada, falha ao gerar embedding: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  const comSimilaridade = entradas.map((e) => ({
    titulo: e.titulo,
    conteudo: e.conteudo,
    similaridade: similaridadeCosseno(
      embeddingPergunta,
      JSON.parse(e.embedding) as number[]
    ),
  }));

  return comSimilaridade
    .sort((a, b) => b.similaridade - a.similaridade)
    .slice(0, topK)
    .filter((e) => e.similaridade >= threshold);
}
