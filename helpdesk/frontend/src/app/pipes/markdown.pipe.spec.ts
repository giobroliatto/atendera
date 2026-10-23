import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MarkdownPipe } from './markdown.pipe';

@Component({
  imports: [MarkdownPipe],
  template: `<div [innerHTML]="texto | markdown"></div>`,
})
class HostComponent {
  texto = '';
}

function renderizar(texto: string): HTMLElement {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.texto = texto;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MarkdownPipe', () => {
  it('renderiza markdown', () => {
    const el = renderizar('**negrito**\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(el.querySelector('strong')?.textContent).toBe('negrito');
    expect(el.querySelector('table')).toBeTruthy();
  });

  it('remove HTML perigoso vindo da resposta do modelo', () => {
    const el = renderizar('Ticket: <img src="x" onerror="alert(1)"> <script>alert(2)</script> [link](javascript:alert(3))');
    expect(el.innerHTML).not.toContain('onerror');
    expect(el.querySelector('script')).toBeNull();
    // o Angular prefixa URLs perigosas com "unsafe:", então o navegador não executa
    expect(el.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/);
  });
});
