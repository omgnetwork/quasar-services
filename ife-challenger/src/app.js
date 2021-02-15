require('dotenv').config();
const ChildChain = require('@omisego/omg-js-childchain');
const Web3 = require('web3');
const { fromPrivate } = require('eth-lib').Account;
const Challenger = require('./challenger');
const Quasar = require('./quasar');

const POLL_INTERVAL = process.env.SERVER_POLL_INTERVAL * 1000;

const childChain = new ChildChain({
  watcherUrl: process.env.WATCHER_URL,
  plasmaContractAddress: process.env.PLASMA_CONTRACT_ADDRESS,
});

const web3 = new Web3(
  new Web3.providers.HttpProvider(process.env.ETH_NODE),
  null,
  { transactionConfirmationBlocks: 1 },
);

const quasar = new Quasar(web3, process.env.QUASAR_CONTRACT_ADDRESS);

const challengerAccount = fromPrivate(process.env.CHALLENGER_PRIVATE_KEY);
const challenger = new Challenger(childChain, quasar, challengerAccount, POLL_INTERVAL);

challenger.start();
