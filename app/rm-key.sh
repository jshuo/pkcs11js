#!/bin/bash
MODULE_PATH="/usr/local/lib/softhsm/libsofthsm2.so"
PIN="1234"
KEEP_ID="66646566356137372d643634312d346334392d393738332d666439643836383462396534"

# List all objects and filter out IDs
object_list=$(pkcs11-tool --module $MODULE_PATH --list-objects --pin $PIN | grep -Eo 'ID:\s+[0-9a-f-]+' | awk '{print $2}')

# Object types to check
TYPES=("privkey" "pubkey" "cert")

# Loop through objects and delete all except the one to keep
for id in $object_list; do
    if [[ "$id" != "$KEEP_ID" ]]; then
        for type in "${TYPES[@]}"; do
            echo "Attempting to delete object with ID: $id (type: $type)"
            pkcs11-tool --module $MODULE_PATH --delete-object --id $id --type $type --pin $PIN 2>/dev/null
        done
    fi
done

echo "Cleanup complete."
