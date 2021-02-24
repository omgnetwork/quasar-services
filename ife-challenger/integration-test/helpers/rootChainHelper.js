/*
Copyright 2019 OmiseGO Pte Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */

const promiseRetry = require('promise-retry');
const { getErc20Balance } = require('@omisego/omg-js-util');
const numberToBN = require('number-to-bn');
const { utils } = require('web3');

function createAccount(web3) {
  const ret = web3.eth.accounts.create();
  ret.address = ret.address.toLowerCase();
  return ret;
}

async function setGas(eth, txDetails) {
  if (!txDetails.gas) {
    try {
      txDetails.gas = await eth.estimateGas(txDetails);
    } catch (err) {
      throw new Error(`Error estimating gas: ${err}`);
    }
  }
  if (!txDetails.gasPrice) {
    try {
      txDetails.gasPrice = await eth.getGasPrice();
    } catch (err) {
      txDetails.gasPrice = '1000000000';
      console.warn('Error getting gas price: ', err);
    }
  }
}

async function sendTransaction(web3, txDetails, privateKey) {
  await setGas(web3.eth, txDetails);
  if (!privateKey) {
    return web3.eth.sendTransaction(txDetails);
  }
  const signedTx = await web3.eth.accounts.signTransaction(txDetails, privateKey);
  return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

async function spentOnGas(web3, receipt) {
  const tx = await web3.eth.getTransaction(receipt.transactionHash);
  return utils.toBN(tx.gasPrice).muln(receipt.gasUsed);
}

function waitForEthBalance(web3, address, callback) {
  return promiseRetry(async (retry, number) => {
    console.log(`Waiting for ETH balance...  (${number})`);
    const resp = await web3.eth.getBalance(address);
    if (!callback(resp)) {
      retry();
    }
    return resp;
  }, {
    minTimeout: 2000,
    factor: 1,
    retries: 30,
  });
}

function waitForEthBalanceEq(web3, address, expectedAmount) {
  const expectedBn = numberToBN(expectedAmount);
  return waitForEthBalance(web3, address, (balance) => numberToBN(balance).eq(expectedBn));
}

function waitForERC20Balance(web3, address, contractAddress, callback) {
  return promiseRetry(async (retry, number) => {
    console.log(`Waiting for ERC20 balance...  (${number})`);
    const resp = await getErc20Balance({ web3, erc20Address: contractAddress, address });
    if (!callback(resp)) {
      retry();
    }
    return resp;
  }, {
    minTimeout: 2000,
    factor: 1,
    retries: 30,
  });
}

function waitForERC20BalanceEq(web3, address, contractAddress, expectedAmount) {
  const expectedBn = numberToBN(expectedAmount);
  return waitForERC20Balance(web3, address, contractAddress, (balance) => numberToBN(balance).eq(expectedBn));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function awaitTx(web3, txnHash, options) {
  const interval = options && options.interval ? options.interval : 1000;
  const blocksToWait = options && options.blocksToWait ? options.blocksToWait : 1;

  var transactionReceiptAsync = async function (txnHash, resolve, reject) {
    try {
      const receipt = await web3.eth.getTransactionReceipt(txnHash);
      if (!receipt) {
        setTimeout(() => {
          transactionReceiptAsync(txnHash, resolve, reject);
        }, interval);
      } else if (blocksToWait > 0) {
        const resolvedReceipt = await receipt;
        if (!resolvedReceipt || !resolvedReceipt.blockNumber) {
          setTimeout(() => {
            transactionReceiptAsync(txnHash, resolve, reject);
          }, interval);
        } else {
          try {
            const block = await web3.eth.getBlock(resolvedReceipt.blockNumber);
            const current = await web3.eth.getBlock('latest');
            if (current.number - block.number >= blocksToWait) {
              const txn = await web3.eth.getTransaction(txnHash);
              if (txn.blockNumber != null) {
                resolve(resolvedReceipt);
              } else {
                reject(new Error(`Transaction with hash: ${txnHash} ended up in an uncle block.`));
              }
            } else {
              setTimeout(() => {
                transactionReceiptAsync(txnHash, resolve, reject);
              }, interval);
            }
          } catch (e) {
            setTimeout(() => {
              transactionReceiptAsync(txnHash, resolve, reject);
            }, interval);
          }
        }
      } else resolve(receipt);
    } catch (e) {
      reject(e);
    }
  };

  if (Array.isArray(txnHash)) {
    const promises = [];
    txnHash.forEach((oneTxHash) => {
      promises.push(awaitTx(web3, oneTxHash, options));
    });
    return Promise.all(promises);
  }
  return new Promise((resolve, reject) => {
    transactionReceiptAsync(txnHash, resolve, reject);
  });
}

module.exports = {
  createAccount,
  waitForEthBalance,
  waitForEthBalanceEq,
  waitForERC20Balance,
  waitForERC20BalanceEq,
  sleep,
  sendTransaction,
  spentOnGas,
  setGas,
  awaitTx,
};
