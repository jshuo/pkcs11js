const graphene = require('graphene-pk11');

const ethUtil = require('ethereumjs-util');
const EthereumTx = require('ethereumjs-tx').Transaction;
const BigNumber = require('bignumber.js');
const axios = require('axios');
const { Web3 } = require('web3');

// any eth-rpc-url you own or have access to
const HTTP_PROVIDER = 'http://58.115.23.124:8545';
const web3 = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER));

// HSM INIT
const Module = graphene.Module;

// HSM LIB linux   e.g. /usr/local/lib/softhsm/libsofthsm2.so
const SOFTHSM_LIB = '/usr/local/lib/softhsm/libsofthsm2.so';

const mod = Module.load(SOFTHSM_LIB, 'SoftHSM');

// init hsm module
mod.initialize();

// load your created slot
const M_SLOT = 0;
const slot = mod.getSlots(M_SLOT);

// get session
const session = slot.open(
  graphene.SessionFlag.RW_SESSION | graphene.SessionFlag.SERIAL_SESSION
);

// your slot creation pins
// login to session
const M_PIN = '1234';
session.login(M_PIN);

// look-up your keyPair by id or label or other attributes:
let mID = '3c736f6d652d69642d6f722d757569643e'; // ID from pkcs11-tool output

let hsmPbKeys = session.find({
  class: graphene.ObjectClass.PUBLIC_KEY,
  id: Buffer.from(mID, 'hex'),
});

let hsmPvKeys = session.find({
  class: graphene.ObjectClass.PRIVATE_KEY,
  id: Buffer.from(mID, 'hex'),
});

let validKeys = (hsmPbKeys.length == hsmPvKeys.length) == 1;
if (!validKeys) {
  console.log('abort: validKeys');
  return;
}

// now let us get the Raw Public Key used to create Bitcoin/Ethereum Address
let hsmPbKey = hsmPbKeys.items(0);

// the HSM Private Key Instance (do not contain the private key value)
let hsmPvKey = hsmPvKeys.items(0);

// the public key P is a Point on the Curve y2 = x3 + 7
// calculated via multiplying (DOT operation)
// the private key e by the curve Generator G.
// P = e.G
// https://en.bitcoin.it/wiki/Secp256k1
let ecPoint = hsmPbKey.getAttribute('pointEC');

// According to ASN encoded value, the first 3 bytes are
//04 - OCTET STRING
//41 - Length 65 bytes
//For secp256k1 curve it's always 044104 at the beginning
if (ecPoint.length === 0 || ecPoint[0] !== 4) {
  console.log('abort: only uncompressed point format supported');
  return;
}
let rawPublicKey = ecPoint.slice(3, 67);

// finally the hex encoded public key
let hexPublicKey = rawPublicKey.toString('hex');
console.log('hexPublicKey', hexPublicKey);

// Bitcoin ADDRESS
// create a compressed public key
const ethCrypto = require('eth-crypto');
const compressedPubKey = ethCrypto.publicKey.compress(hexPublicKey);
console.log('compressedPubKey', compressedPubKey);

// calculate the Compressed PublicKey Hash
// using the HSM - SHA256
const compressedPubKeyHash = session
  .createDigest('sha256')
  .once(compressedPubKey)
  .toString('hex');

// using bitcoinjs-lib we can create a bitcoin address as well
// for Pay to Script Hash Transaction P2PKH:
const bufferPubKey = Buffer.from(compressedPubKey, 'hex');
const bitcoin = require('bitcoinjs-lib');
// testnet ADDRESSVERSION 0x6F
// mainnet ADDRESSVERSION 0x00
// https://en.bitcoin.it/wiki/Testnet
const btcTestAddress = bitcoin.payments.p2pkh({
  pubkey: bufferPubKey,
  network: bitcoin.networks.testnet,
}).address;

console.log('Got btcTestAddress', btcTestAddress);

