import * as pkcs11 from 'pkcs11js';
import * as bitcoin from 'bitcoinjs-lib';
import { createHash } from 'crypto';

// Initialize PKCS#11
const pkcs11Lib = new pkcs11.PKCS11();
pkcs11Lib.load("/usr/local/lib/softhsm/libsofthsm2.so");
pkcs11Lib.C_Initialize();

try {
    // Open a session and login
    const slot = pkcs11Lib.C_GetSlotList(true)[0];
    const session = pkcs11Lib.C_OpenSession(slot, pkcs11.CKF_SERIAL_SESSION | pkcs11.CKF_RW_SESSION);
    pkcs11Lib.C_Login(session, pkcs11.CKU_USER, '1234');

    // Generate key pair with secp256k1 curve (Bitcoin curve)
    const keys = pkcs11Lib.C_GenerateKeyPair(
        session,
        { mechanism: pkcs11.CKM_ECDSA_KEY_PAIR_GEN },
        [
            { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
            { type: pkcs11.CKA_ECDSA_PARAMS, value: Buffer.from([0x06, 0x05, 0x2B, 0x81, 0x04, 0x00, 0x0A]) }, // secp256k1 curve OID
            { type: pkcs11.CKA_LABEL, value: "MyKeyLabel" },
            { type: pkcs11.CKA_DERIVE, value: true },
        ],
        [
            { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PRIVATE_KEY },
            { type: pkcs11.CKA_LABEL, value: "MyKeyLabel" },
            { type: pkcs11.CKA_DERIVE, value: true },
        ]
    );

    // Find the public key object
    pkcs11Lib.C_FindObjectsInit(session, [
        { type: pkcs11.CKA_CLASS, value: pkcs11.CKO_PUBLIC_KEY },
        { type: pkcs11.CKA_LABEL, value: "MyKeyLabel" },
    ]);

    const publicKeyHandle = pkcs11Lib.C_FindObjects(session, 1)[0];
    pkcs11Lib.C_FindObjectsFinal(session);

    if (!publicKeyHandle) {
        throw new Error('Public key object not found');
    }

    // Retrieve the EC_POINT attribute from the public key
    const ecPoint = pkcs11Lib.C_GetAttributeValue(session, publicKeyHandle, [
        { type: pkcs11.CKA_EC_POINT },
    ])[0].value;

    // Parse EC point and compress the public key
    const uncompressedKey = ecPoint.slice(2); // Skip first two bytes
    const compressedKey = Buffer.concat([
        Buffer.from([uncompressedKey[0] % 2 === 0 ? 0x02 : 0x03]),
        uncompressedKey.slice(1, 33),
    ]);

    console.log('Compressed Public Key:', compressedKey.toString('hex'));

    // Generate Bitcoin address (Bitcoin uses secp256k1)
    const { address } = bitcoin.payments.p2pkh({
        pubkey: compressedKey,
        network: bitcoin.networks.testnet, // Change to bitcoin.networks.bitcoin for mainnet
    });

    console.log('Bitcoin Address:', address);

    // Sign a message
    const message = Buffer.from('Hello, world!');
    // Create a Bitcoin transaction
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
    psbt.addInput({
        hash: '7d067b4a697a09d2c3cff7d4d9506c9955e93bff41bf82d439da7d030382bc3e',
        index: 0,
        nonWitnessUtxo: Buffer.from(
            '0200000001f9f34e95b9d5c8abcd20fc5bd4a825d1517be62f0f775e5f36da944d9' +
              '452e550000000006b483045022100c86e9a111afc90f64b4904bd609e9eaed80d48' +
              'ca17c162b1aca0a788ac3526f002207bb79b60d4fc6526329bf18a77135dc566020' +
              '9e761da46e1c2f1152ec013215801210211755115eabf846720f5cb18f248666fec' +
              '631e5e1e66009ce3710ceea5b1ad13ffffffff01' +
              // value in satoshis (Int64LE) = 0x015f90 = 90000
              '905f010000000000' +
              // scriptPubkey length
              '19' +
              // scriptPubkey
              '76a9148bbc95d2709c71607c60ee3f097c1217482f518d88ac' +
              // locktime
              '00000000',
            'hex',
          ),
    });
    psbt.addOutput({
        address: 'mnvqBJauzzqCUMHQpHPrYC4aX9MKjhSxsb',
        value: 10000
    });

    // Sign the transaction
    //ts
    var sighash = psbt.__CACHE.__TX.hashForSignature(0, psbt.__CACHE.__TX.ins[0].script, 0, bitcoin.Transaction.SIGHASH_ALL);
    pkcs11Lib.C_SignInit(session, { mechanism: pkcs11.CKM_ECDSA }, keys.privateKey);
    var txSignature = Buffer.alloc(64);
    pkcs11Lib.C_Sign(session, sighash, txSignature);
    // Add the signature to the input
    var signatureScript = bitcoin.script.signature.encode(txSignature, bitcoin.Transaction.SIGHASH_ALL);
    psbt.updateInput(0, {
        partialSig: [
            {
                pubkey: compressedKey,
                signature: signatureScript,
            },
        ],
    });
    psbt.updateInput(0, {
        finalScriptSig: bitcoin.script.compile([
            bitcoin.script.signature.encode(txSignature, bitcoin.Transaction.SIGHASH_ALL),
            compressedKey,
        ]),
    });
    var tx = psbt.extractTransaction();
    console.log('Signed Transaction:', tx.toHex());

    const digest = createHash('sha256').update(message).digest(); // Hashing the message

    pkcs11Lib.C_SignInit(session, { mechanism: pkcs11.CKM_ECDSA }, keys.privateKey);
    const signatureBuffer = Buffer.alloc(64); // ECDSA signatures are typically 64 bytes for secp256k1
    pkcs11Lib.C_Sign(session, digest, signatureBuffer);

    console.log('Signature (DER):', signatureBuffer.toString('hex'));

    // Verify the signature using pkcs11js
    const mechanism = { mechanism: pkcs11.CKM_ECDSA };

    // Initialize the signature verification process
    pkcs11Lib.C_VerifyInit(session, mechanism, publicKeyHandle);

    // Perform the verification
    const isVerified = pkcs11Lib.C_Verify(session, digest, signatureBuffer);
    console.log('Signature Verified:', isVerified); // Should log `true` if the signature is valid

    // Clean up
    pkcs11Lib.C_Logout(session);
    pkcs11Lib.C_CloseSession(session);
} catch (err) {
    console.error('Error:', err);
} finally {
    pkcs11Lib.C_Finalize();
}
