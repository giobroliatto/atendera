import "dotenv/config";
import prisma from "../db/prisma";
import { gerarEmbedding } from "../rag/embeddings";
import { ARTIGOS_BASE_CONHECIMENTO } from "../rag/artigos";

// Recria a base de conhecimento do RAG gerando o embedding de cada artigo.
// Na primeira execução, o modelo de embeddings é baixado (~80 MB) e fica em cache.
// Uso: npm run kb:popular
export async function popularBaseConhecimento(): Promise<number> {
  // Gera todos os vetores ANTES de mexer no banco: se o modelo falhar no meio,
  // a base antiga continua intacta
  const registros = [];
  for (const artigo of ARTIGOS_BASE_CONHECIMENTO) {
    // Título junto do conteúdo melhora a busca por assunto
    const embedding = await gerarEmbedding(`${artigo.titulo}. ${artigo.conteudo}`);
    registros.push({ titulo: artigo.titulo, conteudo: artigo.conteudo, embedding: JSON.stringify(embedding) });
    console.log(`✓ ${artigo.titulo}`);
  }

  await prisma.$transaction([
    prisma.baseConhecimento.deleteMany({}),
    prisma.baseConhecimento.createMany({ data: registros }),
  ]);
  return registros.length;
}

if (require.main === module) {
  popularBaseConhecimento()
    .then((total) => console.log(`\n✅ Base de conhecimento populada com ${total} artigos.`))
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
