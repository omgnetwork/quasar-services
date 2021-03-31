require('dotenv').config();
const { RootChain, ChildChain } = require('@omisego/omg-js');
const Web3 = require('web3');
const { Account } = require('eth-lib');
const { merge } = require('./recursive_merge');
const { getExitData } = require('./repayment');

const childChain = new ChildChain({
  watcherUrl: process.env.WATCHER_URL,
  plasmaContractAddress: process.env.PLASMAFRAMEWORK_CONTRACT_ADDRESS,
});

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_NODE));

const rootChain = new RootChain({
  web3,
  plasmaContractAddress: process.env.PLASMAFRAMEWORK_CONTRACT_ADDRESS,
});

async function main() {
  const account = Account.fromPrivate(process.env.ACCOUNT_PK);

  // check getutxo gives all pages
  const allUtxos = await childChain.getUtxos(account.address);
  if (allUtxos.length === 0) {
    console.log('No Utxos, skipped.');
  } else {
    // check if there are no utxos
    // check filter every token or individually
    const utxosFiltered = allUtxos
      .filter((utxo) => utxo.currency.toLowerCase() === process.env.TOKEN.toLowerCase());
    const finalUtxo = await merge(utxosFiltered, childChain, account);
    console.log(finalUtxo);
    const utxoPos = await finalUtxo[0].blknum * 1000000000 + finalUtxo[0].txindex * 10000 + finalUtxo[0].oindex;
    console.log(utxoPos);

    const exitData = await getExitData(finalUtxo[0], childChain, process.env.POLL_INTERVAL);
    console.log(exitData);

    // startExit

    const tx = await rootChain.startStandardExit({
      utxoPos,
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

//   const allUtxosNew = await childChain.getUtxos(account.address);
//   console.log(allUtxosNew);
//   const utxoToExit = await allUtxosNew.find((utxo) => utxo.utxo_pos === utxoPos);
//   console.log(utxoToExit);
//   // start an exit
//   const exitData = await childChain.getExitData(utxoToExit);
//   console.log(exitData);
//   const startStandardExitReceipt = await rootChain.startStandardExit({
//     utxoPos: exitData.utxo_pos,
//     outputTx: exitData.txbytes,
//     inclusionProof: exitData.proof,
//     txOptions: {
//       privateKey: account.privateKey,
//       from: account.address,
//     },
//   });
//   console.log(
//     `Merged and started exit on output: txhash = ${startStandardExitReceipt.transactionHash}`,
//   );

//   const exitQueue = await rootChain.getExitQueue();
  
//   console.log(exitQueue);
}
main();
