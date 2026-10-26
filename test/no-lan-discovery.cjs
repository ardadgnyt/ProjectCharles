// Transport tests must not advertise fake devices on the developer's LAN or
// compete with an open Charles instance. Keep real loopback TCP/HTTPS intact.
const dgram = require('node:dgram');
const { EventEmitter } = require('node:events');
module.exports = function isolateDiscovery(t) {
  const original = dgram.createSocket.bind(dgram);
  t.mock.method(dgram, 'createSocket', (options, ...args) => {
    // The route probe uses an unbound UDP socket without transmitting a packet.
    if (typeof options === 'string') return original(options, ...args);
    const socket = new EventEmitter();
    socket.bind = (_port, _ip, callback) => queueMicrotask(callback);
    socket.send = (...values) => { const callback=values.at(-1); if(typeof callback==='function')queueMicrotask(()=>callback(null)); };
    for (const method of ['unref','close','addMembership','dropMembership','setMulticastInterface','setMulticastTTL','setMulticastLoopback','setTTL']) socket[method]=()=>socket;
    return socket;
  });
};
