import { Injectable } from '@angular/core';
import { lerEventosSSE } from './sse';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class RelatorioService {
  private baseUrl = 'http://localhost:3000/relatorio';

  constructor(private auth: AuthService) {}

  // Streaming via fetch nativo + ReadableStream — mesmo padrão do ChatService.
  // SSE com POST não é suportado por EventSource nem HttpClient.
  consultarStream(
    mensagem: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onErro: (motivo?: string) => void
  ): void {
    this.auth.fetchAutenticado(`${this.baseUrl}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem }),
    }).then((response) =>
      lerEventosSSE(response, (data) => {
        if (data.chunk) onChunk(data.chunk);
        if (data.done)  onDone();
        if (data.erro)  onErro(data.erro);
      })
    ).catch((err) => onErro(err?.message));
  }
}
