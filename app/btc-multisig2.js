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
  
  const inputTxHex = "02000000000104498a73c6988bb4832f7135ba6b015399a29bd892898f536dd01e63a1a4cc6cad0000000017160014010cf16a229a6e0b993206e745c7396bc7ec195afdffffff121e85892be6a3b73e92a7ce3f409dfca81f4117320c53b500dadc59f309a1350000000017160014a910b7e5baaadc15aaaa080104b36bf16dcc19b2fdffffff22dc63853cb218a62c2dd1534231c47e3be98493942046d3eca7fc51a74335240000000017160014587f8dbab23108a1a81596f3c809e857de1aa07bfdfffffff8cb00d9628815bb20eed0b9fafc4dac08f2393aa481ceaa49a962b811b44682000000001716001419bdd57fcc6a1938095e6fc5848aac9294119d26fdffffff0200943577000000001976a914cc2873d569108254e4e6fb29ac2994dd8175b52c88acc6b4ae03000000001976a9148d66427bcd8cd08d4d6b47d681839c1850afa74288ac0247304402203a606b7539d22c893bf28df0a5ca2539076150295cbec8685e899ec597b758ed0220147ddf5e28216e607650188b8e70ae59c2471191c02054267ff685da7b1bc3880121020125ec401c3c68d13356cce8eabb8fe6b33792bf08bf9db583665793bf5c24040247304402200366ce1bfb5aab265dfa1f8b58953f135f1cd27f34679a39c6fab8c0d64cb66d02204aff8552a6c25a9d39df7e4f3baab33d817159bb938d38fc83ec67c611070ec301210365352b2d71c520fd6549e3c1eac059bd1721f921c2842e1212518dbf1bd7723f0246304302202ddda17edf25b68d53fc239b439839377e1c7c4ead80c105ac8a3328c1bfbc35021f429144133e63f831ba600d896667ac17af9fe53b82fc895d936529fc9c3849012102295438dfbf4a5e6cc9cd8151ca2b3b644626ee6a8a166570f5783e521e492d71024730440220656f99d5bca7f3bed28360c62f18c6075cc92eb3967bf4bb845522030a7325c0022020409215b89a9e3a4132365932e9be43a011d0a7a4c2b031997bbd7b06876617012102bde436354aa78c867549d9fecbbd8d41ca2d564dd769ca52ea647c1c3a8cd57c212a0000";
  
  // Define Input UTXO (Non-Witness UTXO since it's P2PKH)
  psbt.addInput({
    hash: "2e389c7d7c384f35a5afafc10987068aeb683a6834b09388d86b12959210190f", // txid
    index: 0, // vout index
    nonWitnessUtxo: Buffer.from(inputTxHex, "hex"), // Full raw transaction hex
  });
  
  // Define Output - Pay 5 BTC to recipient
  const recipientAddress = "2MxYw5Ucck64XAKL1VMraz3AxKgwZfo6kxz"; // P2SH address
  const amountToSend = 5_00000000; // 5 BTC in satoshis
  
  psbt.addOutput({
    address: recipientAddress,
    value: amountToSend, // 5 BTC in satoshis
  });
  
  // Define Change Output - Send remaining BTC back to sender
  const totalInputAmount = 20_00000000; // 20 BTC in satoshis
  const estimatedFee = 10000; // Example fee in satoshis (adjust based on fee rates)
  const changeAmount = totalInputAmount - amountToSend - estimatedFee;
  
  const changeAddress = "mz8SbsgeyuVuV9dKgdKifcYgCLnNTB3uYv"; // Your change address (modify accordingly)
  
  if (changeAmount > 0) {
    psbt.addOutput({
      address: changeAddress,
      value: changeAmount, // Change amount after paying fee
    });
  }
  
  // Log the PSBT Base64 format (before signing)
  console.log("PSBT (Unsigned):", psbt.toBase64());
  

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
  var tx = psbt.extractTransaction(true);
  console.log('Signed Transaction:', tx.toHex());

  // // broadcast the transaction using bitcoin core
  // exec(
  //   `bitcoin-cli -regtest sendrawtransaction ${tx.toHex()}`,
  //   (err, stdout, stderr) => {
  //     if (err) {
  //       console.error('Error:', err);
  //       console.error('stderr:', stderr);
  //       return;
  //     }
  //     console.log('Transaction ID:', stdout);
  //   }
  // );


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
