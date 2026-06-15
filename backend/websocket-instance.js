/**
 * Holds the WebSocket server instance so routes can broadcast ticket updates.
 */
let wsInstance = null;

module.exports = {
  set: (ws) => { wsInstance = ws; },
  get: () => wsInstance
};
