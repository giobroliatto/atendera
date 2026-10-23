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
      respostaComPedacos(['data: {"chunk":"a"}\n\ndata: {"chunk":"b"}\n\n']),
      (d) => eventos.push(d)
    );
    expect(eventos).toEqual([{ chunk: 'a' }, { chunk: 'b' }]);
  });

  it('não perde um evento dividido entre dois reads', async () => {
    const eventos: any[] = [];
    await lerEventosSSE(
      respostaComPedacos(['data: {"chunk":"Para ', 'resolver"}\n\ndata: {"done":true}\n\n']),
      (d) => eventos.push(d)
    );
    expect(eventos).toEqual([{ chunk: 'Para resolver' }, { done: true }]);
  });
});
