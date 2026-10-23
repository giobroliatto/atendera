import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AcaoCardComponent } from './acao-card.component';
import { AcaoPendente } from '../../models/ticket.model';

describe('AcaoCardComponent', () => {
  let http: HttpTestingController;

  function criar(): { el: HTMLElement; acao: AcaoPendente; detectar: () => void } {
    const fixture = TestBed.createComponent(AcaoCardComponent);
    const acao: AcaoPendente = {
      id: 7, tipo: 'alterar_status', ticketId: 3, estado: 'pendente',
      descricao: 'Alterar status do ticket #3 "VPN": aberto → fechado',
    };
    fixture.componentInstance.acao = acao;
    fixture.detectChanges();
    return { el: fixture.nativeElement, acao, detectar: () => fixture.detectChanges() };
  }

  function botao(el: HTMLElement, texto: string): HTMLButtonElement {
    return [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(texto)) as HTMLButtonElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AcaoCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('só executa a ação ao clicar em Confirmar', () => {
    const { el, acao, detectar } = criar();
    expect(el.textContent).toContain('aberto → fechado');
    http.expectNone(() => true);

    botao(el, 'Confirmar').click();
    http.expectOne({ method: 'POST', url: 'http://localhost:3000/acoes/7/confirmar' })
      .flush({ acao: { ...acao, estado: 'confirmada' } });
    detectar();

    expect(acao.estado).toBe('confirmada');
    expect(el.textContent).toContain('Ação executada');
    expect(botao(el, 'Confirmar')).toBeUndefined();
  });

  it('mostra o motivo e esconde os botões quando a ação expirou', () => {
    const { el, detectar } = criar();
    botao(el, 'Confirmar').click();
    http.expectOne('http://localhost:3000/acoes/7/confirmar')
      .flush({ erro: 'Esta ação expirou. Peça novamente ao assistente.' }, { status: 410, statusText: 'Gone' });
    detectar();

    expect(el.textContent).toContain('Esta ação expirou');
    expect(botao(el, 'Confirmar')).toBeUndefined();
  });
});
