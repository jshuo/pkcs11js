const bitcoin = require('bitcoinjs-lib');
// Use Bitcoin regtest network
const ECPairFactory = require('ecpair').ECPairFactory;
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);
const { exec } = require('child_process');

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


// Address derived from the key:
const { address } = bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair.publicKey), network: regtest });
console.log("Address:", address);

// generate a new key pair from a known private key (WIF)
const privateKey
  = 'cSDE1zzvpATcyp6U2ABdp7BRPkKUd85tfxfALvKhVzVjj44LSzFa';
const keyPair2 = ECPair.fromWIF(privateKey, regtest);
console.log("Private Key (WIF):", keyPair2.toWIF());
console.log("Public Key:", keyPair2.publicKey.toString('hex'));  // Compressed public key
console.log("Address:", bitcoin.payments.p2pkh({ pubkey: Buffer.from(keyPair2.publicKey), network: regtest }).address);

// Example UTXO from regtest wallet
const utxo = {
  txId: 'f77aacdf414980ad8702b6ec0cab35734bb87656b26347475bbfa19787235ac2', // Replace with your UTXO's TXID
  vout: 1,                        // Output index
  value: 20* 1e8,                // Amount in satoshis (e.g., 50 BTC in satoshis)
};

// Recipient address (generate or use existing)
const recipientAddress = 'mq9cNMM2EiUMh9L9nDBKi2BJ7MvbqYnkeL';
const senderAddress = 'mq9cNMM2EiUMh9L9nDBKi2BJ7MvbqYnkeL';
// Transaction parameters
const sendAmount = 0.0999 * 1e8; // Amount to send in satoshis (e.g., 0.0999 BTC)
const fee = 10000;                // Fee in satoshis (0.0001 BTC)

// Initialize Psbt (Partially Signed Bitcoin Transaction)
const psbt = new bitcoin.Psbt({ network: regtest });

// IMPORTANT: Fetch the raw hex of the previous transaction (`nonWitnessUtxo`)
// You can get this from your regtest node: `bitcoin-cli -regtest getrawtransaction <txid>`
const prevTxRawHex = "0200000000010664cadd20646d628117a2502ae8416a5aaac5eba82fe8ecff8aa115acf2365d360000000017160014753524243e8ea77e83b45dd7709bb040ac5b0de8fdffffff31fddd2561265165a96d0cd02f58edf4fb341d8292aa43eff0283ae0474bbf5c0000000017160014609d0c3de2723497e8f6edca25db358269d606eafdffffff0653f52771e08b5e0f003c889e4199fe48207f6b112f0c8bef7632745ad3fe940000000017160014593f20fef0e0342e85e32317fc0c4c84771c448dfdffffffca4b69b8c79cb3e826d4522b002a2aa26aa7bfb05df1b60fe70c6b4c16a6f4f30000000017160014442d822e04cbe6e033afb7dffe29c5816f4b49d0fdffffff575f39d3b16ec82deb8aea12e4bb0f8347d0ce1a7f53be9fb04f897aa5caea0200000000171600142a8c2bae9823afd0a1ddd278ede154af72aaf7c8fdffffff24bb9dde057f831d5638abd168f3418864dde57852bfd21530da694ba8522bbc0100000017160014f769b16752135d9f6de04684828e876254e259cafdffffff021a8e0007000000001976a9142e8837fea70b04856ecd0089a715a9aa872f251888ac00943577000000001976a91469a7e3ab58ad5c1abd8712120607c197334ec7a788ac0247304402206fd012c2760081046bcc21501a900e1e7b5c4d31837f74f6b8a78feed2dd1f78022054c889af1790379c728dba98855b782b984e6ffe1f2caffd1d31143445bad3c5012102c8a97e37098289ef7e854a4bd5445b6e3c9ac01017d6c0a27f961d77a1908a6402473044022070f4f0c3b9b595704d6deb11d0b65344cf76632af3c861356498ccb101059a5202205926fe0d1809ba91396865dffe1d6f13f8f5e28dc17da0b0a072ffe2737927a3012103c6d583ce2c5c9b1975b1ef106945647954627861939cde51ec9c1a8387ebf21d02473044022055aa73560082d39333082b170317c217555481beb3253c856a21dda186b9ba3902203037b0279e05956a5f44debae65f0cd411337f5ab582b612f81bea2728d8a0870121023485de3e636d23b5894e54fac32b0d00e051d358fe46cc498a0329f70acbdf090247304402200857f6ebb8ecc57e8e33d53ec46ccf5e7dbdbcd1800f4a7235a8883c5719b87702200ebefef719631c05a4b95c9862c9c1325a0e79f35bd8a42f643399fcda27223a012102ec75e5aca4bc10a700bd0b546637848c622a5dc5589cf2d2414791c7346cad19024730440220272b23bddba98636b3f1f6acf1f1830d0fcd8933959dc3b8ba0cf6df598f7d9502201f632f69e8d33c636e87496ad768c3957080e338a504c0a1e46978f064d9316e012102e4869f2978f4a4f8147c6ff3cd561941a2c1bf0d415675961229610f355faf610247304402203084b71b942b132a5cca3831c2b7c2fb1076c08da3326891d71408a6003c5b1202203868fddcb2c3b7e3970c4592cc97f7581ea5f004b91369cd0f51302f329e9bd80121022ec451857397b084b6316a80a267a104e06d420bce1ffe383145db9e0023bafffb2a0000";

// Add UTXO as input
psbt.addInput({
  hash: utxo.txId,
  index: utxo.vout,
  nonWitnessUtxo: Buffer.from(prevTxRawHex, 'hex'),
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

// Sign the transaction

psbt.signInput(0, {
    publicKey: Buffer.from(keyPair2.publicKey),
    sign: (hash) => {
        const signature = keyPair2.sign(hash);
        return Buffer.from(signature); 
    },
});

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
