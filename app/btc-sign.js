const bitcoin = require('bitcoinjs-lib');
// Use Bitcoin regtest network
const ECPairFactory = require('ecpair').ECPairFactory;
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);
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

// Generate a new key pair
const keyPair = ECPair.makeRandom({ network: regtest });
console.log("Private Key (WIF):", keyPair.toWIF());
console.log("Public Key:", keyPair.publicKey.toString('hex'));  // Compressed public key

const { execSync } = require("child_process");

function getUTXOs(address) {
    try {
        // Run scantxoutset to find UTXOs for the given address
        const command = `bitcoin-cli -regtest scantxoutset "start" '[{"desc": "addr(${address})"}]'`;
        const output = execSync(command, { encoding: "utf8" });

        // Parse the JSON response
        const result = JSON.parse(output);

        if (!result.success) {
            console.error("Failed to scan UTXO set:", result);
            return [];
        }

        // Filter UTXOs where amount > 0
        const utxos = result.unspents.filter(utxo => Math.round(utxo.amount) > 1);

        return utxos;
    } catch (error) {
        console.error("Error running scantxoutset:", error.message);
        return [];
    }
}

// Example usage



// Address derived from the key:
const { address } = bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair.publicKey), network: regtest });
// console.log("Address:", address);

// generate a new key pair from a known private key (WIF)
const privateKey
  = 'cSDE1zzvpATcyp6U2ABdp7BRPkKUd85tfxfALvKhVzVjj44LSzFa';
const keyPair2 = ECPair.fromWIF(privateKey, regtest);
// console.log("Private Key (WIF):", keyPair2.toWIF());
// console.log("Public Key:", keyPair2.publicKey.toString('hex'));  // Compressed public key
// console.log("Address:", bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair2.publicKey), network: regtest }).address);

// Get UTXOs for a given address


const bitcoinAddress = bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair2.publicKey), network: regtest }).address;

// perform bitcoin-cli -regtest generatetoaddress  2  "mq9cNMM2EiUMh9L9nDBKi2BJ7MvbqYnkeL"
execSync(`bitcoin-cli -regtest generatetoaddress  2  "${bitcoinAddress}"`);

const utxos = getUTXOs(bitcoinAddress);

console.log("UTXOs with amount > 0:", utxos);

// find a UTXO with amount > 0 and use it as input for the transaction
// For simplicity, we'll use the first UTXO in the list
// You may need to select a UTXO with sufficient funds for the transaction
// and handle multiple UTXOs if needed
if (utxos.length === 0) {
  console.error("No UTXOs found for the address:", bitcoinAddress);
  return;
}   

// Use the first UTXO as input for the transaction
// const utxo = utxos[0];
// console.log("Selected UTXO:", utxo);
// get the previous txhex from the first utxo 
const prevTxHex = execSync(`bitcoin-cli -regtest getrawtransaction ${utxos[0].txid}`, { encoding: 'utf8' }).trim();
console.log('prevTxHex:', prevTxHex);



const utxo = {
  txId: utxos[0].txid, // Replace with your UTXO's TXID
  vout: utxos[0].vout,                        // Output index
  value: Math.round(utxos[0].amount * 1e8),                // Amount in satoshis (e.g., 50 BTC in satoshis)
};

// Recipient address (generate or use existing)
const recipientAddress = bitcoinAddress;
const senderAddress = bitcoinAddress;
// Transaction parameters
const sendAmount = Math.round((utxos[0].amount - 0.001) * 1e8); // Amount to send in satoshis (e.g., 0.0999 BTC)
const fee = 10000;                // Fee in satoshis (0.0001 BTC)

// Initialize Psbt (Partially Signed Bitcoin Transaction)
const psbt = new bitcoin.Psbt({ network: regtest });

// IMPORTANT: Fetch the raw hex of the previous transaction (`nonWitnessUtxo`)
// You can get this from your regtest node: `bitcoin-cli -regtest getrawtransaction <txid>`
// const prevTxRawHex = "0200000001c25a238797a1bf5b474763b25676b84b7335ab0cecb60287ad804941dfac7af7010000006b4830450221008f4cbf3d9a15b729e7907cc532ec38586ae5ef183b8ee48672ab8847a4dffa4a02207737ff55ff75dddcefaf53b96045d65576c564299fb507c5aaa0b1bd280ee1af0121022754fdf06dbf514c5a0bcb82a10f20777f59ee379c608764f5f21d43c984c296ffffffff02706f9800000000001976a91469a7e3ab58ad5c1abd8712120607c197334ec7a788ac80fd9c76000000001976a91469a7e3ab58ad5c1abd8712120607c197334ec7a788ac00000000";

// Add UTXO as input
psbt.addInput({
  hash: utxos[0].txid,
  index: utxos[0].vout,
  nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
});

// Add output to recipient
psbt.addOutput({
  address: recipientAddress,
  value: sendAmount,
});

// (Optional) Change address back to sender
const change = utxo.value - sendAmount - fee;
if (change > 0) {
  psbt.addOutput({
    address: senderAddress,
    value: change,
  });
}

// get sighash for private key to sign
const hashType = bitcoin.Transaction.SIGHASH_ALL;


// Sign the transaction

psbt.signInput(0, {
    publicKey: Buffer.from(keyPair2.publicKey),
    sign: (hash) => {
        console.log('hash:', hash.toString('hex'));
        const signature = keyPair2.sign(hash);
        return Buffer.from(signature); 
    },
});


// utxos.forEach((_, index) => {
//     psbt.signInput(index, {
//         publicKey: Buffer.from(keyPair.publicKey),
//         sign: (hash) => {
//             const signature = keyPair.sign(hash);
//             return Buffer.from(signature); 
//         },
//     });
// });


// psbt.signInput(0, {
//     publicKey: hsmGetPublicKey(), // Function to retrieve the public key from HSM
//     sign: async (hash) => {
//         const signature = await hsmSign(hash); // Call the HSM to sign the hash
//         return Buffer.from(signature); // Return the signature as a buffer
//     },
// });

// Finalize the transaction

psbt.finalizeAllInputs();

// Get transaction hex ready for broadcast
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
