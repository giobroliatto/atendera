import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { AcaoPendente } from '../../models/ticket.model';

// Cartão de confirmação do human-in-the-loop.
// O agente só PROPÕE a alteração; ela é executada quando o usuário clica em Confirmar.
@Component({
  selector: 'app-acao-card',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="acao-card" [ngClass]="acao.estado">
      <div class="acao-titulo"><mat-icon>pending_actions</mat-icon> Ação proposta pelo assistente</div>
      <p class="acao-descricao">{{ acao.descricao }}</p>

      <div *ngIf="acao.estado === 'pendente' && !encerrada" class="acao-botoes">
        <button mat-stroked-button (click)="cancelar()" [disabled]="processando">Cancelar</button>
        <button mat-flat-button color="primary" (click)="confirmar()" [disabled]="processando">Confirmar</button>
      </div>

      <p *ngIf="acao.estado === 'confirmada'" class="acao-status ok"><mat-icon>check_circle</mat-icon> Ação executada</p>
      <p *ngIf="acao.estado === 'cancelada'" class="acao-status"><mat-icon>cancel</mat-icon> Ação cancelada</p>
      <p *ngIf="erro" class="acao-status falha"><mat-icon>error_outline</mat-icon> {{ erro }}</p>
    </div>
  `,
  styles: `
    .acao-card {
      border: 1px solid #90caf9;
      background: #f3f8fe;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 14px;
      &.confirmada { border-color: #a5d6a7; background: #f1f8f1; }
      &.cancelada, &.falhou { border-color: #e0e0e0; background: #fafafa; }
    }
    .acao-titulo { display: flex; align-items: center; gap: 6px; font-weight: 600; color: #1565c0; font-size: 13px; }
    .acao-titulo mat-icon, .acao-status mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .acao-descricao { margin: 6px 0 8px; color: #212121; }
    .acao-botoes { display: flex; justify-content: flex-end; gap: 8px; }
    .acao-status { display: flex; align-items: center; gap: 6px; margin: 0; color: #616161; font-size: 13px; }
    .acao-status.ok { color: #2e7d32; }
    .acao-status.falha { color: #c62828; }
  `
})
export class AcaoCardComponent {
  @Input({ required: true }) acao!: AcaoPendente;
  processando = false;
  encerrada = false; // ação não pode mais ser resolvida (expirou, já resolvida em outra aba...)
  erro = '';

  constructor(private chatService: ChatService) {}

  confirmar(): void {
    this.resolver(this.chatService.confirmarAcao(this.acao.id));
  }

  cancelar(): void {
    this.resolver(this.chatService.cancelarAcao(this.acao.id));
  }

  private resolver(requisicao: Observable<{ acao: AcaoPendente }>): void {
    this.processando = true;
    this.erro = '';
    requisicao.subscribe({
      next: ({ acao }) => {
        this.acao.estado = acao.estado;
        this.processando = false;
      },
      error: (err) => {
        this.processando = false;
        this.erro = err.error?.erro ?? 'Não foi possível concluir a ação.';
        // 404/409/410/422: a ação não pode mais ser confirmada — esconde os botões
        if (err.status >= 400 && err.status < 500) this.encerrada = true;
      }
    });
  }
}
