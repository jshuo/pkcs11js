const pkcs11 = require('pkcs11js');
const bitcoin = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').ECPairFactory;
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);
const { exec } = require('child_process');
const { execSync } = require('child_process');
const axios = require('axios');
const BN = require('bn.js');

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

const privateKey
  = 'cSDE1zzvpATcyp6U2ABdp7BRPkKUd85tfxfALvKhVzVjj44LSzFa';
const keyPair2 = ECPair.fromWIF(privateKey, regtest);


function getUTXOs(address) {
  try {
    // Run scantxoutset to find UTXOs for the given address
    const command = `bitcoin-cli -regtest scantxoutset "start" '[{"desc": "addr(${address})"}]'`;
    const output = execSync(command, { encoding: 'utf8' });

    // Parse the JSON response
    const result = JSON.parse(output);

    if (!result.success) {
      console.error('Failed to scan UTXO set:', result);
      return [];
    }

    // Filter UTXOs where amount > 0
    const utxos = result.unspents.filter((utxo) => Math.round(utxo.amount) > 1);

    return utxos;
  } catch (error) {
    console.error('Error running scantxoutset:', error.message);
    return [];
  }
}

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
    '66353334336463372d333732622d346531312d383165392d366135633339383461666138'; // ID from pkcs11-tool output
  // get public key
  pkcs11Lib.C_FindObjectsInit(session, [
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

  const uncompressedPublicKey = Buffer.from(hsmPbKeyAttr.value).subarray(2); // Remove the first two bytes (0x04 prefix)
  compressedPublicKey = ecc.pointCompress(uncompressedPublicKey, true);
  pkcs11Lib.C_FindObjectsFinal(session);

  const bitcoinAddress = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(compressedPublicKey),
    network: regtest,
  }).address;

  console.log('Bitcoin Address:', bitcoinAddress);




    // Look-up key pair by id
   mID = '02'; // ID from pkcs11-tool output
  // get public key
  pkcs11Lib.C_FindObjectsInit(session, [
    { type: pkcs11.CKA_ID, value: Buffer.from(mID, 'hex') },
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
  ]);
  let hsmPbKey2 = pkcs11Lib.C_FindObjects(session, 1)[0];
  let hsmPbKeyAttr2 = pkcs11Lib.C_GetAttributeValue(session, hsmPbKey2, [
    { type: pkcs11.CKA_EC_POINT },
  ])[0];

  // Finalize the previous find operation
  pkcs11Lib.C_FindObjectsFinal(session);

  // get private key
  pkcs11Lib.C_FindObjectsInit(session, [
    { type: pkcs11.CKA_ID, value: Buffer.from(mID, 'hex') },
    { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
  ]);
  let hsmPvKey2 = pkcs11Lib.C_FindObjects(session, 1)[0];
  console.log('Private Key Handle:', hsmPvKey2);

  const uncompressedPublicKey2 = Buffer.from(hsmPbKeyAttr2.value).subarray(2); // Remove the first two bytes (0x04 prefix)
  let compressedPublicKey2 = ecc.pointCompress(uncompressedPublicKey2, true);
  pkcs11Lib.C_FindObjectsFinal(session);

  const bitcoinAddress2 = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(compressedPublicKey2),
    network: regtest,
  }).address;

  console.log('Bitcoin Address 2:', bitcoinAddress2);



  execSync(`bitcoin-cli -regtest generatetoaddress  2  "${bitcoinAddress}"`);

  const utxos = getUTXOs("2NAnKZBGEr485S2pM4m9TuTE88EozeaBVVk");

  console.log('UTXOs with amount > 0:', utxos);
  // Initialize Psbt (Partially Signed Bitcoin Transaction)
  const psbt = new bitcoin.Psbt({ network: regtest });

  const prevTxHex = execSync(
    `bitcoin-cli -regtest getrawtransaction ${utxos[0].txid}`,
    { encoding: 'utf8' }
  ).trim();

  psbt.addInput({
    hash: utxos[0].txid,
    index: utxos[0].vout,
    nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
  });

  const recipientAddress = "2NAnKZBGEr485S2pM4m9TuTE88EozeaBVVk"; // Ensure correct address type
  const senderAddress = "2NAnKZBGEr485S2pM4m9TuTE88EozeaBVVk";
  const amountToSend = Math.round((utxos[0].amount - 0.001) * 1e8); // Amount to send in satoshis (e.g., 0.0999 BTC)

  const estimatedFee = 10000;

  // Add output to recipient
  psbt.addOutput({
    address: recipientAddress,
    value: amountToSend,
  });

  // (Optional) Change address back to sender
  const change =
    Math.round(utxos[0].amount * 1e8) - amountToSend - estimatedFee;
  if (change > 0) {
    psbt.addOutput({
      address: senderAddress,
      value: change,
    });
  }

  // Sign with HSM (ensure proper output format)
  // 🔹 Function to Sign with HSM (Ensures BIP66 Low-S)
  function signWithHSM(hash, privateKeyHandle) {
    console.log('Signing hash:', hash.toString('hex'));

    // Initialize signing mechanism for HSM
    pkcs11Lib.C_SignInit(
      session,
      { mechanism: pkcs11.CKM_ECDSA },
      privateKeyHandle
    );

    // Perform signing operation
    let signature = Buffer.alloc(64);
    signature = pkcs11Lib.C_Sign(session, hash, signature);
    console.log('Raw HSM Signature:', signature.toString('hex'));

    // Extract r and s
    const r = signature.slice(0, 32);
    let s = signature.slice(32, 64);

    console.log('r:', r.toString('hex'));
    console.log('s:', s.toString('hex'));

    // Ensure S value is in the lower half of secp256k1 curve order (BIP66 compliance)
    const curveN = new BN(
      'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
      16
    );

    let sBN = new BN(s);
    if (sBN.cmp(curveN.shrn(1)) > 0) {
      sBN = curveN.sub(sBN);
    }

    // Convert back to Buffer
    s = sBN.toArrayLike(Buffer, 'be', 32);

    // Concatenate r and s
    const finalSignature = Buffer.concat([r, s]);
    console.log('Final DER Signature:', finalSignature.toString('hex'));

    return finalSignature; // Return BIP66-compliant signature
  }
  // Convert Uint8Array to Buffer (fix for p2ms)
  const pubkeys = [
    Buffer.from(compressedPublicKey),
    Buffer.from(compressedPublicKey2),
    Buffer.from(keyPair2.publicKey),
  ];

  console.log(
    'Public Keys:',
    pubkeys.map((pk) => pk.toString('hex'))
  );

 
