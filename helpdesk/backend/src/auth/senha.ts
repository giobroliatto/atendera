import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

// ================================================================
// HASH DE SENHA — scrypt (nativo do Node, sem dependência externa)
//
// scrypt é propositalmente lento e usa bastante memória, o que torna
// ataques de força bruta caros. Cada senha ganha um salt aleatório,
// então duas senhas iguais geram hashes diferentes.
// Formato salvo no banco: "salt:hash" (ambos em hex)
// ================================================================

const scryptAsync = promisify(scrypt) as (senha: string, salt: string, tamanho: number) => Promise<Buffer>;
const TAMANHO_HASH = 64;

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(senha, salt, TAMANHO_HASH);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verificarSenha(senha: string, senhaHash: string): Promise<boolean> {
  const [salt, hashHex] = senhaHash.split(":");
  if (!salt || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scryptAsync(senha, salt, esperado.length);
  // timingSafeEqual: compara em tempo constante (não vaza quantos bytes bateram)
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}
