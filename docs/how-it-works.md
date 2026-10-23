# How HelpDesk IA works

**English** · [Português](como-funciona.md)

An in-depth guide to every piece of the project. For setup and an overview, see the [README](../README.md).

- [Overview](#overview)
- [Creating a ticket: the automatic agent](#creating-a-ticket-the-automatic-agent)
- [The chat: orchestrator, interactive agent and reports agent](#the-chat-orchestrator-interactive-agent-and-reports-agent)
- [The tool use loop](#the-tool-use-loop)
- [Tools](#tools)
- [Human-in-the-loop](#human-in-the-loop)
- [RAG](#rag)
- [Streaming (SSE)](#streaming-sse)
- [Chat history](#chat-history)
- [Prompt engineering](#prompt-engineering)
- [Guardrails](#guardrails)
- [Observability](#observability)
- [Authentication](#authentication)
- [MCP server](#mcp-server)
- [File structure](#file-structure)

---

## Overview

| Layer | Technology |
|---|---|
| Frontend | Angular 21 + Angular Material |
| Backend | Node.js + Express 5 + TypeScript |
| Database | SQLite via Prisma 7 + better-sqlite3 |
| AI | Claude via `@anthropic-ai/sdk` (model set by `ANTHROPIC_MODEL`, default `claude-sonnet-4-5`; one shared client in [`ia/claude.ts`](../helpdesk/backend/src/ia/claude.ts)), local embeddings via `@xenova/transformers` |

| Screen | Agent | When |
|---|---|---|
| New ticket | Automatic agent | Every ticket that is created |
| Ticket detail | Automatic agent | Shows its suggestion and reasoning |
| Assistente IA (chat) | Orchestrator → interactive or reports agent | Every message |

---

## Creating a ticket: the automatic agent

[`agenteAutomatico.ts`](../helpdesk/backend/src/agents/agenteAutomatico.ts) runs on its own when a ticket is created. It sets:

- **prioridade**: `baixa` · `media` · `alta` · `critica`
- **categoria**: `ti` · `rh` · `financeiro` · `geral`
- **sugestaoIA**: a short suggestion on how to solve it (two sentences)
- **raciocinioIA**: the step-by-step reasoning, only in detailed mode

```
User fills in the form (title + description)
       │
       ▼ POST /tickets  (guardrail: title ≤ 200, description ≤ 5000 chars, injection patterns)
Backend creates the ticket and answers 201 right away
       │
       └── agenteAuditarTicket(id)  [async, doesn't block the response]
                │
                ▼
           status → "em_analise"
                │
                ▼
           RAG: looks for related knowledge base articles
                │
                ▼
           Claude classifies the ticket (title/description inside <titulo>/<descricao> tags)
                │
                ▼
           Extracts the JSON, normalizes ("Média" → "media") and validates the values
                │
                ▼
           Saves priority, category, suggestion (and reasoning)
           status → "aberto", but only if it's still "em_analise"
```

The frontend polls the ticket every 3 seconds while it's `em_analise`. If someone changes the status during the analysis (closes the ticket, for example), the agent keeps that decision instead of reopening it.

This is the same pattern you'd use for any automatic review job: claim triage, sign-up validation, document screening.

---

## The chat: orchestrator, interactive agent and reports agent

Every chat message goes to `POST /orquestrador/stream`. [`orquestrador.ts`](../helpdesk/backend/src/agents/orquestrador.ts) first classifies the intent with a tiny call to Claude Haiku (`max_tokens: 10`) and then hands the message to a specialized agent:

```
"how many tickets came in this week?"
       │
       ▼ classificarIntencao()  → "relatorio"
       │
       ▼ SSE {"agente": "relatorio"}  → the frontend shows the agent badge
       │
       ▼ agenteRelatorioStream()  → answer streamed as {"chunk": "..."}
```

| Classification | Agent | Examples |
|---|---|---|
| `interativo` | [Interactive](../helpdesk/backend/src/agents/agenteInterativo.ts): looks up and changes tickets, has history | "what's in ticket 3?", "close ticket 7" |
| `relatorio` | [Reports](../helpdesk/backend/src/agents/agenteRelatorios.ts): stateless analytics | "tickets per priority", "anything stuck for 3 days?" |
| `ambos` | Interactive first, then reports | "how many are open? and close ticket 9" |

**Why an orchestrator instead of one big agent:** each agent keeps a short system prompt with its own tools and rules. Mixing everything into one prompt creates conflicting instructions and a bigger context on every call, while routing costs one Haiku call with `max_tokens: 10`.

**Why Haiku with thinking off:** picking one of three words doesn't need the main model. Haiku costs $0.10 / $0.50 per million tokens against $3 / $15 for Sonnet 4.5, and answers faster, which matters because the classification runs before the user sees anything. Haiku 5.5 thinks by default, so the call sets `thinking: { type: "disabled" }`: with `max_tokens: 10`, any reasoning would use up the budget before the answer.

---

## The tool use loop

The model has no database access. It only knows what's in its context, so to read real data it asks for **tools**:

```
User: "how many tickets are open?"
       │
       ▼
Request to Claude with: system prompt + history + tool schemas
       │
       ▼
Claude answers stop_reason = "tool_use"
  content = [{ type: "tool_use", name: "resumo_tickets", id: "t1" }]
       │
       ▼
The server runs resumo_tickets() against the database
       │
       ▼
messages += [
  { role: "assistant", content: [tool_use t1] },
  { role: "user",      content: [tool_result t1: "[{ status: 'aberto', total: 3 }, ...]"] }
]
       │
       ▼
Claude now has the data: stop_reason = "end_turn" → final answer
```

The loop exists because the model may need several tools in a row, or several in the same turn. Both chat agents use the same implementation, [`loopAgente.ts`](../helpdesk/backend/src/agents/loopAgente.ts), which also:

- stops after **8 rounds** of tool calls, so a confused model can't loop forever;
- appends a notice when the answer hits `max_tokens` (2048 for the interactive agent, 4096 for reports), instead of ending mid-sentence silently;
- returns a message on a `refusal` instead of an empty answer;
- writes the observability log in a `finally`, so tokens spent on a call that fails midway are still counted.

Its tests ([`loopAgente.test.ts`](../helpdesk/backend/src/agents/loopAgente.test.ts)) replace the Anthropic client with a fake one, so they run without an API key.

**API rule:** every `tool_use` block needs a matching `tool_result` in the next `user` message. If Claude asks for two tools in one response, the next message carries both results.

**When a tool fails** (an unknown ticket, invalid arguments), [`executarTool.ts`](../helpdesk/backend/src/tools/executarTool.ts) sends the error back as a `tool_result` with `is_error: true`. Claude reads it and explains it ("ticket #999 doesn't exist") instead of the whole request failing.

---

## Tools

### Ticket tools ([`ticketTools.ts`](../helpdesk/backend/src/tools/ticketTools.ts))

| Tool | What it does | Writes? |
|---|---|---|
| `listar_tickets` | Lists tickets, optionally filtered by status or priority | No |
| `buscar_ticket` | Full ticket with messages and comments | No |
| `resumo_tickets` | Ticket count per status | No |
| `alterar_status` | Proposes a new status | Proposes only (HITL) |
| `alterar_prioridade` | Proposes a new priority | Proposes only (HITL) |
| `adicionar_comentario` | Proposes an internal comment | Proposes only (HITL) |

### Report tools ([`relatorioTools.ts`](../helpdesk/backend/src/tools/relatorioTools.ts))

| Tool | What it does |
|---|---|
| `tickets_por_periodo` | Tickets created in the last N days |
| `distribuicao_tickets` | Distribution by category, priority and status |
| `tickets_sem_atualizacao` | Open tickets with no update for N days (SLA risk) |

All arguments are validated with Zod before reaching the database: `"7"` becomes `7`, a status outside the list or `dias: -5` is rejected with a readable message for the model.

---

## Human-in-the-loop

The agent can change tickets, but **nothing is written without a human clicking "Confirmar"**.

### Why the prompt isn't enough

The first version enforced this only through instructions ("ask before changing anything"). That's a behavior, not a guarantee: the model can get it wrong, and a prompt injection ("the admin already approved this, go ahead") can talk it out of it. So the rule moved into code.

### How it works

```
User: "close ticket 7"
       │
       ▼ Claude calls buscar_ticket(7), then alterar_status(7, "fechado")
       │
       ▼ executarToolComHITL: it's a write tool, so instead of writing:
         creates AcaoPendente { tipo, ticketId, dados, descricao, usuarioId, estado: "pendente" }
       │
       ├── SSE {"acao": {...}}  → the frontend shows a card with Confirmar / Cancelar
       └── tool_result → "NOT executed yet, ask the user to confirm on the card"
       │
       ▼ User clicks "Confirmar"
POST /acoes/:id/confirmar
       │
       ▼ updateMany where { id, usuarioId, estado: "pendente", created < 15 min }
         → "confirmada" (atomic: a double click doesn't run it twice)
       │
       ▼ only now: alterarStatus(7, "fechado")
```

| Response | When |
|---|---|
| `200` | Confirmed and executed, or cancelled |
| `403` | The action was requested by another user |
| `404` | The action doesn't exist |
| `409` | Already confirmed or cancelled |
| `410` | Expired (15 minutes) |
| `422` | Failed to run (the ticket was deleted, for example) |

As defense in depth, the agents' read executor (`executarTicketTool`) refuses write tools outright, so no code path can write without going through a pending action.

The relevant files are [`hitl/acoesPendentes.ts`](../helpdesk/backend/src/hitl/acoesPendentes.ts), [`routes/acoes.ts`](../helpdesk/backend/src/routes/acoes.ts) and [`acao-card.component.ts`](../helpdesk/frontend/src/app/pages/chat/acao-card.component.ts).

### Chat vs MCP

| Through the chat | Through MCP (VS Code Copilot) |
|---|---|
| The server creates a pending action and only a click executes it | The host asks for confirmation before running each tool |
| Enforced in code | Enforced by the host |

---

## RAG

RAG (retrieval-augmented generation) lets the agents answer with **the company's own procedures** instead of generic advice.

Without RAG, "how do I reset my password?" gets an answer about passwords in general. With RAG, it gets the exact steps from the internal portal.

```
"my VPN won't connect"
       │
       ▼ rag/embeddings.ts
The question becomes a 384-number vector, computed locally with
Xenova/all-MiniLM-L6-v2 (runs inside Node.js, no external API)
       │
       ▼ rag/buscar.ts
Cosine similarity against every article in BaseConhecimento:
  "VPN não conecta - troubleshooting"  0.89  ✓
  "Acesso negado a sistema interno"    0.41  ✓
  "Instalar ou atualizar software"     0.28  ✗ below the 0.35 threshold
Top 3 above the threshold
       │
       ▼
The articles are injected into the prompt and Claude answers with the real procedure
```

### Cosine similarity

Two vectors are similar when they point in the same direction. The embedding model maps sentences with **close meanings** to vectors pointing in close directions, even with different words: "VPN won't connect" and "problem with the VPN" score high, "cake recipe" scores low.

`cos(θ) = (A · B) / (|A| × |B|)` gives a value between -1 and 1. Below 0.35, an article isn't considered relevant.

### Knowledge base

[`rag/artigos.ts`](../helpdesk/backend/src/rag/artigos.ts) holds 10 IT articles (password reset, offline printer, VPN, email on the phone, slow computer, access requests, Teams audio, file recovery, monitor with no signal, installing software) and [`popularBaseConhecimento.ts`](../helpdesk/backend/src/scripts/popularBaseConhecimento.ts) stores each one with its vector. All vectors are computed before the old base is replaced, in a single transaction, so a failed model download doesn't wipe it:

```bash
cd helpdesk/backend
npm run kb:popular   # also runs as part of npm run db:seed; downloads the model (~80 MB) on the first run
```

If the embedding model can't be loaded, the search is skipped with a warning and the agents keep answering without the extra context.

---

## Streaming (SSE)

Chat answers show up **while Claude writes them**: the assistant's bubble appears right away and fills in token by token, instead of a frozen screen for several seconds.

```
User clicks "send"
       │
       ▼ chat.component.ts: empty assistant bubble on screen
       │
       ▼ chat.service.ts: fetch() + ReadableStream (connection stays open)
POST /orquestrador/stream
       │
       ▼ route: Content-Type: text/event-stream
data: {"agente":"interativo"}
data: {"acao":{...}}             ← only when a change was proposed
data: {"chunk":"To "}
data: {"chunk":"fix this"}
data: {"done":true}
       │
       ▼ services/sse.ts
Buffers the text, processes only complete lines, keeps the partial line for the next read()
       │
       ▼ chat.component.ts
ngZone.run(() => bubble.conteudo += chunk)
```

- **Why `fetch` and not `HttpClient`:** `HttpClient` waits for the whole response before emitting. SSE needs the body's `ReadableStream`.
- **Why not `EventSource`:** it only supports `GET`, and the route is a `POST` because the message goes in the body.
- **Why `NgZone.run()`:** the `fetch` callbacks run outside Angular's zone. Without it, chunks arrive but the screen only updates on the next Angular event.
- **Buffering:** one `read()` can carry several events or only half of one. Without the buffer, an event split between two reads was silently dropped.
- **Errors:** if the backend answers with an error status (a guardrail rejection, an expired session) or the stream ends without `done`, the chat shows the reason instead of spinning forever.

---

## Chat history

The interactive agent keeps context by saving each pair (user message + assistant answer) in `MensagemChat`, per user. It sends the last 8 messages (4 exchanges) to the model: enough for follow-up questions, short enough to avoid stale context. The system prompt also tells the agent never to answer about a ticket's current state from the history, only from a fresh tool call.

- **User and assistant always alternate.** Both messages are saved only after success: if the user message were saved first and the agent failed, an orphan `user` message would break the alternation on the next call.
- **`ticketId ?? null`:** general conversations use `ticketId: null`. Passing `undefined` to Prisma drops the filter and would return everyone's messages.

---

## Prompt engineering

The automatic agent has two modes, picked by the "Incluir raciocínio detalhado" checkbox on the form:

| Mode | Prompt | Output | Cost |
|---|---|---|---|
| Simple (default) | Criteria + JSON format | `{ prioridade, categoria, sugestao }` | ~200 output tokens |
| Detailed | Same criteria + **4 few-shot examples** + a `raciocinio` field first | `{ raciocinio, prioridade, categoria, sugestao }` | ~600 output tokens |

- **Few-shot:** the four examples (company-wide outage → critical, 80 people without a time clock → high, one user with a workaround → medium, a comfort request → low) calibrate the borderline cases.
- **Chain of thought:** writing the reasoning *before* the decision makes the model think it through, and the reasoning is stored in `raciocinioIA` for auditing.
- **Robust JSON:** the answer may come wrapped in a ```` ```json ```` block or with extra text, so the code extracts the object, then normalizes and validates every value before saving.

---

## Guardrails

Several layers, so none of them has to be perfect:

1. **Input validation** ([`validarInput.ts`](../helpdesk/backend/src/guardrails/validarInput.ts)) on every route that reaches a model (chat, ticket creation, comments): size limits and known injection patterns ("ignore previous instructions", fake `[SYSTEM]` blocks, other models' special tokens, attempts to dump the system prompt). Rejecting at the gateway costs zero tokens and leaves a log entry.
2. **Hardened system prompts:** user content is treated as untrusted data, the agents refuse role changes and never reveal their instructions.
3. **XML delimiters:** the automatic agent gets the ticket inside `<titulo>` and `<descricao>`, with `<` and `>` escaped so the content can't close the tag.
4. **Server-side human-in-the-loop:** even if an injection gets through, it can only *propose* a change.
5. **Output sanitization:** markdown from the model is rendered through Angular's sanitizer, so `<img onerror=...>` echoed from a ticket can't run in the chat.

---

## Observability

[`logger.ts`](../helpdesk/backend/src/observabilidade/logger.ts) writes one `LogChamadaIA` row per agent invocation:

| Field | Meaning |
|---|---|
| `agente` | `automatico`, `automatico_cot`, `interativo_stream`, `relatorio`, `orquestrador` |
| `modelo` | Model that served the call |
| `inputTokens` / `outputTokens` | Summed over every iteration of the tool use loop |
| `custoUsd` | `input × input price + output × output price`, from the per-model price table in `logger.ts` (a model missing from the table falls back to Sonnet 4.5 prices with a warning) |
| `latenciaMs` | From the first API call to the final answer |
| `toolCalls` | How many tools the agent called |
| `ticketId` | Related ticket, when there is one |

Input and output are priced differently because generating output is autoregressive, one token at a time, while the input is processed in one pass. The `/logs` page shows totals (calls, cost, tokens, average and max latency) and the latest calls, filterable by agent.

---

## Authentication

```
POST /auth/login { email, senha }
       │
       ▼ scrypt(senha, salt) compared in constant time with the stored hash
       │
       ▼ JWT signed with JWT_SECRET (sub = user id, expires in 8h)
       │
Frontend stores the token → sends Authorization: Bearer <token>
  - HttpClient: authInterceptor
  - fetch (SSE): AuthService.fetchAutenticado()
       │
       ▼ exigirAutenticacao middleware on every route except /health and /auth/login
```

- **Passwords:** stored as `salt:hash` with `scrypt` (Node's built-in, deliberately slow and memory-hungry) and a random salt per user.
- **Brute force:** at most 10 failed logins per IP every 15 minutes. The error message is the same for an unknown email and a wrong password.
- **Per-user data:** chat history and pending actions belong to the user who created them; only that user can confirm an action. Comment authors come from the token, never from the request body.
- **Frontend:** `authGuard` sends visitors to `/login` (and back to the page they wanted afterwards). A `401` from the backend ends the session and shows "your session expired".
- **Creating users:** `npm run usuario:criar -- "Name" email password`. There's no public sign-up: it's an internal tool.

---

## MCP server

Besides the agents inside the Express backend, the ticket tools are exposed over the **Model Context Protocol** in [`src/mcp/server.ts`](../helpdesk/backend/src/mcp/server.ts). MCP is the "USB-C of AI integrations": build the server once and any compatible host (VS Code Copilot, Claude Desktop, Cursor) can use it.

```
VS Code Copilot (host)
    └── spawns: npx ts-node src/mcp/server.ts
    └── talks JSON-RPC over stdin/stdout
    └── discovers the 6 tools automatically
```

| Through the interactive agent | Through the MCP server |
|---|---|
| The user types in the web app | The user asks in VS Code / Claude Desktop |
| The backend runs the tool use loop | The host runs the tool use loop |
| Tools tied to one agent | Tools exposed in a standard, reusable way |

[`.vscode/mcp.json`](../.vscode/mcp.json) uses `${workspaceFolder}`, so it works on any machine. VS Code starts the server once you trust it, and Copilot can then query the database without the web app open.

---

## File structure

```
helpdesk/backend/src/
├── index.ts                 Express app, CORS, auth middleware, error handler
├── agents/
│   ├── agenteAutomatico.ts  triage when a ticket is created (RAG, simple or CoT)
│   ├── agenteInterativo.ts  chat with tool use, RAG and streaming
│   ├── agenteRelatorios.ts  stateless analytics with tool use and streaming
│   ├── orquestrador.ts      classifies the intent and routes to the right agent
│   └── loopAgente.ts        tool use loop shared by the chat agents
├── auth/                    scrypt password hashing and JWT
├── guardrails/              input validation
├── hitl/                    pending actions (human-in-the-loop)
├── mcp/server.ts            MCP server (stdio)
├── observabilidade/         per-call logging of tokens, cost and latency
├── rag/                     embeddings and similarity search
├── routes/                  auth, tickets, chat, orquestrador, relatorio, acoes, logs
├── scripts/                 creates users, seeds sample data, rebuilds the knowledge base
├── tools/                   tool schemas, executors and argument validation
└── db/prisma.ts             PrismaClient with the better-sqlite3 adapter

helpdesk/frontend/src/app/
├── auth/                    AuthService, interceptor and guard
├── pages/
│   ├── login/
│   ├── ticket-list/
│   ├── ticket-create/
│   ├── ticket-detail/       AI analysis, polling, status, comments
│   ├── chat/                chat + confirmation card (acao-card)
│   └── logs/                observability dashboard
├── services/                HTTP and SSE (sse.ts)
└── pipes/                   labels and markdown
```