// Create a 2-of-3 multisig P2SH address
const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network: regtest });
const p2sh = bitcoin.payments.p2sh({ redeem: p2ms, network: regtest });

console.log('Multisig Address:', p2sh.address);
console.log('Redeem Script:', p2sh.redeem.output.toString('hex'));

// Add the redeemScript explicitly in the input
psbt.updateInput(0, {
  redeemScript: p2sh.redeem.output,
});

// Sign the transaction
psbt.signInput(0, {
  publicKey: Buffer.from(compressedPublicKey, 'hex'),
  sign: (hash) => signWithHSM(hash, hsmPvKey),
});

psbt.signInput(0, {
  publicKey: Buffer.from(compressedPublicKey2, 'hex'),
  sign: (hash) => signWithHSM(hash, hsmPvKey2),
});


//   psbt.signInput(0, {
//     publicKey: Buffer.from(keyPair2.publicKey),
//     sign: (hash) => {
//         console.log('hash:', hash.toString('hex'));
//         const signature = keyPair2.sign(hash);
//         return Buffer.from(signature); 
//     },
// });

  // Finalize and extract
  psbt.finalizeAllInputs();
  const rawTxHex = psbt.extractTransaction().toHex();

  console.log('Signed Raw Transaction (hex):', rawTxHex);

  // broadcast the transaction using bitcoin core
  exec(
    `bitcoin-cli -regtest sendrawtransaction ${rawTxHex}`,
    (err, stdout, stderr) => {
      if (err) {
        console.error('Error:', err);
        console.error('stderr:', stderr);
        return;
      }
      console.log('Transaction ID:', stdout);
    }
  );

  // Send some funds to the multisig address
  exec(
    `bitcoin-cli -regtest -rpcwallet=test_wallet sendtoaddress ${p2sh.address} 0.2`,
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
  const MULTISIG_ADDRESS = p2sh.address;

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
    console.log(
      `Fetching balance for multisig address: ${MULTISIG_ADDRESS}...`
    );

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

  pkcs11Lib.C_Logout(session);
  pkcs11Lib.C_CloseSession(session);
  console.log('Session closed.');
} catch (err) {
  console.error('PKCS#11 Error:', err);
} finally {
  pkcs11Lib.C_Finalize();
}
