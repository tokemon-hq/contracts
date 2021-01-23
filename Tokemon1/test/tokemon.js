const truffleAssert = require('truffle-assertions');
const should = require('chai').should();
const send = (method, params = []) =>
  new Promise((resolve, reject) =>
    web3.currentProvider.send({id: 0, jsonrpc: "2.0", method, params}, (err, x) => {
        if(err) reject(err)
        else resolve(x)
    })
  )
const timeTravel = async (seconds) => {
  await send("evm_increaseTime", [seconds])
  await send("evm_mine")
}
const snapshot = () => send("evm_snapshot").then(x => x.result)
const revert = (snap) => send("evm_revert", [snap])

const TokemonToken = artifacts.require('../contracts/Tokemon.sol')
const PresaleContract = artifacts.require('../contracts/Presale.sol')

contract('tokemon_functionality', async (accounts) => {

    beforeEach(async () => {
        // init contracts
        tokemonToken = await TokemonToken.new({from: accounts[0]});
        presaleContract = await PresaleContract.new(tokemonToken.address, {from: accounts[0]});

        // transfer 2500 tokens to presale
        let amount = web3.utils.toBN('2500000000000000000000');
        await tokemonToken.transfer(presaleContract.address, amount, {from: accounts[0]});

    });

    it("owner & presale contract should have 2500 tokens each", async () => {
        let amount = web3.utils.toBN('2500000000000000000000');

        let balanceOwner = ((await tokemonToken.balanceOf(accounts[0])).toString());
        balanceOwner.should.equal(amount.toString())

        let balancePresale = ((await tokemonToken.balanceOf(presaleContract.address)).toString());
        balancePresale.should.equal(amount.toString())

        // new Promise(() => console.log("Balance is" + balance))
    });

    it("presale should not receive funds before correct block", async () => {
        await truffleAssert.reverts(presaleContract.send(1, {from: accounts[1]}), "Presale hasn't started yet");
    });

    it("correct balances after 1 eth in presale", async () => {
        lastSnapshot = await snapshot();

        try {
            const start = await presaleContract.startDate();
            const delta = parseInt(start - Date.now() / 1000) + 1;
            await timeTravel(delta);

            let expectedEthBalancePresale = web3.utils.toWei("1","ether")
            let expectedTokenBalancePresale = web3.utils.toBN('2491666666666666666700');
            let expectedTokenBalanceClient = web3.utils.toBN('8333333333333333300');

            await presaleContract.send(expectedEthBalancePresale, {from: accounts[2]});

            let actualEthBalancePresale = await web3.eth.getBalance(presaleContract.address);
            assert.deepEqual(actualEthBalancePresale, expectedEthBalancePresale, "Presale eth balance incorrect!");

            let actualTokenBalancePresale = ((await tokemonToken.balanceOf(presaleContract.address)).toString());
            actualTokenBalancePresale.should.equal(expectedTokenBalancePresale.toString());

            let actualTokenBalanceClient = ((await tokemonToken.balanceOf(accounts[2])).toString());
            actualTokenBalanceClient.should.equal(expectedTokenBalanceClient.toString());
        }
        finally {
            await revert(lastSnapshot);
        }
    });

    it("should not allow more than 10 eth in presale per wallet", async () => {
        lastSnapshot = await snapshot();

        try {
            const start = await presaleContract.startDate();
            const delta = parseInt(start - Date.now() / 1000) + 1;
            await timeTravel(delta);

            let sendTen = web3.utils.toWei("10", "ether")
            let sendPointOne = web3.utils.toWei("0.1", "ether")

            await presaleContract.send(sendTen, {from: accounts[3]});

            await truffleAssert.reverts(presaleContract.send(sendPointOne, {from: accounts[3]}), "Max 10 eth worth of tokens allowed in presale");

        } finally {
            await revert(lastSnapshot);
        }
    });

    it("should not allow presale if no tokens available", async () => {
        lastSnapshot = await snapshot();

        try {
            const start = await presaleContract.startDate();
            const delta = parseInt(start - Date.now() / 1000) + 1;
            await timeTravel(delta);

            await presaleContract.withdrawTokemon();

            let sendOne = web3.utils.toWei("1", "ether")

            await truffleAssert.reverts(presaleContract.send(sendOne, {from: accounts[3]}), "Not enough tokens in Presale contract");

        } finally {
            await revert(lastSnapshot);
        }
    });

    it("should withdraw eth and tokens correctly", async () => {
        lastSnapshot = await snapshot();

        try {
            const start = await presaleContract.startDate();
            const delta = parseInt(start - Date.now() / 1000) + 1;
            await timeTravel(delta);

            let sendOne = web3.utils.toWei("1", "ether");
            await presaleContract.send(sendOne, {from: accounts[4]});

            let prevEthBalancePresale = web3.utils.toBN(await web3.eth.getBalance(presaleContract.address));
            let prevTokenBalancePresale = await tokemonToken.balanceOf(presaleContract.address);

            let prevEthBalanceOwner = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
            let prevTokenBalanceOwner = await tokemonToken.balanceOf(accounts[0]);

            receipt1 = await presaleContract.withdrawTokemon();
            tx1 = await web3.eth.getTransaction(receipt1.tx);
            gasPrice1 = web3.utils.toBN(tx1.gasPrice);
            gasUsed1 = web3.utils.toBN(receipt1.receipt.gasUsed);
            gas1 = gasPrice1.mul(gasUsed1);

            receipt2 = await presaleContract.withdrawProvidedEth();
            tx2 = await web3.eth.getTransaction(receipt2.tx);
            gasPrice2 = web3.utils.toBN(tx2.gasPrice);
            gasUsed2 = web3.utils.toBN(receipt2.receipt.gasUsed);
            gas2 = gasPrice2.mul(gasUsed2);


            let newEthBalancePresale = web3.utils.toBN(await web3.eth.getBalance(presaleContract.address));
            let newTokenBalancePresale = await tokemonToken.balanceOf(presaleContract.address);

            let newEthBalanceOwner = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
            let newTokenBalanceOwner = await tokemonToken.balanceOf(accounts[0]);

            newEthBalancePresale.toString().should.equal("0");
            newTokenBalancePresale.toString().should.equal("0");

            tokenSum = prevTokenBalanceOwner.add(prevTokenBalancePresale)
            assert.deepEqual(newTokenBalanceOwner.toString(), tokenSum.toString(), "New owner tokens balance incorrect");

            ethSum = prevEthBalanceOwner.add(prevEthBalancePresale).sub(gas1).sub(gas2)
            assert.deepEqual(newEthBalanceOwner.toString(), ethSum.toString(), "New owner balance incorrect");

        } finally {
            await revert(lastSnapshot);
        }
    });

    it("should not allow withdraw from non-owner", async () => {
        lastSnapshot = await snapshot();

        try {
            const start = await presaleContract.startDate();
            const delta = parseInt(start - Date.now() / 1000) + 1;
            await timeTravel(delta);

            await truffleAssert.reverts(presaleContract.withdrawTokemon({from: accounts[1]}), "Ownable: caller is not the owner");
            await truffleAssert.reverts(presaleContract.withdrawProvidedEth({from: accounts[1]}), "Ownable: caller is not the owner");

        } finally {
            await revert(lastSnapshot);
        }
    });

})
