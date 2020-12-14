function verifyBlocksResponse(blocksResponse) {
  if (!Array.isArray(blocksResponse)) {
    throw new Error('Blocks response must be an array');
  }
}

module.exports = {
  verifyBlocksResponse
};
