require('dotenv').config();
const { RootChain, ChildChain } = require('@omisego/omg-js');
const Quasar = require('@omisego/omg-quasar-js');
const Web3 = require('web3');
const { Account } = require('eth-lib');
const cron = require('node-cron');
const { startExit } = require('./initiate_exit');
const { repay } = require('./repayment');

const childChain = new ChildChain({
  watcherUrl: process.env.WATCHER_URL,
  plasmaContractAddress: process.env.PLASMAFRAMEWORK_CONTRACT_ADDRESS,
});

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.ETH_NODE));

const rootChain = new RootChain({
  web3,
  plasmaContractAddress: process.env.PLASMAFRAMEWORK_CONTRACT_ADDRESS,
});

const quasar = new Quasar({
  web3,
  quasarContractAddress: process.env.QUASAR_CONTRACT_ADDRESS,
});

const account = Account.fromPrivate(process.env.ACCOUNT_PK);

cron.schedule(process.env.SCHEDULE_START_EXIT, () => {
  startExit(childChain, rootChain, account, process.env.TOKEN, process.env.POLL_INTERVAL);
});

cron.schedule(process.env.SCHEDULE_PROCESS_EXIT, () => {
  repay(rootChain, web3, quasar, account, process.env.TOKEN);
});
