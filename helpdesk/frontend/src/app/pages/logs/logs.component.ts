import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LogsService } from '../../services/logs.service';
import { LogChamadaIA, TotaisLogs } from '../../models/log.model';

// Observabilidade: custo, tokens e latência de cada chamada aos agentes de IA
@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatTableModule, MatButtonModule,
    MatIconModule, MatSelectModule, MatFormFieldModule, MatProgressSpinnerModule
  ],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss'
})
export class LogsComponent implements OnInit {
  logs: LogChamadaIA[] = [];
  totais: TotaisLogs | null = null;
  carregando = true;
  erro = '';
  agente = '';
  colunas = ['criadoEm', 'agente', 'inputTokens', 'outputTokens', 'toolCalls', 'latenciaMs', 'custoUsd', 'ticketId'];

  agentes = [
    { valor: '',                   label: 'Todos os agentes' },
    { valor: 'orquestrador',       label: 'Orquestrador' },
    { valor: 'interativo_stream',  label: 'Interativo (chat)' },
    { valor: 'interativo',         label: 'Interativo (sem stream)' },
    { valor: 'relatorio',          label: 'Relatórios' },
    { valor: 'automatico',         label: 'Automático' },
    { valor: 'automatico_cot',     label: 'Automático (CoT)' },
  ];

  constructor(private logsService: LogsService, private router: Router) {}

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.erro = '';
    this.logsService.listar(this.agente || undefined).subscribe({
      next: ({ logs, totais }) => {
        this.logs = logs;
        this.totais = totais;
        this.carregando = false;
      },
      error: (err) => {
        console.error('[Logs] Erro ao carregar logs:', err);
        this.erro = 'Não foi possível carregar os logs. Verifique se o backend está rodando em localhost:3000.';
        this.carregando = false;
      }
    });
  }

  verTicket(id: number): void {
    this.router.navigate(['/tickets', id]);
  }

  // Os agregados do Prisma vêm null quando não há logs — trata como 0
  get custoTotal(): number { return this.totais?._sum.custoUsd ?? 0; }
  get totalChamadas(): number { return this.totais?._count.id ?? 0; }
  get tokensEntrada(): number { return this.totais?._sum.inputTokens ?? 0; }
  get tokensSaida(): number { return this.totais?._sum.outputTokens ?? 0; }
  get latenciaMedia(): number { return this.totais?._avg.latenciaMs ?? 0; }
  get latenciaMaxima(): number { return this.totais?._max.latenciaMs ?? 0; }
  get totalToolCalls(): number { return this.totais?._sum.toolCalls ?? 0; }
  get custoMedio(): number { return this.totalChamadas ? this.custoTotal / this.totalChamadas : 0; }

  labelAgente(valor: string): string {
    return this.agentes.find((a) => a.valor === valor)?.label ?? valor;
  }

  formatarData(data: string): string {
    return new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  }
}
