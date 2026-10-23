import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  email = '';
  senha = '';
  entrando = false;
  erro = '';
  sessaoExpirada = false;

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    if (this.auth.estaAutenticado()) {
      this.router.navigateByUrl(this.destino());
      return;
    }
    this.sessaoExpirada = this.route.snapshot.queryParamMap.has('expirada');
  }

  entrar(): void {
    if (!this.email.trim() || !this.senha || this.entrando) return;
    this.entrando = true;
    this.erro = '';
    this.auth.login(this.email.trim(), this.senha).subscribe({
      next: () => this.router.navigateByUrl(this.destino()),
      error: (err) => {
        this.entrando = false;
        this.erro = err.error?.erro ?? 'Não foi possível entrar. Verifique se o backend está rodando.';
      }
    });
  }

  // Volta para a página que o usuário tentou abrir antes do login (só caminhos internos)
  private destino(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/tickets';
  }
}
