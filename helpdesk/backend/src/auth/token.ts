import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// ================================================================
// AUTENTICAÇÃO — JWT
//
// POST /auth/login devolve um token assinado com JWT_SECRET.
// O frontend manda esse token no header "Authorization: Bearer <token>"
// e o middleware exigirAutenticacao barra qualquer rota sem token válido.
// ================================================================

export interface UsuarioAutenticado {
  id: number;
  nome: string;
  email: string;
}

const EXPIRACAO = (process.env.JWT_EXPIRES_IN || "8h") as jwt.SignOptions["expiresIn"];

function segredo(): string {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error("JWT_SECRET não definido no .env");
  return valor;
}

export function gerarToken(usuario: UsuarioAutenticado): string {
  return jwt.sign({ nome: usuario.nome, email: usuario.email }, segredo(), {
    subject: String(usuario.id),
    expiresIn: EXPIRACAO,
  });
}

export function exigirAutenticacao(req: Request, res: Response, next: NextFunction): void {
  const [tipo, token] = (req.headers.authorization ?? "").split(" ");
  if (tipo !== "Bearer" || !token) {
    res.status(401).json({ erro: "Autenticação necessária" });
    return;
  }

  try {
    const payload = jwt.verify(token, segredo()) as jwt.JwtPayload;
    const usuario: UsuarioAutenticado = { id: Number(payload.sub), nome: payload.nome, email: payload.email };
    res.locals.usuario = usuario;
    next();
  } catch {
    res.status(401).json({ erro: "Sessão inválida ou expirada. Faça login novamente." });
  }
}

// Usuário da requisição atual (preenchido por exigirAutenticacao)
export function usuarioAtual(res: Response): UsuarioAutenticado {
  return res.locals.usuario as UsuarioAutenticado;
}
