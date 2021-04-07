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
const { RootChain, ChildChain } = require('@omisego/omg-js');
const Quasar = require('@omisego/omg-quasar-js');
const { transaction } = require('@omisego/omg-js-util');
const chai = require('chai');
const numberToBN = require('number-to-bn');
const promiseRetry = require('promise-retry');
const path = require('path');
const config = require('../test-config');
const rcHelper = require('../helpers/rootChainHelper');
const faucet = require('../helpers/faucet');
const ccHelper = require('../helpers/childChainHelper');
const QuasarHelper = require('../helpers/quasarHelpers');

const { assert } = chai;
const faucetName = path.basename(__filename);
const POLL_INTERVAL = 3000;

describe('Quasar Repayment test', () => {
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

  const quasarHelper = new QuasarHelper(web3, config.quasar_contract_address);

  const quasarSupplierAccount = rcHelper.createAccount(web3);
  const quasar = new Quasar({
    web3,
    quasarContractAddress: config.quasar_contract_address,
  });

  before(async () => {
    await faucet.init({
      rootChain, childChain, web3, config, faucetName,
    });
    this.quasarBond = await quasar.bondValue();
  });

  describe('When the Quasar Owner standard exits', () => {
    const INTIIAL_ALICE_AMOUNT = web3.utils.toWei('.001', 'ether');
    const INTIIAL_ALICE_RC_AMOUNT = web3.utils.toWei('.5', 'ether');
    const INTIIAL_SUPPLIER_RC_AMOUNT = web3.utils.toWei('.1', 'ether');

    let aliceAccount;
    let quasarOwnerAddress;

    before(async () => {
      aliceAccount = rcHelper.createAccount(web3);

      quasarOwnerAddress = await quasar.quasarOwner();

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
      const safeBlockMargin = await quasar.safeBlockMargin();
      for (let i = 0; i < safeBlockMargin; i++) {
        await faucet.fundChildchain(quasarSupplierAccount.address, 10, transaction.ETH_CURRENCY);
        await rcHelper.sleep(16000);
      }

      // Give Alice some ETH for fees
      const fees = (await childChain.getFees())['1'];
      const { amount: feeEthAmountWei } = fees.find((f) => f.currency === transaction.ETH_CURRENCY);
      await faucet.fundChildchain(aliceAccount.address, feeEthAmountWei, transaction.ETH_CURRENCY);

      await ccHelper.waitForBalanceEq(
        childChain,
        aliceAccount.address,
        numberToBN(INTIIAL_ALICE_AMOUNT).add(numberToBN(feeEthAmountWei)),
      );

      // Provide liquidity to the quasar
      await quasar.addEthCapacity({
        value: INTIIAL_ALICE_AMOUNT,
        txOptions: {
          from: quasarSupplierAccount.address,
          privateKey: quasarSupplierAccount.privateKey,
        },
      });

      // Alice gets a ticket from the Quasar to fast exit a utxo
      const [utxo] = await childChain.getUtxos(aliceAccount.address);
      const { txbytes, proof } = await childChain.getExitData(utxo);
      const utxoPos = transaction.encodeUtxoPos(utxo);
      await quasar.obtainTicket({
        utxoPos,
        rlpOutputCreationTx: txbytes,
        outputCreationTxInclusionProof: proof,
        txOptions: {
          from: aliceAccount.address,
          privateKey: aliceAccount.privateKey,
        },
      });

      // Alice sends output to quasar owner
      const quasarTx = await ccHelper.send(
        childChain,
        aliceAccount.address,
        quasarOwnerAddress,
        INTIIAL_ALICE_AMOUNT,
        transaction.ETH_CURRENCY,
        aliceAccount.privateKey,
        rootChain.plasmaContractAddress,
      );

      let utxoPosQuasarOwner;
      let utxoQuasarOwner;

      assert.isTrue(await promiseRetry(async (retry) => {
        const allUtxos = await childChain.getUtxos(quasarOwnerAddress);
        const utxosFiltered = allUtxos
          .filter((utxo) => utxo.creating_txhash === quasarTx.result.txhash);
        if (utxosFiltered.length !== 0) {
          utxoPosQuasarOwner = utxosFiltered[0].utxo_pos;
          utxoQuasarOwner = utxosFiltered[0];
          return true;
        }
        retry();
      }, {
        minTimeout: POLL_INTERVAL,
        factor: 1,
        retries: 5,
      }));

      this.aliceEthBalanceBeforeClaim = await web3.eth.getBalance(aliceAccount.address);
      // Alice claims with the Quasar
      const { txbytes: rlpTxToQuasarOwner, proof: txToQuasarOwnerInclusionProof } = await childChain.getExitData(utxoQuasarOwner);
      const claimTxAfter = await quasar.claim({
        utxoPos,
        utxoPosQuasarOwner,
        rlpTxToQuasarOwner,
        txToQuasarOwnerInclusionProof,
        txOptions: {
          from: aliceAccount.address,
          privateKey: aliceAccount.privateKey,
        },
      });

      if (claimTxAfter) {
        console.log(`Alice claimed Liquid funds from Quasar: txhash = ${claimTxAfter.transactionHash}`);
        this.aliceSpentOnGas = await rcHelper.spentOnGas(web3, claimTxAfter);
        await rcHelper.awaitTx(web3, claimTxAfter.transactionHash);
      }
    });

    after(async () => {
      try {
        await faucet.returnFunds(aliceAccount);
        await faucet.returnFunds(quasarSupplierAccount);
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`);
      }
    });

    it('should return back liquid funds', async () => {
      // Get Alice's ETH balance
      let aliceEthBalanceAfterClaim = await web3.eth.getBalance(aliceAccount.address);
      const ethFee = await quasar.getQuasarFee();
      const expected = web3.utils
        .toBN(this.aliceEthBalanceBeforeClaim)
        .add(web3.utils.toBN(INTIIAL_ALICE_AMOUNT))
        .sub(web3.utils.toBN(ethFee))
        .add(web3.utils.toBN(this.quasarBond))
        .sub(web3.utils.toBN(this.aliceSpentOnGas));
      assert.equal(aliceEthBalanceAfterClaim.toString(), expected.toString());

      const quasarCapacityBefore = await quasarHelper.quasarOwedCapacity(transaction.ETH_CURRENCY);
      console.log('Waiting to Repay...');
      await rcHelper.sleep(config.exit_period);

      const quasarCapacityAfter = await quasarHelper.quasarOwedCapacity(transaction.ETH_CURRENCY);
      const expectedQuasarCapacity = quasarCapacityBefore.owedAmount - INTIIAL_ALICE_AMOUNT;
      assert.equal(quasarCapacityAfter.owedAmount, expectedQuasarCapacity);
    });
  });
});
