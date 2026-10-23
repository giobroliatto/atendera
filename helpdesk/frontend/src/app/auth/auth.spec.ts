import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { authGuard } from './auth.guard';

// JWT de teste (assinatura falsa: o frontend só lê o "exp", quem valida é o backend)
function jwtCom(exp: number): string {
  const payload = btoa(JSON.stringify({ sub: '1', nome: 'Ana', exp }));
  return `header.${payload}.assinatura`;
}

describe('autenticação no frontend', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const usuario = { id: 1, nome: 'Ana', email: 'ana@empresa.com' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  function logar(token = jwtCom(Date.now() / 1000 + 3600)) {
    auth.login('ana@empresa.com', 'segredo123').subscribe();
    http.expectOne('http://localhost:3000/auth/login').flush({ token, usuario });
  }

  it('login guarda o token e o usuário', () => {
    logar();
    expect(auth.estaAutenticado()).toBe(true);
    expect(auth.usuario()).toEqual(usuario);
  });

  it('token vencido não conta como autenticado', () => {
    logar(jwtCom(Date.now() / 1000 - 60));
    expect(auth.estaAutenticado()).toBe(false);
  });

  it('interceptor envia o Bearer token nas requisições', () => {
    logar();
    TestBed.inject(HttpClient).get('http://localhost:3000/tickets').subscribe();
    const req = http.expectOne('http://localhost:3000/tickets');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${auth.token}`);
  });

  it('401 do backend encerra a sessão e volta ao login', () => {
    logar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(HttpClient).get('http://localhost:3000/tickets').subscribe({ error: () => {} });
    http.expectOne('http://localhost:3000/tickets').flush({ erro: 'expirada' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.estaAutenticado()).toBe(false);
    expect(auth.usuario()).toBeNull();
    expect(navegar).toHaveBeenCalledWith(['/login'], { queryParams: { expirada: 1 } });
  });

  it('guard redireciona para /login guardando a página pedida', () => {
    const resultado = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/logs' } as any));
    expect((resultado as UrlTree).toString()).toBe('/login?returnUrl=%2Flogs');

    logar();
    expect(TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/logs' } as any))).toBe(true);
  });
});
