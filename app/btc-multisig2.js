var pkcs11 = require('pkcs11js');
const bitcoin = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').ECPairFactory;
const ecc = require('tiny-secp256k1');
const { exec } = require('child_process');
const axios = require('axios');

// Bitcoin Core RPC Credentials (update if needed)
const RPC_USER = 'secux';
const RPC_PASS = '4296';
const RPC_PORT = '18443'; // Default for Regtest
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;

// Define Regtest Network
const regtest = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bcrt',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

var pkcs11Lib = new pkcs11.PKCS11();
pkcs11Lib.load('/usr/local/lib/softhsm/libsofthsm2.so');
let compressedPublicKey;
pkcs11Lib.C_Initialize();
try {
  const slots = pkcs11Lib.C_GetSlotList(true);
  if (slots.length === 0) {
    throw new Error('No PKCS#11 slots found');
  }

  const slot = slots[0]; // Select the first slot
  console.log('Using slot:', slot);

  // Open a session
  const session = pkcs11Lib.C_OpenSession(
    slot,
    pkcs11.CKF_RW_SESSION | pkcs11.CKF_SERIAL_SESSION
  );

  // Login as the user (replace with your PIN)
  pkcs11Lib.C_Login(session, pkcs11.CKU_USER, '1234');

  console.log('Session opened and logged in.');

  // get token id and label
  const tokenInfo = pkcs11Lib.C_GetTokenInfo(slot);
  console.log('Token ID:', tokenInfo.tokenID);
  console.log('Token Label:', tokenInfo.label);
  // Look-up key pair by id
  let mID =
    '66646566356137372d643634312d346334392d393738332d666439643836383462396534'; // ID from pkcs11-tool output
  // get public key
  let hsmPbKeys = pkcs11Lib.C_FindObjectsInit(session, [
    { type: pkcs11.CKA_ID, value: Buffer.from(mID, 'hex') },
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
  ]);
  let hsmPbKey = pkcs11Lib.C_FindObjects(session, 1)[0];
  let hsmPbKeyAttr = pkcs11Lib.C_GetAttributeValue(session, hsmPbKey, [
    { type: pkcs11.CKA_EC_POINT },
  ])[0];
  
  // Finalize the previous find operation
  pkcs11Lib.C_FindObjectsFinal(session);

  // get private key
  pkcs11Lib.C_FindObjectsInit(session, [
    { type: pkcs11.CKA_ID, value: Buffer.from(mID, 'hex') },
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
  ]);
  let hsmPvKey = pkcs11Lib.C_FindObjects(session, 1)[0];
  console.log('Private Key Handle:', hsmPvKey);

  const uncompressedPublicKey = Buffer.from(hsmPbKeyAttr.value).slice(2); // Remove the first two bytes (0x04 prefix)
  compressedPublicKey = ecc.pointCompress(uncompressedPublicKey, true);
  pkcs11Lib.C_FindObjectsFinal(session);

  // Generate Bitcoin address (Bitcoin uses secp256k1)
  const address = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(compressedPublicKey),
    network: bitcoin.networks.regtest, // Change to bitcoin.networks.bitcoin for mainnet
  }).address;
  console.log('Bitcoin Address:', address);

  var psbt = new bitcoin.Psbt({ network: bitcoin.networks.regtest });

  psbt.addInput({
    hash: '2e389c7d7c384f35a5afafc10987068aeb683a6834b09388d86b12959210190f',
    index: 0,
    witnessUtxo: {
      script: Buffer.from(
        '76a914cc2873d569108254e4e6fb29ac2994dd8175b52c88ac',
        'hex'
      ),
      value: 2000000000,
    },
  });

  psbt.addOutput({
    address: 'mz8SbsgeyuVuV9dKgdKifcYgCLnNTB3uYv',
    value: 10000,
  });

  // Sign the transaction
  var sighash = psbt.__CACHE.__TX.hashForSignature(
    0,
    psbt.__CACHE.__TX.ins[0].script,
    0,
    bitcoin.Transaction.SIGHASH_ALL
  );
  pkcs11Lib.C_SignInit(
    session,
    { mechanism: pkcs11.CKM_ECDSA },
    hsmPvKey
  );
  var txSignature = Buffer.alloc(64);
  pkcs11Lib.C_Sign(session, sighash, txSignature);
  // Add the signature to the input
  var signatureScript = bitcoin.script.signature.encode(
    txSignature,
    bitcoin.Transaction.SIGHASH_ALL
  );
  psbt.updateInput(0, {
    partialSig: [
      {
        pubkey: Buffer.from(compressedPublicKey),
        signature: Buffer.from(signatureScript),
      },
    ],
  });
  psbt.updateInput(0, {
    finalScriptSig: bitcoin.script.compile([
      bitcoin.script.signature.encode(
        txSignature,
        bitcoin.Transaction.SIGHASH_ALL
      ),
      Buffer.from(compressedPublicKey),
    ]),
  });
  var tx = psbt.extractTransaction();
  console.log('Signed Transaction:', tx.toHex());

  pkcs11Lib.C_Logout(session);
  pkcs11Lib.C_CloseSession(session);
  console.log('Session closed.');
} catch (err) {
  console.error('PKCS#11 Error:', err);
} finally {
  pkcs11Lib.C_Finalize();
}

