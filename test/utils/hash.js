const crypto = require('crypto');

function sha256(message, encoding) {
  return crypto.createHash('sha256').update(message, 'utf8').digest(encoding || 'base64');
}

module.exports = {
  sha256
};
