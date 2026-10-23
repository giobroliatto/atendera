import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

// Converte markdown em HTML. O resultado é usado com [innerHTML], e o Angular
// sanitiza automaticamente o HTML nesse binding (remove <script>, onerror=, javascript:...).
//
// NÃO usar bypassSecurityTrustHtml aqui: o texto vem do modelo, que pode repetir
// conteúdo de tickets escritos por usuários — um "<img src=x onerror=...>" num ticket
// viraria XSS persistido no histórico do chat.
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(text: string): string {
    if (!text) return '';
    return marked.parse(text, { async: false });
  }
}