// Initialize ECPair from ecpair package
const ECPair = ECPairFactory(ecc);

// Generate 3 key pairs
const keyPair1 = ECPair.makeRandom();
const keyPair2 = ECPair.makeRandom();
const keyPair3 = ECPair.makeRandom();

// Convert Uint8Array to Buffer (fix for p2ms)
const pubkeys = [
  Buffer.from(compressedPublicKey),
  Buffer.from(compressedPublicKey),
  Buffer.from(compressedPublicKey),
];

console.log(
  'Public Keys:',
  pubkeys.map((pk) => pk.toString('hex'))
);

// Create a 2-of-3 multisig P2SH address
const { address, redeem } = bitcoin.payments.p2sh({
  redeem: bitcoin.payments.p2ms({ m: 2, pubkeys, network: regtest }),
  network: regtest,
});

console.log('2-of-3 Multisig Address:', address);
console.log('Redeem Script:', redeem.output.toString('hex'));
console.log('Private Key 1 (WIF):', keyPair1.toWIF());
console.log('Private Key 2 (WIF):', keyPair2.toWIF());
console.log('Private Key 3 (WIF):', keyPair3.toWIF());

// Send some funds to the multisig address
exec(
  `bitcoin-cli -regtest -rpcwallet=test_wallet sendtoaddress ${address} 0.02`,
  (err, stdout, stderr) => {
    if (err) {
      console.error('Error:', err);
      console.error('stderr:', stderr);
      return;
    }
    console.log('Funds sent to multisig address:', stdout);
  }
);

// use bitcoinjs-lib to get the balance of the multisig address

// Multisig address to check
const MULTISIG_ADDRESS = address;

// Bitcoin Core RPC Call
async function callBitcoinRPC(method, params = []) {
  try {
    // print the equalent curl command
    console.log(
      `curl -u ${RPC_USER}:${RPC_PASS} -d '{"jsonrpc": "1.0", "id":"curltest", "method": "${method}", "params": ${JSON.stringify(
        params
      )}}' -H 'content-type: text/plain;' ${RPC_URL}`
    );

    const response = await axios.post(
      RPC_URL,
      { jsonrpc: '1.0', id: 'balance', method, params },
      { auth: { username: 'secux', password: '4296' } }
    );
    return response.data.result;
  } catch (error) {
    if (error.response) {
      console.error('RPC Error:', error.response.data);
    } else {
      console.error('RPC Error:', error.message);
    }
    return null;
  }
}

// Get UTXOs for the Multisig Address Using `scantxoutset`
async function getMultisigBalance() {
  console.log(`Fetching balance for multisig address: ${MULTISIG_ADDRESS}...`);

  const utxos = await callBitcoinRPC('scantxoutset', [
    'start',
    [`addr(${MULTISIG_ADDRESS})`],
  ]);

  if (!utxos || !utxos.unspents || utxos.unspents.length === 0) {
    console.log(`No UTXOs found for ${MULTISIG_ADDRESS}`);
    return;
  }

  let balance = utxos.unspents.reduce((sum, utxo) => sum + utxo.amount, 0);
  console.log(`Balance for ${MULTISIG_ADDRESS}: ${balance} BTC`);
}

getMultisigBalance();
