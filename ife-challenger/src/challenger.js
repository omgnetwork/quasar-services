require('dotenv').config();
const { keccak256 } = require('web3-utils');
const { transaction } = require('@omisego/omg-js-util');
const ByzantineEvents = require('./byzantine-events');

class Challenger {
  constructor(childChain, quasar, challengerAccount, pollInterval) {
    const senderData = keccak256(challengerAccount.address);

    this.byzantineEvents = new ByzantineEvents(childChain, pollInterval);

    this.byzantineEvents.poll.on('error', (err) => {
      console.err(err);
    });

    this.byzantineEvents.poll.on('result', async (result) => {
      // Check if there are any non_canonical_ife events
      const ifes = result.filter((e) => e.event === 'non_canonical_ife');

      try {
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < ifes.length; ++i) {
          const ife = ifes[i];

          // Check if any of the ifes are quasar ifes
          const { inputs } = transaction.decodeTxBytes(ife.details.txbytes);
          for (let j = 0; j < inputs.length; ++j) {
            const utxoPos = transaction.encodeUtxoPos(inputs[j]);
            const isQIFE = await quasar.isQuasarIfe(utxoPos);
            if (isQIFE) {
              const competitor = await childChain.inFlightExitGetCompetitor(ife.details.txbytes);

              console.log(`Challenging Quasar IFE ${utxoPos.toString()}`);
              await quasar.challengeQuasarIfe({
                utxoPos,
                rlpChallengeTx: competitor.competing_txbytes,
                challengeTxInputIndex: competitor.competing_input_index,
                challengeTxWitness: competitor.competing_sig,
                otherInputIndex: competitor.in_flight_input_index,
                otherInputCreationTx: competitor.input_tx,
                senderData,
                from: challengerAccount,
              });
            }
          }
        }
      } catch (error) {
        console.error(error);
      }
    });
  }

  start() {
    this.byzantineEvents.poll.run();
  }

  stop() {
    this.byzantineEvents.poll.stop();
  }
}

module.exports = Challenger;
