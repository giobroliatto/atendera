// Base de conhecimento de exemplo: artigos de suporte de TI usados pelo RAG.
// Cada artigo vira um vetor de 384 dimensões que representa seu SIGNIFICADO.
// Quando o usuário perguntar algo parecido, o sistema encontra o artigo automaticamente.
export const ARTIGOS_BASE_CONHECIMENTO: Array<{ titulo: string; conteudo: string }> = [
  {
    titulo: "Reset de senha - Active Directory",
    conteudo: "Para redefinir sua senha de rede: 1) Acesse o portal de TI em ti.empresa.com/reset 2) Informe seu CPF e e-mail corporativo 3) Você receberá um link em até 2 minutos. Se não receber, verifique o spam. 4) A nova senha deve ter ao menos 8 caracteres, uma letra maiúscula e um número. 5) Em caso de bloqueio de conta, entre em contato com ti@empresa.com ou abra um ticket com urgência.",
  },
  {
    titulo: "Impressora offline - diagnóstico e solução",
    conteudo: "Passos para resolver impressora offline: 1) Verifique se a impressora está ligada, com papel e sem mensagem de erro no display. 2) No Windows: Painel de Controle > Dispositivos e Impressoras > clique com botão direito > Definir como impressora padrão. 3) Cancele todos os trabalhos na fila de impressão. 4) Reinicie o serviço: Win+R > services.msc > Print Spooler > botão direito > Reiniciar. 5) Se ainda offline, desconecte e reconecte o cabo USB ou reconecte ao Wi-Fi da impressora.",
  },
  {
    titulo: "VPN não conecta - troubleshooting",
    conteudo: "Quando a VPN não conecta: 1) Confirme que você tem conexão normal com a internet. 2) Verifique se o cliente VPN está na versão mais recente (v5.6.2) — disponível em intranet/ti/vpn. 3) Seu certificado digital pode ter expirado: acesse o portal de certificados e renove. 4) Tente reconectar em outro horário — o servidor VPN tem manutenção às terças das 22h-23h. 5) Se o erro for 'Authentication failed', sua senha do AD pode ter expirado. 6) Logs do cliente VPN ficam em C:\\Users\\{usuario}\\AppData\\Local\\VPN\\logs.",
  },
  {
    titulo: "E-mail não sincroniza no celular",
    conteudo: "Para configurar e-mail corporativo no celular: Protocolo IMAP — servidor: mail.empresa.com, porta: 993, SSL: sim. Protocolo SMTP — servidor: mail.empresa.com, porta: 587, STARTTLS: sim. Use seu login de rede (sem @empresa.com) e senha do AD. Se aparecer erro de certificado SSL, aceite o certificado corporativo. No iPhone: Ajustes > Mail > Contas > Adicionar conta > Exchange > preencha com seu e-mail completo. No Android: Gmail > Adicionar conta > Exchange e Office 365.",
  },
  {
    titulo: "Computador lento - diagnóstico",
    conteudo: "Para diagnosticar lentidão no computador: 1) Gerenciador de Tarefas (Ctrl+Shift+Esc): verifique qual processo está consumindo mais CPU ou RAM. 2) Espaço em disco: Se C: tiver menos de 10% livre, o Windows fica muito lento — esvazie a Lixeira e mova arquivos para a pasta de rede (Z:). 3) Inicialização lenta: no Gerenciador de Tarefas, aba Inicializar, desative programas desnecessários. 4) Antivírus em execução: varreduras agendadas causam lentidão — verifique se não está rodando em horário comercial. 5) Reinicie o computador ao menos uma vez por semana.",
  },
  {
    titulo: "Acesso negado a sistema interno",
    conteudo: "Para solicitar acesso a sistemas ou pastas de rede: 1) Acesse o Portal de TI > Solicitações > Novo Acesso. 2) Selecione o sistema ou pasta que precisa acessar. 3) Indique seu gestor imediato para aprovar. 4) Prazo: 1 dia útil após aprovação do gestor. 5) Sistemas financeiros (SAP, ERP financeiro) exigem aprovação adicional da diretoria financeira. 6) Acessos temporários (ex: projeto específico) devem indicar a data de expiração. 7) Nunca compartilhe credenciais — cada usuário deve ter seu próprio acesso.",
  },
  {
    titulo: "Áudio não funciona no Microsoft Teams",
    conteudo: "Problemas de áudio nas reuniões do Teams: 1) Durante a reunião: clique nos três pontos (...) > Configurações de dispositivo > selecione o microfone e alto-falante corretos. 2) Se o headset não aparecer, desconecte e reconecte o dispositivo. 3) Reinstale os drivers de áudio: Gerenciador de Dispositivos > Som, vídeo e controles de jogo > botão direito no dispositivo > Atualizar driver. 4) No Teams Desktop, vá em Configurações > Dispositivos e teste os dispositivos. 5) Alternativa: use o Teams Web no Chrome, que utiliza as configurações de áudio do sistema.",
  },
  {
    titulo: "Recuperar arquivo apagado ou perdido",
    conteudo: "Para recuperar arquivos deletados: 1) Primeiro verifique a Lixeira do Windows. 2) Arquivos em pastas de rede (Z:, Y:, pastas mapeadas): temos backup diário. Abra um ticket informando o caminho completo do arquivo e a data aproximada em que existia. Recuperamos em até 4 horas. 3) Arquivos salvos apenas no C: (desktop local, Documentos local): NÃO temos backup. 4) Recomendação: SEMPRE salve documentos de trabalho nas pastas de rede mapeadas, nunca apenas no desktop ou Documentos local.",
  },
  {
    titulo: "Monitor sem imagem ou sinal",
    conteudo: "Monitor não exibe imagem: 1) Verifique se o cabo de vídeo (HDMI, DisplayPort ou VGA) está bem encaixado nos dois lados. 2) Se houver dois conectores disponíveis no computador (ex: placa de vídeo dedicada e saída integrada), tente o outro. 3) Ligue e desligue o monitor pelo botão físico. 4) Pressione Win+P para alternar o modo de exibição (só PC, Duplicar, Estender, Somente segundo monitor). 5) Teste o monitor em outro computador para descartar defeito no hardware do monitor. 6) Reinicie o computador com o monitor conectado.",
  },
  {
    titulo: "Instalar ou atualizar software",
    conteudo: "Para instalar programas no computador corporativo: 1) Acesse o Portal de Software em intranet/ti/software — programas aprovados (Chrome, Firefox, 7-Zip, VLC, etc.) podem ser instalados sem chamado de TI. 2) Para softwares não listados: abra um ticket com o nome do programa, versão, link de download e justificativa de negócio. 3) Prazo de análise e instalação: 2 dias úteis. 4) Não instale softwares de fontes desconhecidas — o antivírus pode bloquear e o acesso ao sistema pode ser suspenso por política de segurança. 5) Atualizações do Windows e antivírus são automáticas e ocorrem fora do horário comercial.",
  },
];
