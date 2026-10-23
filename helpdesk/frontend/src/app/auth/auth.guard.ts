import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Só deixa entrar em rotas internas quem tem um token válido;
// os demais vão para /login, guardando a página que tentaram abrir.
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).estaAutenticado()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
