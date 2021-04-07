const promiseRetry = require('promise-retry');

async function getExitData(utxoToExit, childChain, pollInterval) {
  return promiseRetry(async (retry) => {
    try {
      const exitData = await childChain.getExitData(utxoToExit);
      if (exitData) {
        return exitData;
      }
    } catch (error) {
      retry();
    }
  }, {
    minTimeout: pollInterval,
    factor: 1,
    retries: 10,
  });
}

module.exports = {
  getExitData,
};
