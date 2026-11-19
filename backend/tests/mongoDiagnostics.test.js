const test = require('node:test');
const assert = require('node:assert/strict');
const { mongoFailureCategory } = require('../utils/mongoDiagnostics');

test('database diagnostics return fixed categories, never raw credentials or messages', () => {
  const secret = 'mongodb+srv://private-user:private-password@private-host/db';
  const cases = [
    [{ code: 'MONGODB_URI_MISSING', message: secret }, 'MISSING_URI'],
    [{ code: 18, message: secret }, 'AUTH_FAILED'],
    [{ code: 8000, message: `bad auth : authentication failed ${secret}` }, 'AUTH_FAILED'],
    [{ code: 'ENOTFOUND', message: secret }, 'DNS_ERROR'],
    [{ code: 'CERT_HAS_EXPIRED', message: secret }, 'TLS_ERROR'],
    [{ name: 'MongoParseError', message: secret }, 'INVALID_URI_OR_OPTIONS'],
    [{ code: 'ECONNREFUSED', message: secret }, 'NETWORK_ERROR'],
    [{ name: 'MongoServerSelectionError', message: secret }, 'CONNECTION_TIMEOUT'],
    [{ message: secret }, 'UNKNOWN_CONNECTION_ERROR'],
    [null, 'UNKNOWN_CONNECTION_ERROR'],
  ];
  for (const [error, expected] of cases) {
    assert.equal(mongoFailureCategory(error), expected);
  }
});

test('nested server and cause errors take precedence over generic selection timeout', () => {
  const error = {
    name: 'MongoServerSelectionError',
    reason: { servers: new Map([['private-host', { error: { cause: { code: 'ENOTFOUND' } } }]]) },
  };
  assert.equal(mongoFailureCategory(error), 'DNS_ERROR');
  error.cause = error;
  assert.equal(mongoFailureCategory(error), 'DNS_ERROR');
});
