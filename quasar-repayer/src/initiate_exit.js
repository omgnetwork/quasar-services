const { transaction } = require('@omisego/omg-js-util');
const { merge } = require('./recursive_merge');
const { getExitData } = require('./exit_data');

async function startExit(childChain, rootChain, account, token, pollInterval) {
  const allUtxos = await childChain.getUtxos(account.address);
  const utxosFiltered = allUtxos
    .filter((utxo) => utxo.currency.toLowerCase() === token.toLowerCase());
  if (utxosFiltered.length === 0) {
    console.log('No Utxos, skipped.');
  } else {
    // recursive merge the filtered Utxos
    const finalUtxo = await merge(utxosFiltered, childChain, account);
    const utxoPos = await transaction.encodeUtxoPos(finalUtxo[0]);
    const exitData = await getExitData(finalUtxo[0], childChain, pollInterval);

    // startExit
    await rootChain.startStandardExit({
      utxoPos: utxoPos.toString(),
      outputTx: exitData.txbytes,
      inclusionProof: exitData.proof,
      txOptions: {
        privateKey: account.privateKey,
        from: account.address,
      },
    });
  }
}

module.exports = {
  startExit,
};
