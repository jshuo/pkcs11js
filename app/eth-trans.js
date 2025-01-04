const { keccak256 } = require('js-sha3');
const ethUtil = require('ethereumjs-util');
const BN = require('bn.js');
const { TransactionFactory } = require('@ethereumjs/tx');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { Web3 } = require('web3');

const HTTP_PROVIDER = 'http://58.115.23.124:8545';
const web3 = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER));

const privateKey = Buffer.from(
    'df0bca5a38585f82036736aac53a5517392118795e96d243eb9356a899b144de',
    'hex'
);

async function main() {
    const ethAddr = web3.eth.accounts.privateKeyToAccount('0x' + privateKey.toString('hex')).address;
    console.log('Ethereum address:', ethAddr);

    const balance = await web3.eth.getBalance(ethAddr);
    console.log('Balance:', balance);

    const nonce = await web3.eth.getTransactionCount(ethAddr);
    console.log('Nonce:', nonce);
    const txParams = {
        nonce: web3.utils.toHex(nonce),
        gasPrice: "0x4a817c800",
        gasLimit: "0x5208",  // Standard gas limit for ETH transfers
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: '0xDE0B6B3A7640000',  
        data: '0x'
    };

    console.log('Transaction parameters:', txParams);

    const customChain = Common.custom({
        name: 'besu',
        chainId: 1981,
        networkId: 1981
    }, { baseChain: Chain.Mainnet, hardfork: Hardfork.London });

    const tx = TransactionFactory.fromTxData(txParams, { common: customChain });
    const signedTx = tx.sign(privateKey);

    const receipt = await web3.eth.sendSignedTransaction('0x' + Buffer.from(signedTx.serialize()).toString('hex'));
    console.log('Receipt:', receipt);
}

main().catch(console.error);
