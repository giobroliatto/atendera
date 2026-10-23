import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TicketService } from '../../services/ticket.service';
import { Ticket } from '../../models/ticket.model';
import { LabelPipe } from '../../pipes/label.pipe';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatProgressSpinnerModule, MatDividerModule,
    MatFormFieldModule, MatInputModule,
    LabelPipe
  ],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.scss'
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  ticket: Ticket | null = null;
  carregando = true;
  erro = '';
  novoComentario = '';
  enviandoComentario = false;
  erroComentario = '';
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  // em_analise é definido automaticamente pelo agente — o usuário não deve setar manualmente
  statusOptions = ['aberto', 'resolvido', 'fechado'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketService: TicketService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.carregar(id);

    // Polling automático: atualiza a cada 3s se o ticket ainda está em análise
    // (enquanto o agente automático trabalha em background)
    this.pollInterval = setInterval(() => {
      if (this.ticket?.status === 'em_analise') {
        this.carregarSilencioso(id);
      }
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  carregar(id: number): void {
    this.carregando = true;
    this.erro = '';
    this.ticketService.buscar(id).subscribe({
      next: (ticket) => { this.ticket = ticket; this.carregando = false; },
      error: (err) => {
        console.error('[TicketDetail] Erro ao carregar ticket:', err);
        this.erro = 'Não foi possível carregar o ticket. Verifique se o backend está rodando.';
        this.carregando = false;
      }
    });
  }

  // Polling silencioso: atualiza dados sem mostrar o spinner
  private carregarSilencioso(id: number): void {
    this.ticketService.buscar(id).subscribe({
      next: (ticket) => { this.ticket = ticket; },
      error: (err) => console.error('[TicketDetail] Erro no polling:', err)
    });
  }

  atualizarStatus(status: string): void {
    if (!this.ticket) return;
    this.ticketService.atualizarStatus(this.ticket.id, status).subscribe({
      next: (ticket) => { this.ticket = ticket; }
    });
  }

  enviarComentario(): void {
    if (!this.novoComentario.trim() || !this.ticket || this.enviandoComentario) return;
    this.enviandoComentario = true;
    this.erroComentario = '';
    this.ticketService.adicionarComentario(this.ticket.id, this.novoComentario).subscribe({
      next: (comentario) => {
        if (!this.ticket!.comentarios) this.ticket!.comentarios = [];
        this.ticket!.comentarios.push(comentario);
        this.novoComentario = '';
        this.enviandoComentario = false;
      },
      error: (err) => {
        this.enviandoComentario = false;
        this.erroComentario = err.error?.erro ?? 'Não foi possível adicionar o comentário.';
      }
    });
  }

  voltar(): void {
    this.router.navigate(['/tickets']);
  }

  formatarData(data: string): string {
    return new Date(data).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
