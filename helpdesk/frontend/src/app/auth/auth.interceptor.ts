import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// Adiciona "Authorization: Bearer <token>" em toda requisição do HttpClient
// e manda o usuário de volta ao login se o backend responder 401.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const ehLogin = req.url.endsWith('/auth/login');
  const token = auth.token;

  const requisicao = token && !ehLogin
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(requisicao).pipe(
    catchError((err) => {
      if (err.status === 401 && !ehLogin) auth.expirarSessao();
      return throwError(() => err);
    })
  );
};
