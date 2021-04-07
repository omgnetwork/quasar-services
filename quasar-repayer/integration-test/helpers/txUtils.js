function prefixHex(hexString) {
    return hexString.startsWith('0x') ? hexString : `0x${hexString}`;
  }
  
  async function setGas(web3, txDetails) {
    let enhancedTxDetails = { ...txDetails };
    if (!enhancedTxDetails.gasPrice) {
      try {
        const gasPrice = await web3.eth.getGasPrice();
        enhancedTxDetails = { ...enhancedTxDetails, gasPrice };
      } catch (err) {
        // Default to 1 GWEI
        enhancedTxDetails = { ...enhancedTxDetails, gasPrice: '1000000000' };
      }
    }
  
    if (!enhancedTxDetails.gas) {
      try {
        const gas = await web3.eth.estimateGas(enhancedTxDetails);
        enhancedTxDetails = { ...enhancedTxDetails, gas };
      } catch (err) {
        console.warn(`Error estimating gas: ${err}`);
        throw err;
      }
    }
  
    return enhancedTxDetails;
  }
  
  async function sendTx({ web3, txDetails, privateKey }) {
    const enhancedTxDetails = await setGas(web3, txDetails);
  
    // Sign and send transaction
    const signedTx = await web3.eth.accounts.signTransaction(
      enhancedTxDetails, prefixHex(privateKey),
    );
    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
  }
  
  module.exports = {
    sendTx,
  };
  