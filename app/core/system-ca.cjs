// Trust the Windows certificate store in addition to Node's bundled CA list.
//
// Antivirus HTTPS scanning (e.g. Kaspersky) re-signs TLS connections with its own root
// certificate, which is installed in the Windows store but not in Node's list. Without this
// every request made from the main process (Claude quota, Gmail/Outlook, weather, IMAP/POP3)
// can fail with SELF_SIGNED_CERT_IN_CHAIN while the browser works fine.
const tls = require('node:tls');

function trustSystemCertificates() {
  try {
    if (
      typeof tls.getCACertificates !== 'function' ||
      typeof tls.setDefaultCACertificates !== 'function'
    )
      return false;
    const all = new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')]);
    tls.setDefaultCACertificates([...all]);
    return true;
  } catch {
    return false;
  }
}

module.exports = { trustSystemCertificates };
