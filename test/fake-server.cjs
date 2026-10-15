const readline = require('node:readline');
const send = (x) => process.stdout.write(JSON.stringify(x) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') return send({ id: m.id, result: { userAgent: 'test' } });
  if (m.method === 'account/read')
    return send({ id: m.id, result: { account: { type: 'chatgpt', planType: 'plus' } } });
  if (m.method === 'model/list')
    return send({
      id: m.id,
      result: { data: [{ model: 'test-model', displayName: 'Test' }], nextCursor: null },
    });
  if (m.method === 'thread/start') {
    if (
      m.params.approvalPolicy !== 'untrusted' ||
      m.params.sandbox !== 'workspace-write' ||
      m.params.approvalsReviewer !== 'user'
    )
      return send({ id: m.id, error: { message: 'Unsafe config' } });
    return send({ id: m.id, result: { thread: { id: 't1' } } });
  }
  if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: { id: 'u1' } } });
    send({ method: 'turn/started', params: { threadId: 't1', turn: { id: 'u1' } } });
    send({
      method: 'item/started',
      params: {
        threadId: 't1',
        item: { id: 'i1', type: 'commandExecution', command: 'test command', status: 'inProgress' },
      },
    });
    send({
      id: 'approve-1',
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 't1', turnId: 'u1', itemId: 'i1', command: 'test command' },
    });
    return;
  }
  if (m.id === 'approve-1' && m.result) {
    send({ method: 'serverRequest/resolved', params: { threadId: 't1', requestId: m.id } });
    const text =
      JSON.stringify({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 't1',
          itemId: 'a1',
          delta: m.result.decision === 'accept' ? 'Türkçe: işlem onaylandı.' : 'İşlem reddedildi.',
        },
      }) + '\n';
    const bytes = Buffer.from(text);
    const at = bytes.indexOf(Buffer.from('ü')) + 1;
    process.stdout.write(bytes.subarray(0, at));
    setTimeout(() => {
      process.stdout.write(bytes.subarray(at));
      send({
        method: 'turn/completed',
        params: { threadId: 't1', turn: { id: 'u1', status: 'completed' } },
      });
    }, 15);
    return;
  }
  if (m.method === 'turn/interrupt') {
    send({ id: m.id, result: {} });
    send({
      method: 'turn/completed',
      params: { threadId: 't1', turn: { id: 'u1', status: 'interrupted' } },
    });
    return;
  }
  if (m.method === 'crash') process.exit(3);
  if (m.method === 'never') return;
  if (m.method === 'echo') send({ id: m.id, result: m.params });
});
