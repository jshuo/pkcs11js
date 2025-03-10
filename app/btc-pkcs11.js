'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
var pkcs11 = require('pkcs11js');
var bitcoin = require('bitcoinjs-lib');
var crypto_1 = require('crypto');
const { v4: uuidv4 } = require('uuid');
// Initialize PKCS#11
var pkcs11Lib = new pkcs11.PKCS11();
pkcs11Lib.load('/usr/local/lib/softhsm/libsofthsm2.so');
// pkcs11Lib.load("/home/secux/workspaces/cryptoauthlib/build/libcryptoauth.so");
var keys;
pkcs11Lib.C_Initialize();
try {
  // Add mID

  // Open a session and login
  var slot = pkcs11Lib.C_GetSlotList(true)[0];
  var session = pkcs11Lib.C_OpenSession(
    slot,
    pkcs11.CKF_SERIAL_SESSION | pkcs11.CKF_RW_SESSION
  );
  pkcs11Lib.C_Login(session, pkcs11.CKU_USER, '1234');


  let mID =
    '66353334336463372d333732622d346531312d383165392d366135633339383461666138'; // ID from pkcs11-tool output
  // get public key
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

  // Retrieve the EC_POINT attribute from the public key
  var ecPoint = pkcs11Lib.C_GetAttributeValue(session, hsmPbKey, [
    { type: pkcs11.CKA_EC_POINT },
  ])[0].value;
  // Parse EC point and compress the public key
  var uncompressedKey = ecPoint.slice(2); // Skip first two bytes
  var compressedKey = Buffer.concat([
    Buffer.from([uncompressedKey[0] % 2 === 0 ? 0x02 : 0x03]),
    uncompressedKey.slice(1, 33),
  ]);
  console.log('Compressed Public Key:', compressedKey.toString('hex'));
  const message = Buffer.from('Bitcoin PKCS11 SoftHSM test');
  var digest = (0, crypto_1.createHash)('sha256').update(message).digest(); // Hashing the message

  pkcs11Lib.C_FindObjectsFinal(session);

  pkcs11Lib.C_SignInit(session, { mechanism: pkcs11.CKM_ECDSA }, hsmPvKey);
  var signatureBuffer = Buffer.alloc(64); // ECDSA signatures are typically 64 bytes for secp256k1
  pkcs11Lib.C_Sign(session, digest, signatureBuffer);
  console.log('Signature (DER):', signatureBuffer.toString('hex'));
  // Verify the signature using pkcs11js
  var mechanism = { mechanism: pkcs11.CKM_ECDSA };
  // Initialize the signature verification process
  pkcs11Lib.C_VerifyInit(session, mechanism, hsmPbKey);
  // Perform the verification
  var isVerified = pkcs11Lib.C_Verify(session, digest, signatureBuffer);
  console.log('Signature Verified:', isVerified); // Should log `true` if the signature is valid
  // Clean up
  pkcs11Lib.C_Logout(session);
  pkcs11Lib.C_CloseSession(session);
} catch (err) {
  console.error('Error:', err);
} finally {
  pkcs11Lib.C_Finalize();
}
