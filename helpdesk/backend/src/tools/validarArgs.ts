import { z } from "zod";

// Valida os argumentos de uma tool e lança um erro legível para o modelo
// (ex: "status: Invalid option ...") em vez do JSON bruto do ZodError.
export function validarArgs<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const resultado = schema.safeParse(input);
  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    throw new Error(`Argumentos inválidos — ${detalhes}`);
  }
  return resultado.data;
}
