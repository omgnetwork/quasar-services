const quasarAbi = require('../../src/contracts/Quasar.json');
const txutils = require('../../src/txutils');

class QuasarHelper {
  constructor(web3, contractAddress) {
    this.web3 = web3;
    this.quasar = new web3.eth.Contract(quasarAbi.abi, contractAddress);
  }

  async bondValue() {
    return this.quasar.methods.bondValue().call();
  }

  async safeBlockMargin() {
    return this.quasar.methods.safeBlockMargin().call();
  }

  async quasarOwner() {
    return this.quasar.methods.quasarOwner().call();
  }

  async addEthCapacity(value, from) {
    const data = this.quasar.methods.addEthCapacity().encodeABI();

    const txDetails = {
      from: from.address,
      to: this.quasar.options.address,
      data,
      value,
    };

    return txutils.sendTx({
      web3: this.web3,
      txDetails,
      privateKey: from.privateKey,
    });
  }

  async obtainTicket(
    utxoPos,
    rlpOutputCreationTx,
    outputCreationTxInclusionProof,
    from,
  ) {
    const bondValue = await this.bondValue();
    const data = this.quasar.methods.obtainTicket(
      utxoPos,
      rlpOutputCreationTx,
      outputCreationTxInclusionProof,
    ).encodeABI();

    const txDetails = {
      from: from.address,
      to: this.quasar.options.address,
      data,
      value: bondValue,
    };

    return txutils.sendTx({
      web3: this.web3,
      txDetails,
      privateKey: from.privateKey,
    });
  }

  async claim(
    utxoPos,
    utxoPosQuasarOwner,
    rlpTxToQuasarOwner,
    txToQuasarOwnerInclusionProof,
    from,
  ) {
    const data = this.quasar.methods.claim(
      utxoPos,
      utxoPosQuasarOwner,
      rlpTxToQuasarOwner,
      txToQuasarOwnerInclusionProof,
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

  async ifeClaim(
    utxoPos,
    inFlightClaimTx,
    from,
  ) {
    const data = this.quasar.methods.ifeClaim(
      utxoPos,
      inFlightClaimTx,
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

module.exports = QuasarHelper;
