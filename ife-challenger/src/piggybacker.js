require('dotenv').config();
const { transaction } = require('@omisego/omg-js-util');
const ByzantineEvents = require('./byzantine-events');

class PiggyBacker {
  constructor(childChain, rootChain, quasar, quasarOwner, pollInterval) {
    this.byzantineEvents = new ByzantineEvents(childChain, pollInterval);

    this.byzantineEvents.poll.on('error', (err) => {
      console.err(err);
    });

    this.byzantineEvents.poll.on('result', async (result) => {
      // Check if there are any piggyback_available events
      const ifes = result.filter((e) => e.event === 'piggyback_available');

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
              if (ife.details.available_outputs.length !== 0) {
                // check if the first output is not piggybacked
                if (ife.details.available_outputs[0].index === 0) {
                  console.log(`Piggybacking Quasar IFE ${utxoPos.toString()}`);

                  await rootChain.piggybackInFlightExitOnOutput({
                    inFlightTx: ife.details.txbytes,
                    outputIndex: 0,
                    txOptions: {
                      privateKey: quasarOwner.privateKey,
                      from: quasarOwner.address,
                    },
                  });
                }
              }
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

module.exports = PiggyBacker;
