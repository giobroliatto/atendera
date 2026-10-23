import { lerEventosSSE } from './sse';

function respostaComPedacos(pedacos: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of pedacos) controller.enqueue(encoder.encode(p));
      controller.close();
    },
  });
  return new Response(stream);
}

describe('lerEventosSSE', () => {
  it('processa vários eventos vindos no mesmo read', async () => {
    const eventos: any[] = [];
    await lerEventosSSE(
      respostaComPedacos(['data: {"chunk":"a"}\n\ndata: {"chunk":"b"}\n\ndata: {"done":true}\n\n']),
      (d) => eventos.push(d)
    );
    expect(eventos).toEqual([{ chunk: 'a' }, { chunk: 'b' }, { done: true }]);
  });

  it('não perde um evento dividido entre dois reads', async () => {
    const eventos: any[] = [];
    await lerEventosSSE(
      respostaComPedacos(['data: {"chunk":"Para ', 'resolver"}\n\ndata: {"done":true}\n\n']),
      (d) => eventos.push(d)
    );
    expect(eventos).toEqual([{ chunk: 'Para resolver' }, { done: true }]);
  });

  it('lança o motivo do erro quando o backend responde JSON com status de erro', async () => {
    const resposta = new Response(JSON.stringify({ erro: 'Mensagem contém padrão não permitido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(lerEventosSSE(resposta, () => {})).rejects.toThrow('Mensagem contém padrão não permitido.');
  });

  it('lança erro quando o stream termina sem done nem erro', async () => {
    await expect(
      lerEventosSSE(respostaComPedacos(['data: {"chunk":"meia resp"}\n\n']), () => {})
    ).rejects.toThrow();
  });
});
