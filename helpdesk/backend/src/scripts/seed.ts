import "dotenv/config";
import prisma from "../db/prisma";
import { popularBaseConhecimento } from "./popularBaseConhecimento";

// ================================================================
// SEED — dados de exemplo para explorar o sistema
//
// 1. Tickets de exemplo, já analisados (só se ainda não houver tickets)
// 2. Base de conhecimento do RAG (10 artigos de TI)
//
// As análises dos tickets são exemplos escritos à mão, para a tela não
// começar vazia. Crie um ticket novo para ver o agente automático de verdade.
// Uso: npm run db:seed
// ================================================================

const horasAtras = (horas: number) => new Date(Date.now() - horas * 3600 * 1000);

const TICKETS_EXEMPLO = [
  {
    titulo: "Solicitar monitor adicional",
    descricao: "Gostaria de um segundo monitor para trabalhar com planilhas grandes.",
    status: "fechado", prioridade: "baixa", categoria: "ti", criadoEm: horasAtras(120),
    sugestaoIA: "Abrir solicitação de compra com justificativa de produtividade. Aprovação sujeita ao orçamento do setor.",
  },
  {
    titulo: "Reembolso de despesas de viagem pendente",
    descricao: "Enviei os comprovantes da viagem a Curitiba há 20 dias e o reembolso ainda não caiu.",
    status: "resolvido", prioridade: "media", categoria: "financeiro", criadoEm: horasAtras(72),
    sugestaoIA: "Verificar se a solicitação foi aprovada pelo gestor no sistema de despesas e confirmar a data do próximo lote de pagamentos.",
  },
  {
    titulo: "Erro no cálculo de férias no holerite",
    descricao: "O valor do 1/3 de férias veio menor do que o esperado no holerite de outubro.",
    status: "aberto", prioridade: "media", categoria: "rh", criadoEm: horasAtras(30),
    sugestaoIA: "Conferir a base de cálculo usada pela folha (média de horas extras) e, se houver diferença, lançar o complemento na próxima folha.",
  },
  {
    titulo: "Impressora do 3º andar offline",
    descricao: "A impressora aparece como offline para todo mundo do 3º andar. Já reiniciei.",
    status: "aberto", prioridade: "media", categoria: "ti", criadoEm: horasAtras(26),
    sugestaoIA: "Reiniciar o serviço Print Spooler e limpar a fila de impressão. Se continuar offline, reconectar a impressora ao Wi-Fi.",
  },
  {
    titulo: "VPN não conecta em home office",
    descricao: "Aparece 'Authentication failed' ao conectar na VPN. Troquei a senha ontem.",
    status: "aberto", prioridade: "alta", categoria: "ti", criadoEm: horasAtras(5),
    sugestaoIA: "A senha do AD foi trocada recentemente: atualizar a credencial salva no cliente VPN (v5.6.2). Se persistir, renovar o certificado digital no portal.",
  },
  {
    titulo: "Servidor de arquivos fora do ar",
    descricao: "Ninguém do financeiro consegue acessar a pasta Z: desde as 8h. O fechamento do mês depende desses arquivos.",
    status: "aberto", prioridade: "critica", categoria: "ti", criadoEm: horasAtras(3),
    sugestaoIA: "Verificar o serviço de compartilhamento e o espaço em disco do servidor de arquivos. Restaurar o acesso pela réplica de backup enquanto a causa é investigada.",
    raciocinioIA: "Afeta um setor inteiro (financeiro) e bloqueia um processo crítico de negócio com prazo (fechamento do mês). Não há workaround: os arquivos só existem no servidor. Bloqueio total de trabalho, então a prioridade é crítica.",
  },
];

async function main() {
  if ((await prisma.ticket.count()) > 0) {
    console.log("Já existem tickets no banco: tickets de exemplo não foram criados.");
  } else {
    for (const ticket of TICKETS_EXEMPLO) await prisma.ticket.create({ data: ticket });
    console.log(`✅ ${TICKETS_EXEMPLO.length} tickets de exemplo criados.`);
  }

  try {
    console.log("\nPopulando a base de conhecimento (na primeira vez, baixa o modelo de embeddings)...");
    const total = await popularBaseConhecimento();
    console.log(`✅ Base de conhecimento populada com ${total} artigos.`);
  } catch (err) {
    // Sem internet no primeiro download, o resto do sistema funciona normalmente (só sem RAG)
    console.warn(`⚠️  Base de conhecimento não populada: ${err instanceof Error ? err.message : err}`);
    console.warn("   Rode `npm run kb:popular` quando tiver acesso a huggingface.co.");
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
