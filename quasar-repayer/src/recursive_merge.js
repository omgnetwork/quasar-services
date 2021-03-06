const numberToBN = require('number-to-bn');
const { transaction } = require('@omisego/omg-js-util');

function createMergeTx(utxo) {
  const totalAmount = utxo.reduce(
    (acc, curr) => acc.add(numberToBN(curr.amount.toString())),
    numberToBN(0),
  );

  const tx = {
    inputs: utxo,
    outputs: [],
  };

  tx.outputs.push({
    outputType: 1,
    outputGuard: utxo[0].owner,
    currency: utxo[0].currency,
    amount: totalAmount,
  });

  return tx;
}

function sign(childChain, tx, privateKeys) {
  const typedData = transaction.getTypedData(tx, childChain.plasmaContractAddress);
  const signatures = childChain.signTransaction(typedData, privateKeys);
  return childChain.buildSignedTransaction(typedData, signatures);
}

async function submit(childChain, tx, privateKey) {
  const privateKeys = new Array(tx.inputs.length).fill(privateKey);
  const signedTx = sign(childChain, tx, privateKeys);
  const { blknum, txindex } = await childChain.submitTransaction(signedTx);
  const nextUtxo = tx.outputs.map((output) => ({
    amount: output.amount,
    currency: output.currency,
    owner: output.outputGuard,
    blknum,
    txindex,
    oindex: 0,
  }));

  return nextUtxo;
}

async function merge(utxos, childChain, account) {
  if (utxos.flat().length === 1) {
    return utxos;
  }

  const utxoInGroups = utxos;
  const res = [];
  while (utxoInGroups.length !== 0) {
    res.push(utxoInGroups.splice(0, 4));
  }

  const txs = res.map((utxo) => createMergeTx(utxo));

  const results = await Promise.all(txs.map((tx) => submit(childChain, tx, account.privateKey)));
  const nextUtxos = results.flat();
  return merge(nextUtxos, childChain, account);
}

module.exports = {
  merge,
};