// now let us build a transaction to spend the coins
async function spendBitcoinsTestAsync(
  sourceAddress,
  receiverAddress,
  amountToSend
) {
  // SOCHAIN APIs
  const testnetUrl = 'https://blockstream.info/testnet/api';

  // 1 btc = 100 000 000 satoshis
  const satoshiToSend = Math.floor(amountToSend * 100000000);

  let inputCount = 0;
  const unspent = await axios.get(
    `${testnetUrl}/address/${sourceAddress}/utxo`
  );
  console.log('unspent: ', unspent.data);

  // Initialize variables
  let totalAmountAvailable = 0;
  let inputs = [];

  // Process unspent outputs (UTXOs)
  for (const element of unspent.data) {
    let utxo = {};
    utxo.satoshis = element.value; // Blockstream API gives value in satoshis directly
    utxo.script = element.scriptpubkey; // The script hex is provided directly
    utxo.address = sourceAddress; // This is the source address
    utxo.txId = element.txid;
    utxo.outputIndex = element.vout;
    totalAmountAvailable += utxo.satoshis;
    inputCount += 1;
    inputs.push(utxo);
  }

  // Calculate transaction size and fee (simplified)
  let outputCount = 2; // For example, 2 outputs (you can adjust this)
  let transactionSize = inputCount * 146 + outputCount * 34 + 10 - inputCount;
  let fee = transactionSize * 20; // Fee rate in satoshis per byte

  // Check if we have enough funds to cover the transaction
  // and the fees assuming we want to pay 20 satoshis per byte
  if (totalAmountAvailable - satoshiToSend - fee < 0) {
    throw new Error('Balance is too low for this transaction');
  }

  const psbt = new bitcoin.Psbt({
    network: bitcoin.networks.testnet,
  });

  const txInfoHexResponse = await axios.get(`${testnetUrl}/tx/${inputs[0].txId}/hex`);
  const txInfoResponse = await axios.get(`${testnetUrl}/tx/${inputs[0].txId}`);
  const txInfoHex = txInfoHexResponse.data;
  const txInfo = txInfoResponse.data;
  
  console.log('Fetched Transaction Hex: ', txInfoHex);
  console.log('Transaction Details: ', txInfo);
  
  // Verify the txid matches
  if (inputs[0].txId !== txInfo.txid) {
    throw new Error(`Mismatch in txid: expected ${inputs[0].txId}, got ${txInfo.txid}`);
  }
  console.log('Input TxId: ', inputs[0]);


  // Add input to PSBT
  psbt.addInput({
    hash: inputs[0].txId, // txid of the UTXO
    index: inputs[0].outputIndex, // vout index of the UTXO
    nonWitnessUtxo: Buffer.from(txInfoHex, 'hex'), // Full raw transaction hex
  });
  psbt.addOutput({
    address: receiverAddress,
    value: satoshiToSend,
  });

  psbt.addOutput({
    address: receiverAddress,
    value: totalAmountAvailable - satoshiToSend - fee,
  });

  // create a KeyPair HSM Wrapper
  const keyPair = {
    publicKey: bufferPubKey,
    sign: (hash) => {
      const signature = session.createSign('ECDSA', hsmPvKey).once(hash);
      return signature;
    },
    getPublicKey: () => pubKey,
  };

  // sign and finalize the input(s) given the spend condition and UTXOs
  psbt.signInput(0, keyPair);
  psbt.finalizeInput(0);

const serializedTx = psbt.extractTransaction().toHex();
console.log('serialized transaction hex', serializedTx);

// Print the signature
const signature = psbt.data.inputs[0].partialSig[0].signature.toString('hex');
console.log('signature', signature);

// Broadcast the signed serialized transaction hex
const broadcastResponse = await axios.post(`${testnetUrl}/tx`, serializedTx);
console.log('Broadcast response', broadcastResponse.data);

  return serializedTx;
}

// e.g. spend the coins using spendBitcoinsTestAsync
// get some testnet faucet coins before on your generated address

