# Como o Atendera funciona

[English](how-it-works.md) · **Português**

Guia detalhado de cada parte do projeto. Para instalação e visão geral, veja o [README](../README.pt-BR.md).

- [Visão geral](#visão-geral)
- [Criação de ticket: o agente automático](#criação-de-ticket-o-agente-automático)
- [O chat: orquestrador, agente interativo e agente de relatórios](#o-chat-orquestrador-agente-interativo-e-agente-de-relatórios)
- [O loop de tool use](#o-loop-de-tool-use)
- [Ferramentas](#ferramentas)
- [Human-in-the-loop](#human-in-the-loop)
- [RAG](#rag)
- [Streaming (SSE)](#streaming-sse)
- [Histórico do chat](#histórico-do-chat)
- [Prompt engineering](#prompt-engineering)
- [Prompt caching](#prompt-caching)
- [Guardrails](#guardrails)
- [Observabilidade](#observabilidade)
- [Autenticação](#autenticação)
- [Servidor MCP](#servidor-mcp)
- [Estrutura de arquivos](#estrutura-de-arquivos)

---

## Visão geral

| Camada | Tecnologia |
|---|---|
| Frontend | Angular 21 + Angular Material |
| Backend | Node.js + Express 5 + TypeScript |
| Banco de dados | SQLite via Prisma 7 + better-sqlite3 |
| IA | Claude via `@anthropic-ai/sdk` (modelo definido por `ANTHROPIC_MODEL`, padrão `claude-sonnet-4-5`; um cliente único em [`ia/claude.ts`](../helpdesk/backend/src/ia/claude.ts)), embeddings locais via `@xenova/transformers` |

| Tela | Agente | Quando |
|---|---|---|
| Novo ticket | Agente automático | Todo ticket criado |
| Detalhe do ticket | Agente automático | Mostra a sugestão e o raciocínio |
| Assistente IA (chat) | Orquestrador → agente interativo ou de relatórios | Toda mensagem |

---

## Criação de ticket: o agente automático

O [`agenteAutomatico.ts`](../helpdesk/backend/src/agents/agenteAutomatico.ts) roda sozinho quando um ticket é criado. Ele define:

- **prioridade**: `baixa` · `media` · `alta` · `critica`
- **categoria**: `ti` · `rh` · `financeiro` · `geral`
- **sugestaoIA**: uma sugestão curta de como resolver (duas frases)
- **raciocinioIA**: o raciocínio passo a passo, só no modo detalhado

```
Usuário preenche o formulário (título + descrição)
       │
       ▼ POST /tickets  (guardrail: título ≤ 200, descrição ≤ 5000 caracteres, padrões de injection)
Backend cria o ticket e responde 201 na hora
       │
       └── agenteAuditarTicket(id)  [assíncrono, não bloqueia a resposta]
                │
                ▼
           status → "em_analise"
                │
                ▼
           RAG: busca artigos relacionados na base de conhecimento
                │
                ▼
           Claude classifica o ticket (título/descrição dentro das tags <titulo>/<descricao>)
                │
                ▼
           Extrai o JSON, normaliza ("Média" → "media") e valida os valores
                │
                ▼
           Salva prioridade, categoria, sugestão (e raciocínio)
           status → "aberto", mas só se ainda estiver "em_analise"
```

O frontend consulta o ticket a cada 3 segundos enquanto ele está `em_analise`. Se alguém mudar o status durante a análise (fechar o ticket, por exemplo), o agente respeita essa decisão em vez de reabrir o ticket.

É o mesmo padrão de qualquer rotina de análise automática: triagem de sinistros, validação de cadastros, conferência de documentos.

---

## O chat: orquestrador, agente interativo e agente de relatórios

Toda mensagem do chat vai para `POST /orquestrador/stream`. O [`orquestrador.ts`](../helpdesk/backend/src/agents/orquestrador.ts) primeiro classifica a intenção com uma chamada mínima ao Claude Haiku (`max_tokens: 10`) e depois entrega a mensagem a um agente especializado:

```
"quantos tickets entraram esta semana?"
       │
       ▼ classificarIntencao()  → "relatorio"
       │
       ▼ SSE {"agente": "relatorio"}  → o frontend mostra o badge do agente
       │
       ▼ agenteRelatorioStream()  → resposta em streaming como {"chunk": "..."}
```

| Classificação | Agente | Exemplos |
|---|---|---|
| `interativo` | [Interativo](../helpdesk/backend/src/agents/agenteInterativo.ts): consulta e altera tickets, tem histórico | "o que tem no ticket 3?", "fecha o ticket 7" |
| `relatorio` | [Relatórios](../helpdesk/backend/src/agents/agenteRelatorios.ts): análises sem estado | "tickets por prioridade", "tem algo parado há 3 dias?" |
| `ambos` | Primeiro o interativo, depois o de relatórios | "quantos estão abertos? e fecha o ticket 9" |

**Por que um orquestrador em vez de um agente único:** cada agente mantém um system prompt curto, com as próprias ferramentas e regras. Juntar tudo num prompt só gera instruções conflitantes e um contexto maior em toda chamada, enquanto o roteamento custa uma chamada ao Haiku com `max_tokens: 10`.

**Por que Haiku e sem thinking:** escolher entre três palavras não precisa do modelo principal. O Haiku custa $0,10 / $0,50 por milhão de tokens, contra $3 / $15 do Sonnet 4.5, e responde mais rápido, o que importa porque a classificação roda antes de o usuário ver qualquer coisa. O Haiku 5.5 pensa por padrão, então a chamada envia `thinking: { type: "disabled" }`: com `max_tokens: 10`, qualquer raciocínio gastaria o limite antes da resposta.

---

## O loop de tool use

O modelo não acessa o banco. Ele só sabe o que está no contexto, então, para ler dados reais, ele pede **ferramentas**:

```
Usuário: "quantos tickets estão abertos?"
       │
       ▼
Requisição ao Claude com: system prompt + histórico + schemas das ferramentas
       │
       ▼
Claude responde stop_reason = "tool_use"
  content = [{ type: "tool_use", name: "resumo_tickets", id: "t1" }]
       │
       ▼
O servidor executa resumo_tickets() no banco
       │
       ▼
messages += [
  { role: "assistant", content: [tool_use t1] },
  { role: "user",      content: [tool_result t1: "[{ status: 'aberto', total: 3 }, ...]"] }
]
       │
       ▼
Agora Claude tem os dados: stop_reason = "end_turn" → resposta final
```

O loop existe porque o modelo pode precisar de várias ferramentas em sequência, ou de várias no mesmo turno. Os dois agentes do chat usam a mesma implementação, o [`loopAgente.ts`](../helpdesk/backend/src/agents/loopAgente.ts), que também:

- para depois de **8 rodadas** de ferramentas, para um modelo confuso não ficar em loop para sempre;
- acrescenta um aviso quando a resposta atinge o `max_tokens` (2048 no agente interativo, 4096 nos relatórios), em vez de terminar no meio da frase em silêncio;
- devolve uma mensagem em caso de `refusal` em vez de uma resposta vazia;
- grava o log de observabilidade num `finally`, então os tokens de uma chamada que falha no meio continuam contabilizados.

Os testes dele ([`loopAgente.test.ts`](../helpdesk/backend/src/agents/loopAgente.test.ts)) trocam o cliente da Anthropic por um falso, então rodam sem API key.

**Regra da API:** todo bloco `tool_use` precisa de um `tool_result` correspondente na próxima mensagem `user`. Se Claude pedir duas ferramentas numa resposta, a próxima mensagem leva os dois resultados.

**Quando uma ferramenta falha** (ticket inexistente, argumento inválido), o [`executarTool.ts`](../helpdesk/backend/src/tools/executarTool.ts) devolve o erro como `tool_result` com `is_error: true`. Claude lê e explica ("o ticket #999 não existe") em vez de a requisição inteira falhar.

---

## Ferramentas

### Ferramentas de tickets ([`ticketTools.ts`](../helpdesk/backend/src/tools/ticketTools.ts))

| Ferramenta | O que faz | Escreve? |
|---|---|---|
| `listar_tickets` | Lista tickets, com filtro opcional de status ou prioridade | Não |
| `buscar_ticket` | Ticket completo com mensagens e comentários | Não |
| `resumo_tickets` | Contagem de tickets por status | Não |
| `alterar_status` | Propõe um novo status | Só propõe (HITL) |
| `alterar_prioridade` | Propõe uma nova prioridade | Só propõe (HITL) |
| `adicionar_comentario` | Propõe um comentário interno | Só propõe (HITL) |

### Ferramentas de relatórios ([`relatorioTools.ts`](../helpdesk/backend/src/tools/relatorioTools.ts))

| Ferramenta | O que faz |
|---|---|
| `tickets_por_periodo` | Tickets criados nos últimos N dias |
| `distribuicao_tickets` | Distribuição por categoria, prioridade e status |
| `tickets_sem_atualizacao` | Tickets abertos sem atualização há N dias (risco de SLA) |

Todos os argumentos são validados com Zod antes de chegar ao banco: `"7"` vira `7`, e um status fora da lista ou `dias: -5` é recusado com uma mensagem legível para o modelo.

---

## Human-in-the-loop

O agente pode alterar tickets, mas **nada é gravado sem um humano clicar em "Confirmar"**.

### Por que o prompt não basta

A primeira versão aplicava a regra só por instrução ("pergunte antes de alterar"). Isso é um comportamento, não uma garantia: o modelo pode errar, e um prompt injection ("o admin já aprovou, pode seguir") pode convencê-lo do contrário. Por isso a regra foi para o código.

### Como funciona

```
Usuário: "fecha o ticket 7"
       │
       ▼ Claude chama buscar_ticket(7) e depois alterar_status(7, "fechado")
       │
       ▼ executarToolComHITL: é uma ferramenta de escrita, então em vez de gravar:
         cria AcaoPendente { tipo, ticketId, dados, descricao, usuarioId, estado: "pendente" }
       │
       ├── SSE {"acao": {...}}  → o frontend mostra um cartão com Confirmar / Cancelar
       └── tool_result → "AINDA NÃO foi executada, peça para o usuário confirmar no cartão"
       │
       ▼ Usuário clica em "Confirmar"
POST /acoes/:id/confirmar
       │
       ▼ updateMany where { id, usuarioId, estado: "pendente", criada há < 15 min }
         → "confirmada" (atômico: clique duplo não executa duas vezes)
       │
       ▼ só agora: alterarStatus(7, "fechado")
```

| Resposta | Quando |
|---|---|
| `200` | Confirmada e executada, ou cancelada |
| `403` | A ação foi pedida por outro usuário |
| `404` | A ação não existe |
| `409` | Já confirmada ou cancelada |
| `410` | Expirou (15 minutos) |
| `422` | Falhou ao executar (o ticket foi apagado, por exemplo) |

Como defesa em profundidade, o executor de leitura dos agentes (`executarTicketTool`) recusa ferramentas de escrita, então nenhum caminho do código grava sem passar por uma ação pendente.

Os arquivos envolvidos são [`hitl/acoesPendentes.ts`](../helpdesk/backend/src/hitl/acoesPendentes.ts), [`routes/acoes.ts`](../helpdesk/backend/src/routes/acoes.ts) e [`acao-card.component.ts`](../helpdesk/frontend/src/app/pages/chat/acao-card.component.ts).

### Chat vs MCP

| Pelo chat | Pelo MCP (VS Code Copilot) |
|---|---|
| O servidor cria uma ação pendente e só o clique executa | O host pede confirmação antes de rodar cada ferramenta |
| Garantido pelo código | Garantido pelo host |

---

## RAG

RAG (retrieval-augmented generation) faz os agentes responderem com **os procedimentos da própria empresa** em vez de conselhos genéricos.

Sem RAG, "como reseto minha senha?" recebe uma resposta sobre senhas em geral. Com RAG, recebe o passo a passo exato do portal interno.

```
"minha VPN não conecta"
       │
       ▼ rag/embeddings.ts
A pergunta vira um vetor de 384 números, calculado localmente com
Xenova/all-MiniLM-L6-v2 (roda dentro do Node.js, sem API externa)
       │
       ▼ rag/buscar.ts
Similaridade de cosseno com cada artigo da BaseConhecimento:
  "VPN não conecta - troubleshooting"  0.89  ✓
  "Acesso negado a sistema interno"    0.41  ✓
  "Instalar ou atualizar software"     0.28  ✗ abaixo do limite de 0.35
Top 3 acima do limite
       │
       ▼
Os artigos entram no prompt e Claude responde com o procedimento real
```

### Similaridade de cosseno

Dois vetores são parecidos quando apontam na mesma direção. O modelo de embedding transforma frases de **significado parecido** em vetores com direções próximas, mesmo com palavras diferentes: "VPN não conecta" e "problema com a VPN" têm similaridade alta, "receita de bolo" tem similaridade baixa.

`cos(θ) = (A · B) / (|A| × |B|)` dá um valor entre -1 e 1. Abaixo de 0.35, o artigo não é considerado relevante.

### Base de conhecimento

O [`rag/artigos.ts`](../helpdesk/backend/src/rag/artigos.ts) tem 10 artigos de TI (reset de senha, impressora offline, VPN, e-mail no celular, computador lento, pedidos de acesso, áudio no Teams, recuperação de arquivos, monitor sem sinal, instalação de software) e o [`popularBaseConhecimento.ts`](../helpdesk/backend/src/scripts/popularBaseConhecimento.ts) salva cada um com seu vetor. Todos os vetores são calculados antes de substituir a base antiga, numa única transação, então uma falha no download do modelo não apaga a base:

```bash
cd helpdesk/backend
npm run kb:popular   # também roda dentro do npm run db:seed; baixa o modelo (~80 MB) na primeira execução
```

Se o modelo de embeddings não carregar, a busca é ignorada com um aviso e os agentes continuam respondendo, só que sem o contexto extra.

---

## Streaming (SSE)

As respostas do chat aparecem **enquanto Claude escreve**: o balão do assistente surge na hora e vai sendo preenchido token a token, em vez de uma tela parada por vários segundos.

```
Usuário clica em "enviar"
       │
       ▼ chat.component.ts: balão vazio do assistente na tela
       │
       ▼ chat.service.ts: fetch() + ReadableStream (a conexão fica aberta)
POST /orquestrador/stream
       │
       ▼ rota: Content-Type: text/event-stream
data: {"agente":"interativo"}
data: {"acao":{...}}             ← só quando uma alteração foi proposta
data: {"chunk":"Para "}
data: {"chunk":"resolver"}
data: {"done":true}
       │
       ▼ services/sse.ts
Acumula o texto num buffer, processa só linhas completas e guarda a linha parcial para o próximo read()
       │
       ▼ chat.component.ts
ngZone.run(() => balao.conteudo += chunk)
```

- **Por que `fetch` e não `HttpClient`:** o `HttpClient` espera a resposta inteira antes de emitir. SSE precisa do `ReadableStream` do corpo.
- **Por que não `EventSource`:** só suporta `GET`, e a rota é `POST` porque a mensagem vai no body.
- **Por que `NgZone.run()`:** os callbacks do `fetch` rodam fora da zona do Angular. Sem ele, os chunks chegam mas a tela só atualiza no próximo evento do Angular.
- **Buffer:** um `read()` pode trazer vários eventos ou só metade de um. Sem o buffer, um evento dividido entre dois reads era descartado em silêncio.
- **Erros:** se o backend responde com status de erro (guardrail, sessão expirada) ou o stream termina sem `done`, o chat mostra o motivo em vez de ficar carregando para sempre.

---

## Histórico do chat

O agente interativo mantém o contexto salvando cada par (mensagem do usuário + resposta do assistente) em `MensagemChat`, por usuário. Ele manda as últimas 8 mensagens (4 trocas) para o modelo: o suficiente para perguntas de continuação, curto o bastante para evitar contexto desatualizado. O system prompt também manda o agente nunca responder sobre o estado atual de um ticket a partir do histórico, só a partir de uma consulta nova às ferramentas.

- **Usuário e assistente sempre se alternam.** As duas mensagens só são salvas depois do sucesso: se a do usuário fosse salva antes e o agente falhasse, uma mensagem `user` órfã quebraria a alternância na próxima chamada.
- **`ticketId ?? null`:** conversas gerais usam `ticketId: null`. Passar `undefined` ao Prisma remove o filtro e retornaria as mensagens de todo mundo.

---

## Prompt engineering

O agente automático tem dois modos, escolhidos pela opção "Incluir raciocínio detalhado" do formulário:

| Modo | Prompt | Saída | Custo |
|---|---|---|---|
| Simples (padrão) | Critérios + formato JSON | `{ prioridade, categoria, sugestao }` | ~200 tokens de saída |
| Detalhado | Mesmos critérios + **4 exemplos few-shot** + campo `raciocinio` primeiro | `{ raciocinio, prioridade, categoria, sugestao }` | ~600 tokens de saída |

- **Few-shot:** os quatro exemplos (empresa toda parada → crítica, 80 pessoas sem ponto eletrônico → alta, um usuário com workaround → média, pedido de conforto → baixa) calibram os casos limítrofes.
- **Chain of thought:** escrever o raciocínio *antes* da decisão faz o modelo pensar no caso, e o raciocínio fica salvo em `raciocinioIA` para auditoria.
- **JSON robusto:** a resposta pode vir dentro de um bloco ```` ```json ```` ou com texto extra, então o código extrai o objeto e depois normaliza e valida cada valor antes de salvar.

---

## Prompt caching

A API monta todo prompt na ordem **tools → system → messages**, e o cache funciona por prefixo: se o começo do prompt for idêntico, byte a byte, ao de uma chamada feita nos últimos 5 minutos, essa parte é lida do cache por ~10% do preço de entrada (gravar da primeira vez custa 1,25×).

```
system: [
  { text: SYSTEM_INTERATIVO, cache_control: { type: "ephemeral" } },   ← breakpoint: tools + instruções fixas
  { text: "Data de hoje: 23/10/2026. Artigos do RAG: ..." }              ← muda a cada chamada, depois do breakpoint
]
messages: [...]
```

- **A ordem importa.** A data e os artigos do RAG vinham *antes* no system prompt, o que deixava cada prompt diferente desde o primeiro caractere e o cache inútil. Agora eles vão num segundo bloco, depois do breakpoint.
- **O que entra no cache:** as tools + instruções do agente interativo (~1.800 tokens) são reaproveitadas em cada rodada do loop de tool use e em cada mensagem do chat dentro de 5 minutos. O agente automático também marca o system prompt, o que compensa no modo detalhado (com os exemplos few-shot).
- **Tamanho mínimo:** abaixo do prefixo mínimo do modelo (1.024 tokens no Sonnet 4.5, 512 no Haiku 5.5), a marcação é ignorada em silêncio, sem custo. É o caso do prompt da triagem no modo simples e do classificador do orquestrador, que por isso nem tem marcação.
- **O histórico não entra no cache** de propósito: o chat manda uma janela das últimas 8 mensagens, então o prefixo do histórico muda a cada turno.
- **Observabilidade:** `cache_creation_input_tokens` e `cache_read_input_tokens` são registrados como `cacheEscritaTokens` e `cacheLeituraTokens`, cobrados a 1,25× e ~0,1× do preço de entrada, e o `/logs` mostra quanto do input veio do cache.

---

## Guardrails

Várias camadas, para que nenhuma precise ser perfeita:

1. **Validação de input** ([`validarInput.ts`](../helpdesk/backend/src/guardrails/validarInput.ts)) em toda rota que chega a um modelo (chat, criação de ticket, comentários): limite de tamanho e padrões conhecidos de injection ("ignore as instruções anteriores", blocos `[SYSTEM]` falsos, tokens especiais de outros modelos, tentativas de extrair o system prompt). Recusar na entrada custa zero tokens e deixa registro no log.
2. **System prompts endurecidos:** o conteúdo do usuário é tratado como dado não confiável, e os agentes recusam trocas de papel e nunca revelam suas instruções.
3. **Delimitadores XML:** o agente automático recebe o ticket dentro de `<titulo>` e `<descricao>`, com `<` e `>` escapados para o conteúdo não conseguir fechar a tag.
4. **Human-in-the-loop no servidor:** mesmo que um injection passe, ele só consegue *propor* uma alteração.
5. **Sanitização da saída:** o markdown vindo do modelo passa pelo sanitizador do Angular, então um `<img onerror=...>` repetido de um ticket não executa no chat.

---

## Observabilidade

O [`logger.ts`](../helpdesk/backend/src/observabilidade/logger.ts) grava uma linha em `LogChamadaIA` por invocação de agente:

| Campo | Significado |
|---|---|
| `agente` | `automatico`, `automatico_cot`, `interativo_stream`, `relatorio`, `orquestrador` |
| `modelo` | Modelo que atendeu a chamada |
| `inputTokens` / `outputTokens` | Somados em todas as iterações do loop de tool use (`inputTokens` não inclui o cache) |
| `cacheEscritaTokens` / `cacheLeituraTokens` | Tokens gravados no / lidos do prompt cache |
| `custoUsd` | `entrada × preço de entrada + escritas no cache × 1,25 × preço de entrada + leituras do cache × ~0,1 × preço de entrada + saída × preço de saída`, pela tabela de preços por modelo do `logger.ts` (um modelo fora da tabela usa o preço do Sonnet 4.5, com um aviso no log) |
| `latenciaMs` | Da primeira chamada à API até a resposta final |
| `toolCalls` | Quantas ferramentas o agente chamou |
| `ticketId` | Ticket relacionado, quando existe |

Entrada e saída têm preços diferentes porque a saída é gerada de forma autorregressiva, um token por vez, enquanto a entrada é processada de uma vez. A página `/logs` mostra os totais (chamadas, custo, tokens, parte do input que veio do cache, latência média e máxima) e as últimas chamadas, com filtro por agente.

---

## Autenticação

```
POST /auth/login { email, senha }
       │
       ▼ scrypt(senha, salt) comparado em tempo constante com o hash salvo
       │
       ▼ JWT assinado com JWT_SECRET (sub = id do usuário, expira em 8h)
       │
Frontend guarda o token → envia Authorization: Bearer <token>
  - HttpClient: authInterceptor
  - fetch (SSE): AuthService.fetchAutenticado()
       │
       ▼ middleware exigirAutenticacao em toda rota, menos /health e /auth/login
```

- **Senhas:** salvas como `salt:hash` com `scrypt` (nativo do Node, propositalmente lento e pesado em memória) e um salt aleatório por usuário.
- **Força bruta:** no máximo 10 logins errados por IP a cada 15 minutos. A mensagem de erro é a mesma para e-mail inexistente e senha errada.
- **Dados por usuário:** o histórico do chat e as ações pendentes pertencem a quem os criou, e só essa pessoa pode confirmar uma ação. O autor dos comentários vem do token, nunca do body da requisição.
- **Frontend:** o `authGuard` manda visitantes para `/login` (e de volta para a página que queriam depois). Um `401` do backend encerra a sessão e mostra "sua sessão expirou".
- **Criação de usuários:** `npm run usuario:criar -- "Nome" email senha`. Não há cadastro público: é uma ferramenta interna.

---

## Servidor MCP

Além dos agentes dentro do backend Express, as ferramentas de tickets são expostas pelo **Model Context Protocol** em [`src/mcp/server.ts`](../helpdesk/backend/src/mcp/server.ts). MCP é o "USB-C das integrações de IA": você cria o servidor uma vez e qualquer host compatível (VS Code Copilot, Claude Desktop, Cursor) pode usá-lo.

```
VS Code Copilot (host)
    └── inicia: npx ts-node src/mcp/server.ts
    └── conversa em JSON-RPC via stdin/stdout
    └── descobre as 6 ferramentas automaticamente
```

| Pelo agente interativo | Pelo servidor MCP |
|---|---|
| O usuário digita na aplicação web | O usuário pergunta no VS Code / Claude Desktop |
| O backend executa o loop de tool use | O host executa o loop de tool use |
| Ferramentas presas a um agente | Ferramentas expostas de forma padronizada e reutilizável |

O [`.vscode/mcp.json`](../.vscode/mcp.json) usa `${workspaceFolder}`, então funciona em qualquer máquina. O VS Code inicia o servidor quando você confia nele, e o Copilot passa a consultar o banco sem a aplicação web aberta.

---

## Estrutura de arquivos

```
helpdesk/backend/src/
├── index.ts                 app Express, CORS, middleware de auth, tratamento de erros
├── agents/
│   ├── agenteAutomatico.ts  triagem na criação do ticket (RAG, simples ou CoT)
│   ├── agenteInterativo.ts  chat com tool use, RAG e streaming
│   ├── agenteRelatorios.ts  análises sem estado com tool use e streaming
│   ├── orquestrador.ts      classifica a intenção e roteia para o agente certo
│   └── loopAgente.ts        loop de tool use compartilhado pelos agentes do chat
├── auth/                    hash de senha com scrypt e JWT
├── guardrails/              validação de input
├── hitl/                    ações pendentes (human-in-the-loop)
├── mcp/server.ts            servidor MCP (stdio)
├── observabilidade/         log de tokens, custo e latência por chamada
├── rag/                     embeddings e busca por similaridade
├── routes/                  auth, tickets, chat, orquestrador, relatorio, acoes, logs
├── scripts/                 cria usuários, popula dados de exemplo e recria a base de conhecimento
├── tools/                   schemas, executores e validação dos argumentos das ferramentas
└── db/prisma.ts             PrismaClient com o adapter do better-sqlite3

helpdesk/frontend/src/app/
├── auth/                    AuthService, interceptor e guard
├── pages/
│   ├── login/
│   ├── ticket-list/
│   ├── ticket-create/
│   ├── ticket-detail/       análise da IA, polling, status, comentários
│   ├── chat/                chat + cartão de confirmação (acao-card)
│   └── logs/                painel de observabilidade
├── services/                HTTP e SSE (sse.ts)
└── pipes/                   labels e markdown
```
