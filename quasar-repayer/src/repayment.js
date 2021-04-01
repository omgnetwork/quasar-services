const numberToBN = require('number-to-bn');

async function repay(rootChain, web3, quasar, account, token) {
  // fetch exit queue for token
  const exitQueue = await rootChain.getExitQueue(token);
  console.log(exitQueue);
  const blocknum = await web3.eth.getBlockNumber();
  const timestampNow = (await web3.eth.getBlock(blocknum)).timestamp;
  // fethc exits that are exitable from the queue
  const exitableExitQueue = exitQueue.filter((exit) => exit.exitableAt < timestampNow);
  console.log(exitableExitQueue);
  const exitIdArr = exitableExitQueue.map((exit) => exit.exitId);

  const peg = await rootChain.getPaymentExitGame();

  // fetch all exitData
  const exitsInQueue = await peg.contract.methods.standardExits(exitIdArr).call();
  console.log(exitsInQueue);
  // exits of the quasar owner
  const filteredExits = exitsInQueue.filter(
    (exit) => exit.exitTarget.toLowerCase() === account.address.toLowerCase(),
  );
  console.log(filteredExits);
  if (filteredExits.length > 0) {
    // get total amount to exit and repay
    const totalAmount = filteredExits.reduce(
      (acc, curr) => acc.add(numberToBN(curr.amount.toString())),
      numberToBN(0),
    );

    const finalUtxoPos = filteredExits[filteredExits.length - 1].utxoPos;
    // find index position of the last utxo of the quasar owner in the queue
    const index = exitsInQueue.findIndex((exit) => exit.utxoPos === finalUtxoPos);
    console.log(index);
    console.log(await web3.eth.getBalance(account.address));
    const tx = await rootChain.processExits({
      token,
      exitId: 0,
      maxExitsToProcess: index + 1,
      txOptions: {
        privateKey: account.privateKey,
        from: account.address,
      },
    });

    console.log(tx);
    console.log(await web3.eth.getBalance(account.address));
    const tx2 = await quasar.repayOwedToken({
      amount: totalAmount.toString(),
      currency: token,
      txOptions: {
        privateKey: account.privateKey,
        from: account.address,
      },
    });
    console.log(tx2);
  } else {
    console.log('No Exit in queue');
  }
}

module.exports = {
  repay,
};
