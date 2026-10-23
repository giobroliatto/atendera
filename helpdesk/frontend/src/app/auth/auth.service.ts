import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { RespostaLogin, Usuario } from '../models/usuario.model';

const CHAVE_TOKEN = 'helpdesk.token';
const CHAVE_USUARIO = 'helpdesk.usuario';

// Guarda o JWT recebido no login e o usuário logado.
// O token vai no header Authorization de toda chamada ao backend:
//   - HttpClient: via authInterceptor
//   - fetch (SSE do chat): via fetchAutenticado()
@Injectable({ providedIn: 'root' })
export class AuthService {
  private baseUrl = 'http://localhost:3000/auth';

  readonly usuario = signal<Usuario | null>(this.lerUsuarioSalvo());

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, senha: string): Observable<RespostaLogin> {
    return this.http.post<RespostaLogin>(`${this.baseUrl}/login`, { email, senha }).pipe(
      tap(({ token, usuario }) => {
        localStorage.setItem(CHAVE_TOKEN, token);
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
        this.usuario.set(usuario);
      })
    );
  }

  get token(): string | null {
    return localStorage.getItem(CHAVE_TOKEN);
  }

  estaAutenticado(): boolean {
    const token = this.token;
    return !!token && !tokenExpirado(token);
  }

  logout(): void {
    this.limparSessao();
    this.router.navigate(['/login']);
  }

  // Chamado quando o backend responde 401 (token expirado ou inválido)
  expirarSessao(): void {
    this.limparSessao();
    this.router.navigate(['/login'], { queryParams: { expirada: 1 } });
  }

  // fetch nativo (usado no streaming SSE, que o HttpClient não suporta) com o token no header
  async fetchAutenticado(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401) this.expirarSessao();
    return response;
  }

  private limparSessao(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
    this.usuario.set(null);
  }

  private lerUsuarioSalvo(): Usuario | null {
    try {
      const salvo = localStorage.getItem(CHAVE_USUARIO);
      return salvo && this.estaAutenticado() ? JSON.parse(salvo) : null;
    } catch {
      return null;
    }
  }
}

// Lê o campo "exp" do payload do JWT (base64url) sem validar a assinatura —
// a validação de verdade é feita pelo backend; aqui só evitamos usar token vencido.
function tokenExpirado(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
