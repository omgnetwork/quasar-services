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

require('dotenv').config();

const config = {
  eth_node: process.env.ETH_NODE,
  watcher_url: process.env.WATCHER_URL,
  watcher_proxy_url: process.env.WATCHER_PROXY_URL,
  plasmaframework_contract_address: process.env.PLASMA_CONTRACT_ADDRESS,
  erc20_contract_address: process.env.ERC20_CONTRACT_ADDRESS,
  fund_account: process.env.FUND_ACCOUNT,
  fund_account_private_key: process.env.FUND_ACCOUNT_PRIVATEKEY,
  min_amount_eth_per_test: process.env.MIN_AMOUNT_ETH_PER_TEST,
  min_amount_erc20_per_test: process.env.MIN_AMOUNT_ERC20_PER_TEST,
  topup_multipler: process.env.TOPUP_MULTIPLIER,
  faucet_salt: process.env.FAUCET_SALT,
  quasar_contract_address: process.env.QUASAR_CONTRACT_ADDRESS,
  quasar_owner_private_key: process.env.QUASAR_OWNER_PRIVATE_KEY,
  exit_period: process.env.EXIT_PERIOD,
};

module.exports = config;
