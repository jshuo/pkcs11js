#!/bin/bash
set -x

MODULE_PATH="/usr/local/lib/softhsm/libsofthsm2.so"
PIN="1234"

pkcs11-tool --module "$MODULE_PATH" --list-objects --pin "$PIN" | \
awk '/ID:/ {id=$2} /type:/ {type=$2; print id, type}' | \
while read -r id type; do
    case $type in
        private) pkcs11_type="privkey";;
        public) pkcs11_type="pubkey";;
        secret) pkcs11_type="seckey";;
        *) continue;;
    esac
    pkcs11-tool --module "$MODULE_PATH" --delete-object --id "$id" --type "$pkcs11_type" --pin "$PIN"
done