spendBitcoinsTestAsync(
  btcTestAddress,
  'n4REtx7xyWP6Qc7TS5K3qo5dk7kFdHYYup',
  '0.00015199'
);

/**
 * Ethereum Address and Transactions Generation
 */

// Ethereum addresses are generated from the Keccak-256 hash of the public key
// and are represented as hexadecimal numbers.
let keccak256PublicKeyHex = ethUtil.keccak256(rawPublicKey);

// The last 20 bytes of the Keccak-256 hash are used to generate the address
let last20Bytes = Buffer.from(keccak256PublicKeyHex, 'hex').slice(-20);
let ethAddress = `0x${last20Bytes.toString('hex')}`;
console.log('Ethereum Address: ', ethAddress);

// Ethereum Signature Specs
// https://ethereum.stackexchange.com/questions/55245/why-is-s-in-transaction-signature-limited-to-n-21
const createEthSig = (data, address, privateKey) => {
  let flag = true;
  let tempsig;
  // the curve order
  const ORDER =
    'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
  const secp256k1halfN = new BigNumber(ORDER, 16).dividedBy(new BigNumber(2));
  while (flag) {
    // here, we sign using the HSM
    const sign = session.createSign('ECDSA', privateKey);
    tempsig = sign.once(data);
    ss = tempsig.slice(32, 64);
    s_value = new BigNumber(ss.toString('hex'), 16);
    if (s_value.isLessThan(secp256k1halfN)) flag = false;
  }
  const rs = {
    r: tempsig.slice(0, 32),
    s: tempsig.slice(32, 64),
  };
  let v = 27;
  let pubKey = ethUtil.ecrecover(ethUtil.toBuffer(data), v, rs.r, rs.s);
  let addrBuf = ethUtil.pubToAddress(pubKey);
  let recovered = ethUtil.bufferToHex(addrBuf);
  if (address != recovered) {
    v = 28;
    pubKey = ethUtil.ecrecover(ethUtil.toBuffer(data), v, rs.r, rs.s);
    addrBuf = ethUtil.pubToAddress(pubKey);
    recovered = ethUtil.bufferToHex(addrBuf);
  }
  return {
    r: rs.r,
    s: rs.s,
    v: v,
  };
};

// Generate an ethereum Transaction Sample
function createEthTx(
  to,
  nonce,
  value,
  data,
  gasPrice = '0x00',
  gasLimit = 160000,
  chain = 'rinkeby'
) {
  // address signature first
  let address = ethAddress;
  let addressHash = ethUtil.keccak(Buffer.from(address, 'hex'));

  // get the address signature first using the HSM Private Key
  let addressSign = createEthSig(addressHash, ethAddress, hsmPvKey);

  let txParams = {
    nonce: web3.utils.toHex(nonce),
    gasPrice,
    gasLimit,
    to,
    value: web3.utils.toHex(value),
    data: data || '0x00',
    r: addressSign.r,
    s: addressSign.s,
    v: addressSign.v,
  };

  let tx = new EthereumTx(txParams, {
    chain,
  });

  let txHash = tx.hash(false);

  // RAW TX SIG
  let txSig = createEthSig(Buffer.from(txHash, 'hex'), address, hsmPvKey);
  tx.r = txSig.r;
  tx.s = txSig.s;
  tx.v = txSig.v;

  let serializedTx = tx.serialize().toString('hex');

  return serializedTx;
}

// our earlier generated address:
// from = ethAddress;

// some address/smart-contract:
// to = '0xabe61b960d7c3f6802b21a130655497a14f2a8de';

// the tx count of the 'from' address:
// nonce = 0;

// The ETH amount:
// value = '0';

// The data - smartcontract method call etc:
// data = '0x45123123..3213';

let signedEthTx = createEthTx(
  '0xabe61b960d7c3f6802b21a130655497a14f2a8de',
  '0',
  '0'
);
console.log('eth serializedTx', signedEthTx);
// web3.eth.sendSignedTransaction(`0x${signedEthTx}`)
//     .on('receipt', console.log)
//     .on('error', console.error);
