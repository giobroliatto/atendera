import { Component, OnInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ChatService } from '../../services/chat.service';
import { Mensagem } from '../../models/ticket.model';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

// Estende Mensagem com o agente que respondeu (só em runtime, não persiste no banco)
interface MensagemComAgente extends Mensagem {
  agente?: 'interativo' | 'relatorio';
}

// Diálogo de confirmação de limpeza do histórico
@Component({
  selector: 'dialog-confirmar-limpar',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px">
      <mat-icon color="warn">delete_sweep</mat-icon> Limpar histórico
    </h2>
    <mat-dialog-content>
      <p style="margin:0;color:#424242">Isso remove <strong>todas as mensagens</strong> do banco de dados permanentemente.</p>
      <p style="margin:8px 0 0;color:#757575;font-size:13px">Esta ação não pode ser desfeita.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" style="gap:8px;padding:16px">
      <button mat-stroked-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="warn" [mat-dialog-close]="true">Limpar tudo</button>
    </mat-dialog-actions>
  `
})
export class DialogConfirmarLimparComponent {}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatDialogModule, MarkdownPipe
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent implements OnInit {
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;

  mensagens: MensagemComAgente[] = [];
  texto = '';
  enviando = false;

  // NgZone é necessário porque fetch() nativo roda fora da detecção de mudanças do Angular.
  // Sem ngZone.run(), os chunks chegam mas a tela não atualiza até o próximo evento do Angular.
  constructor(private chatService: ChatService, private ngZone: NgZone, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.chatService.buscarHistorico().subscribe({
      next: (msgs) => { this.mensagens = msgs; this.scrollDown(); }
    });
  }

  limparHistorico(): void {
    if (this.enviando) return;
    const ref = this.dialog.open(DialogConfirmarLimparComponent, { width: '360px' });
    ref.afterClosed().subscribe((confirmado) => {
      if (!confirmado) return;
      this.chatService.limparHistorico().subscribe({
        next: () => { this.mensagens = []; }
      });
    });
  }

  enviar(): void {
    if (!this.texto.trim() || this.enviando) return;

    const textoEnviado = this.texto.trim();
    this.texto = '';
    this.enviando = true;

    // Adiciona a mensagem do usuário
    this.mensagens.push({
      id: Date.now(),
      ticketId: null,
      role: 'user',
      conteudo: textoEnviado,
      criadoEm: new Date().toISOString()
    });

    // Cria o balão do assistente vazio — será preenchido chunk por chunk
    let streamingMsg: MensagemComAgente = {
      id: Date.now() + 1,
      ticketId: null,
      role: 'assistant',
      conteudo: '',
      criadoEm: new Date().toISOString()
    };
    this.mensagens.push(streamingMsg);
    this.scrollDown();

    this.chatService.enviarMensagemOrquestrador(
      textoEnviado,
      (agente) => {
        // Evento de roteamento: informa qual agente foi acionado.
        // Se já há conteúdo no balão atual (caso "ambos"), cria um novo balão
        // para o segundo agente em vez de sobrescrever o primeiro.
        this.ngZone.run(() => {
          if (streamingMsg.conteudo.trim()) {
            const novoBalao: MensagemComAgente = {
              id: Date.now() + 2,
              ticketId: null,
              role: 'assistant',
              conteudo: '',
              criadoEm: new Date().toISOString()
            };
            this.mensagens.push(novoBalao);
            streamingMsg = novoBalao;
            this.scrollDown();
          }
          streamingMsg.agente = agente as 'interativo' | 'relatorio';
        });
      },
      (chunk) => {
        // ngZone.run() força o Angular a detectar a mudança e atualizar a tela
        this.ngZone.run(() => {
          streamingMsg.conteudo += chunk;
          this.scrollDown();
        });
      },
      () => {
        this.ngZone.run(() => {
          this.enviando = false;
          this.scrollDown();
        });
      },
      (motivo) => {
        this.ngZone.run(() => {
          if (!streamingMsg.conteudo) {
            streamingMsg.conteudo = motivo || 'Erro ao processar a mensagem.';
          }
          this.enviando = false;
        });
      }
    );
  }

  onEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.enviar();
    }
  }

  private scrollDown(): void {
    setTimeout(() => {
      this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }
}
