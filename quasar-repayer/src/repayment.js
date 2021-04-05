const numberToBN = require('number-to-bn');

async function repay(rootChain, web3, quasar, account, token) {
  // fetch exit queue for token
  const exitQueue = await rootChain.getExitQueue(token);
  const blocknum = await web3.eth.getBlockNumber();
  const timestampNow = (await web3.eth.getBlock(blocknum)).timestamp;
  // fethc exits that are exitable from the queue
  const exitableExitQueue = exitQueue.filter((exit) => exit.exitableAt < timestampNow);
  const exitIdArr = exitableExitQueue.map((exit) => exit.exitId);

  const peg = await rootChain.getPaymentExitGame();

  // fetch all exitData
  const exitsInQueue = await peg.contract.methods.standardExits(exitIdArr).call();
  // exits of the quasar owner
  const filteredExits = exitsInQueue.filter(
    (exit) => exit.exitTarget.toLowerCase() === account.address.toLowerCase(),
  );

  if (filteredExits.length > 0) {
    // get total amount to exit and repay
    const totalAmount = filteredExits.reduce(
      (acc, curr) => acc.add(numberToBN(curr.amount.toString())),
      numberToBN(0),
    );

    const finalUtxoPos = filteredExits[filteredExits.length - 1].utxoPos;
    // find index position of the last utxo of the quasar owner in the queue
    const index = exitsInQueue.findIndex((exit) => exit.utxoPos === finalUtxoPos);

    await rootChain.processExits({
      token,
      exitId: 0,
      maxExitsToProcess: index + 1,
      txOptions: {
        privateKey: account.privateKey,
        from: account.address,
      },
    });

    await quasar.repayOwedToken({
      amount: totalAmount.toString(),
      currency: token,
      txOptions: {
        privateKey: account.privateKey,
        from: account.address,
      },
    });
  } else {
    console.log('No Exit in queue');
  }
}

module.exports = {
  repay,
};
