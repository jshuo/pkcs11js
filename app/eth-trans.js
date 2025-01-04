// this is a test code to transfer ETH from one account to another using Besu node
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
    const weiValue = web3.utils.toWei('1', 'ether'); // Correct conversion to Wei
    const hexValue = web3.utils.toHex(BigInt(weiValue)); // Convert to BigInt to ensure it's treated as a number
    const gasPrice = await web3.eth.getGasPrice();
    const txParams = {
        nonce: web3.utils.toHex(nonce),
        gasPrice: web3.utils.toHex(gasPrice),
        gasLimit: web3.utils.toHex(21000),  // Standard gas limit for ETH transfers
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        value: hexValue,  
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
