// Deploy as a separate Staging Worker with no routes, secrets or storage bindings.
const SOURCE = 'https://api.ibb.gov.tr/ispark/Park';
const TIMEOUT_MS = 12000;
const MAX_BYTES = 1500000;

async function probe() {
  const started = Date.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const result = (outcome, metrics = {}) => ({
    probe: 'ispark-staging', checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started, outcome, ...metrics
  });

  let stage = 'connect';
  try {
    const response = await fetch(SOURCE, {
      headers: {Accept: 'application/json', 'User-Agent': 'ROTAPARK-ISPARK-staging-probe/1.0'},
      redirect: 'manual', cache: 'no-store', signal
    });
    const status = response.status;
    if (!response.ok) {
      await response.body?.cancel();
      return result('http_error', {status});
    }

    stage = 'body';
    const reader = response.body?.getReader();
    if (!reader) return result('empty_body', {status});
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return result('response_too_large', {status});
      }
      body += decoder.decode(value, {stream: true});
    }
    body += decoder.decode();

    stage = 'parse';
    const payload = JSON.parse(body);
    const rows = Array.isArray(payload) ? payload : payload?.data ?? payload?.parks;
    if (!Array.isArray(rows) || !rows.length) return result('invalid_payload', {status});

    const occupancyRows = rows.filter(row => row?.parkID != null
      && (typeof row.emptyCapacity === 'number'
        || (typeof row.emptyCapacity === 'string' && row.emptyCapacity.trim() !== ''))
      && Number.isInteger(Number(row.emptyCapacity)) && Number(row.emptyCapacity) >= 0);
    return result(occupancyRows.length ? 'reachable' : 'no_occupancy_rows', {
      status, rows: rows.length, rowsWithFreeCount: occupancyRows.length
    });
  } catch {
    return result(signal.aborted ? 'timeout' : stage === 'parse' ? 'invalid_json' : 'request_error', {stage});
  }
}

export default {
  async scheduled() {
    const summary = await probe();
    console.log(JSON.stringify(summary));
  }
};
