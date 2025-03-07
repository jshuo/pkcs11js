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
let compressedPublicKey;;
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

  // Define secp256k1 parameters
  const keyTemplatePublic = [
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
    { type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_EC },
    { type: pkcs11.CKA_EC_PARAMS, value: Buffer.from('06052b8104000a', 'hex') }, // OID for secp256k1
    { type: pkcs11.CKA_VERIFY, value: true },
  ];

  const keyTemplatePrivate = [
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
    { type: pkcs11.CKA_KEY_TYPE, value: pkcs11.CKK_EC },
    { type: pkcs11.CKA_SIGN, value: true },
    { type: pkcs11.CKA_PRIVATE, value: true },
  ];

  const keyPair = pkcs11Lib.C_GenerateKeyPair(
    session,
    { mechanism: pkcs11.CKM_EC_KEY_PAIR_GEN },
    keyTemplatePublic,
    keyTemplatePrivate
  );
  console.log('Key pair generated.');
  // Get public key attributes
  const publicKeyAttributes = [{ type: pkcs11.CKA_EC_POINT }];

  const publicKeyValue = pkcs11Lib.C_GetAttributeValue(
    session,
    keyPair.publicKey,
    publicKeyAttributes
  );

  // Decode ASN.1 (remove first byte which is ASN.1 tag for EC Point)
  let publicKeyDER = publicKeyValue[0].value;
  let publicKeyRaw = publicKeyDER.slice(2); // Remove ASN.1 header

  console.log('Raw Uncompressed Public Key:', publicKeyRaw.toString('hex'));

  // Extract X and Y coordinates
  const x = publicKeyRaw.slice(0, 32);
  const y = publicKeyRaw.slice(32, 64);

  // Determine if Y is even or odd
  const prefix =
    y[y.length - 1] % 2 === 0 ? Buffer.from([0x02]) : Buffer.from([0x03]);

  // Compressed public key format: 0x02 (even Y) or 0x03 (odd Y) + X coordinate
    compressedPublicKey = Buffer.concat([prefix, x]);

  console.log(
    'Compressed Bitcoin Public Key:',
    compressedPublicKey.toString('hex')
  );

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
  compressedPublicKey,
  Buffer.from(keyPair2.publicKey),
  Buffer.from(keyPair3.publicKey),
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
  `bitcoin-cli -regtest -rpcwallet=test_wallet sendtoaddress ${address} 0.001`,
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
const MULTISIG_ADDRESS = '2NCNZkMhFcNdgeUEfgaHjCPcKSbZMdoUbq1';

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
