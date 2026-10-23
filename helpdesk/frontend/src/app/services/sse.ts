// Lê um corpo SSE (text/event-stream) e chama onEvento para cada `data: {...}` recebido.
//
// Um único read() pode trazer vários eventos — ou só metade de um. Por isso o texto
// é acumulado num buffer e só as linhas completas (terminadas em \n) são processadas;
// o pedaço final incompleto fica guardado até o próximo read().
//
// Lança erro (que o chamador trata no .catch) quando:
//   - o backend responde fora do formato SSE (ex: 400 do guardrail, com JSON { erro })
//   - o stream termina sem um evento final { done } ou { erro } (conexão caiu no meio)
export async function lerEventosSSE(
  response: Response,
  onEvento: (data: any) => void
): Promise<void> {
  if (!response.ok || !response.body) {
    let motivo = `Erro ${response.status} ao processar a mensagem.`;
    try {
      const corpo = await response.json();
      if (corpo?.erro) motivo = corpo.erro;
    } catch { /* corpo não é JSON — usa a mensagem genérica */ }
    throw new Error(motivo);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalizado = false;

  const processarLinha = (line: string) => {
    if (!line.startsWith('data: ')) return;
    try {
      const data = JSON.parse(line.slice(6));
      if (data.done || data.erro) finalizado = true;
      onEvento(data);
    } catch { /* evento malformado — ignora */ }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() ?? '';
    for (const line of linhas) processarLinha(line);
  }

  buffer += decoder.decode();
  if (buffer) processarLinha(buffer);

  if (!finalizado) {
    throw new Error('A conexão foi encerrada antes do fim da resposta.');
  }
}
