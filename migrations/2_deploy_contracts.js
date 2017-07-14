const EtherToken = artifacts.require('./EtherToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
const PriceFeed = artifacts.require('./PriceFeed.sol');
const Exchange = artifacts.require('./Exchange.sol');
const Universe = artifacts.require('./Universe.sol');

module.exports = (deployer, network, accounts) => {
  // Deploy contracts
  deployer.deploy([
    EtherToken,
    MelonToken,
    BitcoinToken,
    RepToken,
    EuroToken,
    Exchange,
  ]).then(() =>
    deployer.deploy(PriceFeed, accounts[1], EtherToken.address)
  ).then(() =>
    deployer.deploy(Universe,
      [EtherToken.address, MelonToken.address, BitcoinToken.address, RepToken.address, EuroToken.address],
      [PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address, PriceFeed.address],
      [Exchange.address, Exchange.address, Exchange.address, Exchange.address, Exchange.address]
    )
  );
}
