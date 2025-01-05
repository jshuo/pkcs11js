const graphene = require('graphene-pk11');
const { keccak256 } = require('js-sha3');
const util = require("ethereumjs-util");
const BigNumber = require("bignumber.js");
const EthereumTx = require('ethereumjs-tx').Transaction;
const { Common } = require('@ethereumjs/common');
const { Chain } = require('@ethereumjs/common');

const prompt = require('prompt-sync')();

// TODO: To complete this, find way to store keys and make wallet address always the same

const SLOT_PIN = 1234;
const SLOT_NO = 0;
const { Web3 } = require('web3');

// // any eth-rpc-url you own or have access to
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

function decodeECPointToPublicKey(data) {
  if (data.length === 0 || data[0] !== 4) {
    throw new Error('Only uncompressed point format supported');
  }
  // ASN first 3 bytes
  // 04 - OCTET STRING, 41 - Length 65 bytes
  // For secp256k1, 044104 always at beginning
  return data.slice(3, 67);
}

const calculateEthereumSig = (msgHash, EthreAddr, privateKey) => {
  ///////////////////////////////////////////////////////////////////////////////////////////////
  // Contiue Signing until find s < (secp256k1.size/2)
  ///////////////////////////////////////////////////////////////////////////////////////////////
  // Continue signing until find s < (secp256k1.size/2)
  let flag = true;
  let tempSig;

  // Not all EC signature is a valid signature
  while (flag) {
    
    const sign = session.createSign('ECDSA', privateKey);
    tempSig = sign.once(msgHash);
    const _s = tempSig.slice(32, 64);
    const sValue = new BigNumber(_s.toString('hex'), 16); // Hex
    const secp256k1N = new BigNumber(
      'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
      16
    ); // Max value on the curve
    const secp256k1halfN = secp256k1N.div(new BigNumber(2));
    if (sValue.lt(secp256k1halfN)) {
      flag = false;
    }
  }

  const rs = {
    r: tempSig.slice(0, 32),
    s: tempSig.slice(32, 64),
  };
  let v = 27;
  let pubKey = util.ecrecover(util.toBuffer(msgHash), v, rs.r, rs.s);
  let addrBuf = util.pubToAddress(pubKey);
  let RecoveredEthAddr = util.bufferToHex(addrBuf);

  if (EthreAddr != RecoveredEthAddr) {
    v = 28;
    pubKey = util.ecrecover(util.toBuffer(msgHash), v, rs.r, rs.s);
    addrBuf = util.pubToAddress(pubKey);
    RecoveredEthAddr = util.bufferToHex(addrBuf);
  }
  return { r: rs.r, s: rs.s, v: v };
}

// Main function
async function main() {
  const slot = mod.getSlots(SLOT_NO);
  if (slot.flags & graphene.SlotFlag.TOKEN_PRESENT) {
    // const session = slot.open(
    //   graphene.SessionFlag.RW_SESSION | graphene.SessionFlag.SERIAL_SESSION
    // );
    // session.login(SLOT_PIN);

    // Look-up key pair by id
    let mID = '101564'; // ID from pkcs11-tool output


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
    let Pkeys = hsmPvKeys.items(0);


    // Extract public key and calculate ethereum address

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

    const address = keccak256(rawPublicKey);
    const buf2 = Buffer.from(address, 'hex');
    const EthAddr = `0x${buf2.slice(-20).toString('hex')}`;
    //First sign : sign the ethreum address of the sender
    encoded_msg = EthAddr;
  
    // console.log last 10 transactions of EthAddr
    // getLastTransactions(EthAddr, 10);
  
  
    let msgHash = util.keccak(Buffer.from(encoded_msg, 'hex')); // msg to be signed is the generated ethereum address
    addressSign = calculateEthereumSig(msgHash, EthAddr, Pkeys);
    const weiValue = web3.utils.toWei('1', 'ether'); // Correct conversion to Wei
    const hexValue = web3.utils.toHex(BigInt(weiValue)); // Convert to BigInt to ensure it's treated as a number

    const nonce = await web3.eth.getTransactionCount(EthAddr);
    console.log('Nonce:', nonce);
    //using the r,s,v value from the first signautre in the transaction parameter
    const txParams = {
      nonce: web3.utils.toHex(nonce),
      gasPrice: "0x0918400000",
      gasLimit: 160000,
      to: "0x49FE9C5e2619A093fABf1D5653D2Cda191EC5600",
      value: hexValue,
      data: "0x00",
      r: addressSign.r, // using r from the first signature
      s: addressSign.s, // using s from the first signature
      v: addressSign.v,
    };
  
    console.log(txParams);
    
    const customChain = {
      name: 'customchain1981',
      chainId: 1981,
      networkId: 1981,
      comment: 'My Custom Chain',
    };
  
    const tx = new EthereumTx(txParams, customChain);
  
    msgHash = tx.hash(false);
  
  
    //Second sign: sign the raw transactions
    const txSig = calculateEthereumSig(msgHash, EthAddr, Pkeys);
    tx.r = txSig.r;
    tx.s = txSig.s;
    tx.v = txSig.v;
  
    const serializedTx = tx.serialize().toString("hex");

    // Due to every time exec it create new address
    let ans;
    while (ans !== 'y') {
      ans = prompt(
        `Did you fund ${EthAddr} already? [at lease 0.5ETH] (y/n): `
      );
      if (ans === 'y' || ans === 'Y') {
        console.log('Sending transaction ...');
        web3.eth
          .sendSignedTransaction('0x' + serializedTx)
          .on('confirmation', function (confirmationNumber, receipt) {
            console.log('Confirmation:', confirmationNumber);
            console.log('Receipt to return:', receipt);
          })
          .on('receipt', (txReceipt) => {
            console.log(
              'Sign and sendTx txReceipt, transaction hash: ' +
                txReceipt.transactionHash
            );
          })
          .on('error', console.error);
        return;
      }
      if (ans === 'n' || ans === 'N') {
        return;
      }
    }

    session.logout();
    session.close();
  } else {
    console.log('Error: cannot found available slot');
  }

  mod.finalize();
}

main();
