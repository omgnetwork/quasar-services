const { transaction } = require('@omisego/omg-js-util');
const { merge } = require('./recursive_merge');
const { getExitData } = require('./exit_data');

async function startExit(childChain, rootChain, account, token, pollInterval) {
  // check getutxo gives all pages
  const allUtxos = await childChain.getUtxos(account.address);
  if (allUtxos.length === 0) {
    console.log('No Utxos, skipped.');
  } else {
    // check if there are no utxos
    // check filter every token or individually
    const utxosFiltered = allUtxos
      .filter((utxo) => utxo.currency.toLowerCase() === token.toLowerCase());
    const finalUtxo = await merge(utxosFiltered, childChain, account);
    console.log(finalUtxo);
    const utxoPos = await transaction.encodeUtxoPos(finalUtxo[0]);
    console.log(utxoPos.toString());

    const exitData = await getExitData(finalUtxo[0], childChain, pollInterval);
    console.log(exitData);

    // startExit

    const tx = await rootChain.startStandardExit({
      utxoPos: utxoPos.toString(),
      outputTx: exitData.txbytes,
      inclusionProof: exitData.proof,
      txOptions: {
        privateKey: account.privateKey,
        from: account.address,
      },
    });

    const ethQueue = await rootChain.getExitQueue();
    console.log(ethQueue);

    console.log(tx);
  }
}

module.exports = {
  startExit,
};
