openssl pkcs8 -topk8 -inform DER -in private_key.der -outform PEM -out private_key.pkcs8 -nocrypt
softhsm2-util --import private_key.pkcs8 --slot 591737422 --label "secuux" --pin "1234" --id 101564
softhsm2-util --show-slots
pkcs11-tool --module /usr/local/lib/softhsm/libsofthsm2.so --list-objects --pin 1234
pkcs11-tool --module /usr/local/lib/softhsm/libsofthsm2.so --delete-object --pin 1234 --label "privatekey" --type privkey
pkcs11-tool --module /home/secux/workspaces/cryptoauthlib/build/libcryptoauth.so  --list-slots --pin 1234
pkcs11-tool --module /home/secux/workspaces/cryptoauthlib/build/libcryptoauth.so --list-mechanisms
pkcs11-tool --module /home/secux/workspaces/cryptoauthlib/build/libcryptoauth.so --list-objects --pin 1234
pkcs11-tool --module /home/secux/workspaces/cryptoauthlib/build/libcryptoauth.so --pin 1234 --keypairgen --key-type EC:secp256r1 --label "MyKeyPair"