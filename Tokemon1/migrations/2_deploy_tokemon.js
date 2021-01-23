const Tokemon = artifacts.require("Tokemon");
const Presale = artifacts.require("Presale");

module.exports = async function (deployer) {
  await deployer.deploy(Tokemon);
  await deployer.deploy(Presale, Tokemon.address);
};
