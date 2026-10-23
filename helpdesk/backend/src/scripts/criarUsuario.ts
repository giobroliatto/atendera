import "dotenv/config";
import prisma from "../db/prisma";
import { gerarHashSenha } from "../auth/senha";

// Cria (ou atualiza a senha de) um usuário do helpdesk.
// Uso: npm run usuario:criar -- "Nome Completo" email@empresa.com senha
async function main() {
  const [nome, emailBruto, senha] = process.argv.slice(2);
  if (!nome || !emailBruto || !senha) {
    console.error('Uso: npm run usuario:criar -- "Nome Completo" email@empresa.com senha');
    process.exit(1);
  }
  if (senha.length < 8) {
    console.error("A senha deve ter pelo menos 8 caracteres.");
    process.exit(1);
  }

  const email = emailBruto.trim().toLowerCase();
  const senhaHash = await gerarHashSenha(senha);
  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: { nome, senhaHash },
    create: { nome, email, senhaHash },
  });
  console.log(`✅ Usuário pronto: #${usuario.id} ${usuario.nome} <${usuario.email}>`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
