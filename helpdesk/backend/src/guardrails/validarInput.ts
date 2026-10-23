// ================================================================
// GUARDRAILS — validação de input antes de chegar ao modelo
//
// Por que validar aqui e não confiar só no Claude?
//   O Claude tem alinhamento por treinamento, mas:
//   1. Modelos menores/futuros podem ser mais vulneráveis
//   2. Defense in depth: quanto mais camadas, melhor
//   3. Logs: sabemos que uma tentativa aconteceu antes do modelo ver
//   4. Custo zero: rejeitar no gateway é mais barato que gastar tokens
//
// Dois tipos de verificação:
//   - TAMANHO: previne context overflow (encher o contexto de lixo)
//   - PADRÕES: bloqueia tentativas de prompt injection conhecidas
// ================================================================

export interface ResultadoValidacao {
  valido: boolean;
  motivo?: string;
}

const LIMITE_CHARS = 2000;

// Padrões clássicos de prompt injection — atualize conforme novos surgem
const PADROES_INJECTION: Array<{ padrao: RegExp; descricao: string }> = [
  {
    padrao: /ignore\s+(all\s+|todas?\s+(as\s+)?)?previous\s+instructions?/i,
    descricao: "override de instruções (en)",
  },
  {
    padrao: /ignore\s+(todas?\s+)?(as\s+)?instru[çc][õo]es\s+anteriores/i,
    descricao: "override de instruções (pt)",
  },
  {
    padrao: /you\s+are\s+now\s+(a\s+)?(dan|unrestricted|jailbroken)/i,
    descricao: "jailbreak por redefinição de papel",
  },
  {
    padrao: /\[SYSTEM\s*(OVERRIDE|PROMPT|INSTRUCTIONS?)\]/i,
    descricao: "injeção de bloco de sistema",
  },
  {
    // Tokens especiais de outros modelos (LLaMA, Mistral, Alpaca)
    // Alguns modelos tratam esses tokens como separadores de sistema
    padrao: /<\|system\|>|<\|user\|>|<\|assistant\|>|\[INST\]|\[\/INST\]/,
    descricao: "tokens de instrução de outros modelos",
  },
  {
    padrao: /(repita|repeat)\s+.{0,30}(system\s+)?prompt/i,
    descricao: "tentativa de exfiltração do system prompt",
  },
  {
    padrao: /act\s+as\s+if\s+(you\s+have\s+no|without)\s+(restrictions?|limits?|filters?)/i,
    descricao: "remoção de restrições",
  },
];

export function validarInput(mensagem: string, limiteChars = LIMITE_CHARS): ResultadoValidacao {
  // 1. Limite de tamanho
  if (mensagem.length > limiteChars) {
    return {
      valido: false,
      motivo: `Mensagem muito longa. Máximo ${limiteChars} caracteres (recebido: ${mensagem.length}).`,
    };
  }

  // 2. Padrões de injection conhecidos
  for (const { padrao, descricao } of PADROES_INJECTION) {
    if (padrao.test(mensagem)) {
      console.warn(
        `[GUARDRAIL] Bloqueado: "${descricao}" | input: "${mensagem.slice(0, 80).replace(/\n/g, " ")}"`
      );
      return {
        valido: false,
        motivo: "Mensagem contém padrão não permitido.",
      };
    }
  }

  return { valido: true };
}
