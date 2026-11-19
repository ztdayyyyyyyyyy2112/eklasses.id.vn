// Chỉ xuất nhãn cố định: tuyệt đối không log message, stack, URI hay credential.
function mongoFailureCategory(error) {
  const pending = [error];
  const seen = new Set();
  const categories = new Set();
  while (pending.length && seen.size < 40) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    const code = current.code;
    const name = typeof current.name === 'string' ? current.name : '';
    // Nội dung lỗi chỉ dùng nhận diện tại server, không bao giờ đưa vào log.
    const message = typeof current.message === 'string' ? current.message : '';
    if (code === 'MONGODB_URI_MISSING') categories.add('MISSING_URI');
    if (code === 18 || /AuthenticationFailed|bad auth|authentication failed/i.test(`${name} ${message}`)) categories.add('AUTH_FAILED');
    if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ESERVFAIL', 'EREFUSED'].includes(code)) categories.add('DNS_ERROR');
    if (/TLS|SSL|CERT/i.test(String(code || '')) || /TLS|SSL|certificate/i.test(`${name} ${message}`)) categories.add('TLS_ERROR');
    if (['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) categories.add('NETWORK_ERROR');
    if (/MongoParseError|MongoInvalidArgumentError/.test(name)) categories.add('INVALID_URI_OR_OPTIONS');
    if (['ETIMEDOUT', 'ETIMEOUT'].includes(code) || /Timeout|ServerSelection/i.test(name)) categories.add('CONNECTION_TIMEOUT');
    pending.push(current.cause, current.reason, current.error);
    // Lỗi chọn server thường bọc lỗi mạng thực của từng node trong Map này.
    if (current.servers instanceof Map) {
      for (const server of current.servers.values()) {
        if (pending.length >= 40) break;
        pending.push(server?.error);
      }
    }
  }
  return ['MISSING_URI', 'AUTH_FAILED', 'DNS_ERROR', 'TLS_ERROR', 'INVALID_URI_OR_OPTIONS', 'NETWORK_ERROR', 'CONNECTION_TIMEOUT']
    .find(category => categories.has(category)) || 'UNKNOWN_CONNECTION_ERROR';
}

module.exports = { mongoFailureCategory };
