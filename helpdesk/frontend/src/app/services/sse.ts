// Lê um corpo SSE (text/event-stream) e chama onEvento para cada `data: {...}` recebido.
//
// Um único read() pode trazer vários eventos — ou só metade de um. Por isso o texto
// é acumulado num buffer e só as linhas completas (terminadas em \n) são processadas;
// o pedaço final incompleto fica guardado até o próximo read().
export async function lerEventosSSE(
  response: Response,
  onEvento: (data: any) => void
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processarLinha = (line: string) => {
    if (!line.startsWith('data: ')) return;
    try {
      onEvento(JSON.parse(line.slice(6)));
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
}
