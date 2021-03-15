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
const numberToBN = require('number-to-bn');
const promiseRetry = require('promise-retry');
const path = require('path');
const config = require('../test-config');
const rcHelper = require('../helpers/rootChainHelper');
const faucet = require('../helpers/faucet');
const ccHelper = require('../helpers/childChainHelper');
const QuasarHelper = require('../helpers/quasarHelper');
const Quasar = require('../../src/quasar');
const Challenger = require('../../src/challenger');

const { assert } = chai;
const faucetName = path.basename(__filename);
const POLL_INTERVAL = 3000;

describe('Quasar IFE challenge test', () => {
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

  const quasarChallengerAccount = rcHelper.createAccount(web3);
  const quasar = new Quasar(web3, config.quasar_contract_address);
  const challenger = new Challenger(childChain, quasar, quasarChallengerAccount, POLL_INTERVAL);
  const quasarHelper = new QuasarHelper(web3, config.quasar_contract_address);

  before(async () => {
    await faucet.init({
      rootChain, childChain, web3, config, faucetName,
    });
    this.quasarBond = await quasarHelper.bondValue();
  });

  describe('When double spending the claim output', () => {
    const INTIIAL_ALICE_AMOUNT = web3.utils.toWei('.001', 'ether');
    const INTIIAL_ALICE_RC_AMOUNT = web3.utils.toWei('.5', 'ether');
    const INTIIAL_CHALLENGER_RC_AMOUNT = web3.utils.toWei('.1', 'ether');

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

      // Give some ETH to quasarChallenger on the root chain
      await faucet.fundRootchainEth(quasarChallengerAccount.address, INTIIAL_CHALLENGER_RC_AMOUNT);

      // Wait for finality
      await Promise.all([
        ccHelper.waitForBalanceEq(
          childChain,
          aliceAccount.address,
          INTIIAL_ALICE_AMOUNT,
        ),
        rcHelper.waitForEthBalanceEq(
          web3,
          quasarChallengerAccount.address,
          INTIIAL_CHALLENGER_RC_AMOUNT,
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
        await faucet.fundChildchain(quasarChallengerAccount.address, 10, transaction.ETH_CURRENCY);
        await rcHelper.sleep(16000);
      }

      // Give Alice some ETH for fees
      const fees = (await childChain.getFees())['1'];
      const { amount: feeEthAmountWei } = fees.find((f) => f.currency === transaction.ETH_CURRENCY);
      await faucet.fundChildchain(aliceAccount.address, feeEthAmountWei, transaction.ETH_CURRENCY);

      // Provide liquidity to the quasar
      await quasarHelper.addEthCapacity(INTIIAL_ALICE_AMOUNT, quasarChallengerAccount);

      await ccHelper.waitForBalanceEq(
        childChain,
        aliceAccount.address,
        numberToBN(INTIIAL_ALICE_AMOUNT).add(numberToBN(feeEthAmountWei)),
      );

      challenger.start();
    });

    after(async () => {
      try {
        await faucet.returnFunds(aliceAccount);
        await faucet.returnFunds(quasarChallengerAccount);
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`);
      }

      challenger.stop();
    });

    it('should challenge the IFE', async () => {
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

      // Alice double spends the output, so the IFE will be non-canonical
      const tempAccount = rcHelper.createAccount(web3);
      await ccHelper.send(
        childChain,
        aliceAccount.address,
        tempAccount.address,
        INTIIAL_ALICE_AMOUNT,
        transaction.ETH_CURRENCY,
        aliceAccount.privateKey,
        rootChain.plasmaContractAddress,
      );

      // Wait for the non_canonical_ife event
      const ife = await ccHelper.waitForEvent(
        childChain,
        'byzantine_events',
        (e) => e.event === 'non_canonical_ife' && e.details.txbytes === exitData.in_flight_tx,
      );

      // The Quasar Owner piggybacks the output
      await rootChain.piggybackInFlightExitOnOutput({
        inFlightTx: ife.details.txbytes,
        outputIndex: 0,
        txOptions: {
          privateKey: config.quasar_owner_private_key,
          from: quasarOwnerAddress,
        },
      });

      // The challenger should have challenged the Quasar IFE.
      // Might take a while, so retry if necessary.
      assert.isTrue(await promiseRetry(async (retry) => {
        const isQIFE = await quasar.isQuasarIfe(utxoPos);
        if (!isQIFE) {
          return true;
        }
        retry();
      }, {
        minTimeout: POLL_INTERVAL,
        factor: 1,
        retries: 5,
      }));

      // Finally, challenge the IFE so that the chain doesn't go byzantine
      const competitor = await childChain.inFlightExitGetCompetitor(ife.details.txbytes);
      await rootChain.challengeInFlightExitNotCanonical({
        inputTx: competitor.input_tx,
        inputUtxoPos: competitor.input_utxo_pos,
        inFlightTx: competitor.in_flight_txbytes,
        inFlightTxInputIndex: competitor.in_flight_input_index,
        competingTx: competitor.competing_txbytes,
        competingTxInputIndex: competitor.competing_input_index,
        competingTxPos: competitor.competing_tx_pos,
        competingTxInclusionProof: competitor.competing_proof,
        competingTxWitness: competitor.competing_sig,
        txOptions: {
          privateKey: faucet.faucetAccount.privateKey,
          from: faucet.faucetAccount.address,
        },
      });
    });
  });

  describe('When double spending another input of the claim tx', () => {
    const INTIIAL_ALICE_AMOUNT = web3.utils.toWei('.001', 'ether');
    const INTIIAL_ALICE_RC_AMOUNT = web3.utils.toWei('.5', 'ether');
    const INTIIAL_CHALLENGER_RC_AMOUNT = web3.utils.toWei('.1', 'ether');

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

      // Give some ETH to quasarChallenger on the root chain
      await faucet.fundRootchainEth(quasarChallengerAccount.address, INTIIAL_CHALLENGER_RC_AMOUNT);

      // Wait for finality
      await Promise.all([
        ccHelper.waitForBalanceEq(
          childChain,
          aliceAccount.address,
          INTIIAL_ALICE_AMOUNT,
        ),
        rcHelper.waitForEthBalanceEq(
          web3,
          quasarChallengerAccount.address,
          INTIIAL_CHALLENGER_RC_AMOUNT,
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
        await faucet.fundChildchain(quasarChallengerAccount.address, 10, transaction.ETH_CURRENCY);
        await rcHelper.sleep(16000);
      }

      // Give Alice enough fees for 2 txs
      const fees = (await childChain.getFees())['1'];
      const fee = fees.find((f) => f.currency === transaction.ETH_CURRENCY);
      this.feeEthAmountWei = fee.amount;
      await faucet.fundChildchain(
        aliceAccount.address,
        this.feeEthAmountWei * 2,
        transaction.ETH_CURRENCY,
      );

      // Provide liquidity to the quasar
      await quasarHelper.addEthCapacity(INTIIAL_ALICE_AMOUNT, quasarChallengerAccount);

      await ccHelper.waitForBalanceEq(
        childChain,
        aliceAccount.address,
        numberToBN(INTIIAL_ALICE_AMOUNT).add(numberToBN(this.feeEthAmountWei * 2)),
      );

      challenger.start();
    });

    after(async () => {
      try {
        await faucet.returnFunds(aliceAccount);
        await faucet.returnFunds(quasarChallengerAccount);
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`);
      }

      challenger.stop();
    });

    it('should challenge the IFE', async () => {
      // Alice gets a ticket from the Quasar to fast exit a utxo
      const utxos = await childChain.getUtxos(aliceAccount.address);
      const utxo = utxos[0];
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

      // Alice spends the _fee_ input of the claim tx.
      // This makes the IFE non-canonical
      const tempAccount = rcHelper.createAccount(web3);
      const feeUtxo = utxos[1];
      const txBody = {
        inputs: [feeUtxo],
        outputs: [{
          outputType: 1,
          outputGuard: tempAccount.address,
          currency: feeUtxo.currency,
          amount: this.feeEthAmountWei,
        }],
      };

      const typedData = transaction.getTypedData(txBody, rootChain.plasmaContractAddress);
      const signatures = childChain.signTransaction(typedData, [aliceAccount.privateKey]);

      const signedTx = childChain.buildSignedTransaction(typedData, signatures);
      await childChain.submitTransaction(signedTx);

      // Wait for the non_canonical_ife event
      const ife = await ccHelper.waitForEvent(
        childChain,
        'byzantine_events',
        (e) => e.event === 'non_canonical_ife' && e.details.txbytes === exitData.in_flight_tx,
      );

      // The Quasar Owner piggybacks the output
      await rootChain.piggybackInFlightExitOnOutput({
        inFlightTx: ife.details.txbytes,
        outputIndex: 0,
        txOptions: {
          privateKey: config.quasar_owner_private_key,
          from: quasarOwnerAddress,
        },
      });

      // The challenger should have challenged the Quasar IFE.
      // Might take a while, so retry if necessary.
      assert.isTrue(await promiseRetry(async (retry) => {
        const isQIFE = await quasar.isQuasarIfe(utxoPos);
        if (!isQIFE) {
          return true;
        }
        retry();
      }, {
        minTimeout: POLL_INTERVAL,
        factor: 1,
        retries: 5,
      }));

      // Finally, challenge the IFE so that the chain doesn't go byzantine
      const competitor = await childChain.inFlightExitGetCompetitor(ife.details.txbytes);
      await rootChain.challengeInFlightExitNotCanonical({
        inputTx: competitor.input_tx,
        inputUtxoPos: competitor.input_utxo_pos,
        inFlightTx: competitor.in_flight_txbytes,
        inFlightTxInputIndex: competitor.in_flight_input_index,
        competingTx: competitor.competing_txbytes,
        competingTxInputIndex: competitor.competing_input_index,
        competingTxPos: competitor.competing_tx_pos,
        competingTxInclusionProof: competitor.competing_proof,
        competingTxWitness: competitor.competing_sig,
        txOptions: {
          privateKey: faucet.faucetAccount.privateKey,
          from: faucet.faucetAccount.address,
        },
      });
    });
  });
});
