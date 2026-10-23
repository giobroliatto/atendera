import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Mensagem, AcaoPendente } from '../models/ticket.model';
import { lerEventosSSE } from './sse';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private baseUrl = 'http://localhost:3000/chat';

  constructor(private http: HttpClient, private auth: AuthService) {}

  enviarMensagem(mensagem: string, ticketId?: number): Observable<{ resposta: string }> {
    return this.http.post<{ resposta: string }>(this.baseUrl, { mensagem, ticketId });
  }

  // Versão streaming: a conexão fica aberta e os callbacks são chamados conforme o texto chega.
  //
  // Por que fetch nativo e não HttpClient?
  // O HttpClient do Angular não suporta SSE (Server-Sent Events) — ele espera a resposta
  // completa antes de emitir. O fetch nativo tem ReadableStream que lê byte a byte.
  //
  // Por que não EventSource?
  // EventSource só suporta GET. Nossa rota é POST (precisa enviar a mensagem no body).
  enviarMensagemStream(
    mensagem: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onErro: (motivo?: string) => void,
    ticketId?: number
  ): void {
    this.auth.fetchAutenticado(`${this.baseUrl}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, ticketId }),
    }).then((response) =>
      lerEventosSSE(response, (data) => {
        if (data.chunk) onChunk(data.chunk);
        if (data.done)  onDone();
        if (data.erro)  onErro(data.erro);
      })
    ).catch((err) => onErro(err?.message));
  }

  // Versão orquestrada: envia para /orquestrador/stream que classifica a intenção
  // e delega para o agente correto. Inclui callback onAgente com o nome do agente escolhido
  // e onAcao para cada ação de escrita proposta (que o usuário confirma no cartão).
  enviarMensagemOrquestrador(
    mensagem: string,
    onAgente: (agente: string) => void,
    onChunk: (chunk: string) => void,
    onAcao: (acao: AcaoPendente) => void,
    onDone: () => void,
    onErro: (motivo?: string) => void,
    ticketId?: number
  ): void {
    this.auth.fetchAutenticado('http://localhost:3000/orquestrador/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, ticketId }),
    }).then((response) =>
      lerEventosSSE(response, (data) => {
        if (data.agente) onAgente(data.agente);
        if (data.chunk)  onChunk(data.chunk);
        if (data.acao)   onAcao(data.acao);
        if (data.done)   onDone();
        if (data.erro)   onErro(data.erro);
      })
    ).catch((err) => onErro(err?.message));
  }

  buscarHistorico(ticketId?: number): Observable<Mensagem[]> {
    const params = ticketId ? `?ticketId=${ticketId}` : '';
    return this.http.get<Mensagem[]>(`${this.baseUrl}/historico${params}`);
  }

  limparHistorico(): Observable<{ ok: boolean; removidas: number }> {
    return this.http.delete<{ ok: boolean; removidas: number }>(`${this.baseUrl}/historico`);
  }

  // Human-in-the-loop: a escrita proposta pelo agente só é executada por aqui
  confirmarAcao(id: number): Observable<{ acao: AcaoPendente }> {
    return this.http.post<{ acao: AcaoPendente }>(`http://localhost:3000/acoes/${id}/confirmar`, {});
  }

  cancelarAcao(id: number): Observable<{ acao: AcaoPendente }> {
    return this.http.post<{ acao: AcaoPendente }>(`http://localhost:3000/acoes/${id}/cancelar`, {});
  }
}
