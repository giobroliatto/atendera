import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import prisma from "../db/prisma";
import { verificarSenha } from "../auth/senha";
import { exigirAutenticacao, gerarToken, usuarioAtual } from "../auth/token";

const router = Router();

// Limita tentativas de login por IP — dificulta força bruta de senhas.
// Só falhas contam: quem acerta a senha não gasta o limite.
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

// POST /auth/login — { email, senha } → { token, usuario }
router.post("/login", limiteLogin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string };
    if (!email?.trim() || !senha) {
      res.status(400).json({ erro: "email e senha são obrigatórios" });
      return;
    }

    const usuario = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Mesma mensagem para e-mail inexistente e senha errada: não revela quais e-mails existem
    if (!usuario || !(await verificarSenha(senha, usuario.senhaHash))) {
      res.status(401).json({ erro: "E-mail ou senha inválidos" });
      return;
    }

    const dados = { id: usuario.id, nome: usuario.nome, email: usuario.email };
    res.json({ token: gerarToken(dados), usuario: dados });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — dados do usuário do token atual
router.get("/me", exigirAutenticacao, (_req: Request, res: Response) => {
  res.json(usuarioAtual(res));
});

export default router;
