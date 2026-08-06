// Minimal logger wrapper -- swap this out for pino/winston once you need
// log aggregation, but keep the same info/error interface so callers
// don't need to change.
function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  info: (...args) => console.log(`[${timestamp()}] INFO`, ...args),
  error: (...args) => console.error(`[${timestamp()}] ERROR`, ...args),
};
