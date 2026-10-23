import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TicketService } from '../../services/ticket.service';

@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  templateUrl: './ticket-create.component.html',
  styleUrl: './ticket-create.component.scss'
})
export class TicketCreateComponent {
  titulo = '';
  descricao = '';
  comRaciocinio = false;
  enviando = false;
  sucesso = false;
  erro = '';
  ticketCriadoId: number | null = null;

  constructor(private ticketService: TicketService, private router: Router) {}

  criar(): void {
    if (!this.titulo.trim() || !this.descricao.trim()) return;

    this.enviando = true;
    this.erro = '';
    this.ticketService.criar({ titulo: this.titulo, descricao: this.descricao, comRaciocinio: this.comRaciocinio }).subscribe({
      next: (ticket) => {
        this.enviando = false;
        this.sucesso = true;
        this.ticketCriadoId = ticket.id;
        // Redireciona para o detalhe após 2s (tempo do agente automático começar a analisar)
        setTimeout(() => this.router.navigate(['/tickets', ticket.id]), 2000);
      },
      error: (err) => {
        this.enviando = false;
        this.erro = err.error?.erro ?? 'Não foi possível criar o ticket.';
      }
    });
  }

  voltar(): void {
    this.router.navigate(['/tickets']);
  }
}
