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

const Web3 = require('web3');
const ChildChain = require('@omisego/omg-js-childchain');
const RootChain = require('@omisego/omg-js-rootchain');
const { transaction } = require('@omisego/omg-js-util');
const chai = require('chai');
const { fromPrivate } = require('eth-lib').Account;
const numberToBN = require('number-to-bn');
const promiseRetry = require('promise-retry');
const path = require('path');
const config = require('../test-config');
const rcHelper = require('../helpers/rootChainHelper');
const faucet = require('../helpers/faucet');
const ccHelper = require('../helpers/childChainHelper');
const QuasarHelper = require('../helpers/quasarHelper');
const Quasar = require('../../src/quasar');
const PiggyBacker = require('../../src/piggybacker');

const { assert } = chai;
const faucetName = path.basename(__filename);
const POLL_INTERVAL = 30000;

describe('Quasar IFE Piggyback test', () => {
  const web3 = new Web3(new Web3.providers.HttpProvider(config.eth_node));
  const rootChain = new RootChain({
    web3,
    plasmaContractAddress: config.plasmaframework_contract_address,
  });
  const childChain = new ChildChain({
    watcherUrl: config.watcher_url,
    watcherProxyUrl: config.watcher_proxy_url,
    plasmaContractAddress: config.plasmaframework_contract_address,
  });

  const quasarSupplierAccount = rcHelper.createAccount(web3);
  const quasar = new Quasar(web3, config.quasar_contract_address);
  const quasarOwner = fromPrivate(config.quasar_owner_private_key);
  const piggybacker = new PiggyBacker(childChain, rootChain, quasar, quasarOwner, POLL_INTERVAL);
  const quasarHelper = new QuasarHelper(web3, config.quasar_contract_address);

  before(async () => {
    await faucet.init({
      rootChain, childChain, web3, config, faucetName,
    });
    this.quasarBond = await quasarHelper.bondValue();
  });

  describe('When an IFE Claim is started', () => {
    const INTIIAL_ALICE_AMOUNT = web3.utils.toWei('.001', 'ether');
    const INTIIAL_ALICE_RC_AMOUNT = web3.utils.toWei('.5', 'ether');
    const INTIIAL_SUPPLIER_RC_AMOUNT = web3.utils.toWei('.1', 'ether');

    let aliceAccount;
    let quasarOwnerAddress;

    before(async () => {
      aliceAccount = rcHelper.createAccount(web3);

      quasarOwnerAddress = await quasarHelper.quasarOwner();

      await Promise.all([
        // Give some ETH to Alice on the child chain
        faucet.fundChildchain(
          aliceAccount.address,
          INTIIAL_ALICE_AMOUNT,
          transaction.ETH_CURRENCY,
        ),
        // Give some ETH to Alice on the root chain
        faucet.fundRootchainEth(aliceAccount.address, INTIIAL_ALICE_RC_AMOUNT),
      ]);

      // Give some ETH to quasarSupplier on the root chain
      await faucet.fundRootchainEth(quasarSupplierAccount.address, INTIIAL_SUPPLIER_RC_AMOUNT);

      // Wait for finality
      await Promise.all([
        ccHelper.waitForBalanceEq(
          childChain,
          aliceAccount.address,
          INTIIAL_ALICE_AMOUNT,
        ),
        rcHelper.waitForEthBalanceEq(
          web3,
          quasarSupplierAccount.address,
          INTIIAL_SUPPLIER_RC_AMOUNT,
        ),
        rcHelper.waitForEthBalanceEq(
          web3,
          aliceAccount.address,
          INTIIAL_ALICE_RC_AMOUNT,
        ),
      ]);

      // Make some transfers to pass the safe block limit
      const safeBlockMargin = await quasarHelper.safeBlockMargin();
      for (let i = 0; i < safeBlockMargin; i++) {
        await faucet.fundChildchain(quasarSupplierAccount.address, 10, transaction.ETH_CURRENCY);
        await rcHelper.sleep(16000);
      }

      // Give Alice some ETH for fees
      const fees = (await childChain.getFees())['1'];
      const { amount: feeEthAmountWei } = fees.find((f) => f.currency === transaction.ETH_CURRENCY);
      await faucet.fundChildchain(aliceAccount.address, feeEthAmountWei, transaction.ETH_CURRENCY);

      // Provide liquidity to the quasar
      await quasarHelper.addEthCapacity(INTIIAL_ALICE_AMOUNT, quasarSupplierAccount);

      await ccHelper.waitForBalanceEq(
        childChain,
        aliceAccount.address,
        numberToBN(INTIIAL_ALICE_AMOUNT).add(numberToBN(feeEthAmountWei)),
      );

      piggybacker.start();
    });

    after(async () => {
      try {
        await faucet.returnFunds(aliceAccount);
        await faucet.returnFunds(quasarSupplierAccount);
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`);
      }

      piggybacker.stop();
    });

    it('should piggyback the IFE', async () => {
      // Alice gets a ticket from the Quasar to fast exit a utxo
      const [utxo] = await childChain.getUtxos(aliceAccount.address);
      const { txbytes, proof } = await childChain.getExitData(utxo);
      const utxoPos = transaction.encodeUtxoPos(utxo);
      await quasarHelper.obtainTicket(
        utxoPos,
        txbytes,
        proof,
        aliceAccount,
      );

      // Alice sends output to quasar owner, but the tx not included
      const quasarTx = await ccHelper.createTx(
        childChain,
        aliceAccount.address,
        quasarOwnerAddress,
        INTIIAL_ALICE_AMOUNT,
        transaction.ETH_CURRENCY,
        aliceAccount.privateKey,
        rootChain.plasmaContractAddress,
      );

      // Alice starts a plasma IFE
      const exitData = await childChain.inFlightExitGetData(quasarTx);
      await rootChain.startInFlightExit({
        inFlightTx: exitData.in_flight_tx,
        inputTxs: exitData.input_txs,
        inputUtxosPos: exitData.input_utxos_pos,
        inputTxsInclusionProofs: exitData.input_txs_inclusion_proofs,
        inFlightTxSigs: exitData.in_flight_tx_sigs,
        txOptions: {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address,
        },
      });

      // Alice starts a Quasar IFE
      await quasarHelper.ifeClaim(utxoPos, exitData.in_flight_tx, aliceAccount);

      console.log('Waiting for piggyback...');

      assert.isTrue(await promiseRetry(async (retry) => {
        const watcherStatus = await childChain.status();
        for (let i = 0; i < watcherStatus.in_flight_exits.length; i++) {
          const ifeSelected = watcherStatus.in_flight_exits[i];
          if (ifeSelected.txbytes === exitData.in_flight_tx) {
            if (ifeSelected.piggybacked_outputs.length !== 0) {
              return true;
            }
          }
        }
        retry();
      }, {
        minTimeout: POLL_INTERVAL,
        factor: 1,
        retries: 5,
      }));
    });
  });
});
