const quasarAbi = require('./contracts/Quasar.json');
const txutils = require('./txutils');

class Quasar {
  constructor(web3, contractAddress) {
    this.web3 = web3;
    this.quasar = new web3.eth.Contract(quasarAbi.abi, contractAddress);
  }

  async isQuasarIfe(utxoPos) {
    const ret = await this.quasar.methods.ifeClaimData(utxoPos).call();
    return ret && ret.isValid;
  }

  async challengeQuasarIfe({
    utxoPos,
    rlpChallengeTx,
    challengeTxInputIndex,
    challengeTxWitness,
    otherInputIndex,
    otherInputCreationTx,
    senderData,
    from,
  }) {
    const data = this.quasar.methods.challengeIfeClaim(
      utxoPos,
      rlpChallengeTx,
      challengeTxInputIndex,
      challengeTxWitness,
      otherInputIndex,
      otherInputCreationTx,
      senderData,
    ).encodeABI();

    const txDetails = {
      from: from.address,
      to: this.quasar.options.address,
      data,
    };

    return txutils.sendTx({
      web3: this.web3,
      txDetails,
      privateKey: from.privateKey,
    });
  }
}

module.exports = Quasar;
