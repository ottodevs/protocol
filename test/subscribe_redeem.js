const assert = require('assert');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');
const BigNumber = require('bignumber.js')

const AssetProtocol = artifacts.require('AssetProtocol.sol');
const EtherToken = artifacts.require('EtherToken.sol');
const MelonToken = artifacts.require('MelonToken.sol');
const PriceFeed = artifacts.require('PriceFeed.sol');
const Exchange = artifacts.require('Exchange.sol');
const Universe = artifacts.require('Universe.sol');
const Subscribe = artifacts.require('./Subscribe.sol');
const Redeem = artifacts.require('./Redeem.sol');
const RiskMgmt = artifacts.require('RiskMgmt.sol');
const ManagementFee = artifacts.require('ManagementFee.sol');
const PerformanceFee = artifacts.require('PerformanceFee.sol');
const Vault = artifacts.require('Vault.sol');



describe('Subscribe and Redeem modules',() => {
contract('Subscribe', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const INVESTOR = accounts[1];
  const PORTFOLIO_NAME = 'Melon Portfolio';
  const PORTFOLIO_SYMBOL = 'MLN-P';
  const PORTFOLIO_DECIMALS = 18;
  const ALLOWANCE_AMOUNT = constants.PREMINED_AMOUNT / 10;

  // Test globals
  let vaultContract;
  let etherTokenContract;
  let melonTokenContract;
  let priceFeedContract;
  let exchangeContract;
  let universeContract;
  let subscribeContract;
  let redeemContract;
  let riskmgmtContract;
  let managementFeeContract;
  let performanceFeeContract;
  let exchangeTestCases;
  let riskmgmtTestCases;

  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=MLNETH,ETHXBT,REPETH,ETHEUR
  let data = {
    'error':[],
    'result': {
      'XETHXXBT':{'a':['0.048000','871','871.000'],'b':['0.047805','38','38.000'],'c':['0.048000','25.00000000'],'v':['114473.71344905','228539.93878035'],'p':['0.044567','0.031312'],'t':[4425,8621],'l':['0.041600','0.038900'],'h':['0.048700','0.048700'],'o':'0.041897'},
      'XETHZEUR':{'a':['43.65000','167','167.000'],'b':['43.51021','1','1.000'],'c':['43.60000','10.00000000'],'v':['138408.66847600','245710.71986448'],'p':['41.96267','40.67496'],'t':[6247,11473],'l':['39.27000','37.42000'],'h':['44.96998','44.96998'],'o':'39.98679'},
      'XMLNXETH':{'a':['0.59890000','36','36.000'],'b':['0.56119000','205','205.000'],'c':['0.56000000','0.00022300'],'v':['1621.65161884','2098.74750661'],'p':['0.60344695','0.61624131'],'t':[175,264],'l':['0.56000000','0.56000000'],'h':['0.65929000','0.67800000'],'o':'0.65884000'},
      'XREPXETH':{'a':['0.202450','70','70.000'],'b':['0.200200','50','50.000'],'c':['0.199840','1.81418400'],'v':['2898.19114399','5080.16762561'],'p':['0.197919','0.208634'],'t':[219,382],'l':['0.182120','0.182120'],'h':['0.215080','0.239990'],'o':'0.214740'}
    }
  };

  let assets = [];
  let pricesRelAsset = functions.krakenPricesRelAsset(data);

  describe('PREPARATIONS', () => {
    before('Check accounts, deploy modules, set testcase', () => {
      PriceFeed.deployed().then((deployed) => { priceFeedContract = deployed; });
      Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
      Universe.deployed().then((deployed) => { universeContract = deployed; });
      Subscribe.deployed().then((deployed) => { subscribeContract = deployed; });
      Redeem.deployed().then((deployed) => { redeemContract = deployed; });
      RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
      ManagementFee.deployed().then((deployed) => { managementFeeContract = deployed; });
      PerformanceFee.deployed().then((deployed) => { performanceFeeContract = deployed; });
      EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
      MelonToken.deployed().then((deployed) => { melonTokenContract = deployed; });
    });

    it('Define Price Feed testcase', () => {
      universeContract.numAssignedAssets()
      .then((numAssets) => {
        for (let i = 0; i < numAssets; i += 1) {
          universeContract.assetAt(i)
          .then((assetAddr) => {
            assets.push(assetAddr);
          })
        }
      });
    });

    it('Deploy smart contract', (done) => {
      Vault.new(
        OWNER,
        PORTFOLIO_NAME,
        PORTFOLIO_SYMBOL,
        PORTFOLIO_DECIMALS,
        universeContract.address,
        subscribeContract.address,
        redeemContract.address,
        riskmgmtContract.address,
        managementFeeContract.address,
        performanceFeeContract.address,
        { from: OWNER }
      )
      .then((result) => {
        vaultContract = result;
        return vaultContract.totalSupply();
      })
      .then((result) => {
        assert.equal(result.toNumber(), 0);
        done();
      });
    });

    it('Set multiple prices', (done) => {
      priceFeedContract.updatePrice(assets, pricesRelAsset, { from: OWNER })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        for (let i = 0; i < result.logs.length; i += 1) {
          assert.equal(result.logs[i].event, 'PriceUpdated');
          assert.equal(result.logs[i].args.ofAsset, assets[i]);
          // TODO test against actual block.time
          assert.notEqual(result.logs[i].args.atTimestamp.toNumber(), 0);
          assert.equal(result.logs[i].args.ofPrice, pricesRelAsset[i]);
        }
        done();
      });
    });

    it('INVESTOR approves SUBSCRIBE to send funds of melonTokenContract', (done) => {
      melonTokenContract.approve(subscribeContract.address, ALLOWANCE_AMOUNT, { from: INVESTOR })
      .then(() => melonTokenContract.allowance(INVESTOR, subscribeContract.address))
      .then((result) => {
        assert.equal(result, ALLOWANCE_AMOUNT);
        done();
      });
    });
  });

  // MAIN TESTING
  describe('SUBSCRIBE TO PORTFOLIO', () => {
    const depositAmt = web3.toWei(10,'ether');  // give ourselves lots of ETH-T
    it('adds ETH-T to investor\'s balance', () => {
      return etherTokenContract.deposit({from: INVESTOR, value: depositAmt})
      .then(() => etherTokenContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res, depositAmt));
    })

    it('Creates shares using the reference asset', () => {
      let reqVal;
      const wantedShares = new BigNumber(1e+18);
      return vaultContract.getRefPriceForNumShares.call(wantedShares)
      .then(res => {
        console.log(res);
        reqVal = res;
        return etherTokenContract.approve(
          subscribeContract.address, reqVal, {from: INVESTOR}
        )
      })
      .then(() => subscribeContract.createSharesWithReferenceAsset(
        vaultContract.address, wantedShares, reqVal, {from: INVESTOR}
      ))
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res.toNumber(), wantedShares.toNumber()))
    })

    it('Creates shares when investment equal to portfolio funds', () => {
      let reqVal;
      let origShares;
      const wantedShares = new BigNumber(1e+18);
      return vaultContract.balanceOf.call(INVESTOR)
      .then(res => {
        origShares = res;
        return vaultContract.getRefPriceForNumShares.call(wantedShares)
      })
      .then(res => {
        console.log(res);
        reqVal = res;
        return etherTokenContract.approve(
          subscribeContract.address, reqVal, {from: INVESTOR}
        )
      })
      .then(() => subscribeContract.createSharesWithReferenceAsset(
        vaultContract.address, wantedShares, reqVal, {from: INVESTOR}
      ))
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res.toNumber(), wantedShares.plus(origShares)))
    })

    it('Creates shares when investment greater than portfolio funds', () => {
      let reqVal;
      let origShares;
      const wantedShares = new BigNumber(3e+18);
      return vaultContract.balanceOf.call(INVESTOR)
      .then(res => {
        origShares = res;
        return vaultContract.getRefPriceForNumShares.call(wantedShares)
      })
      .then(res => {
        console.log(res);
        reqVal = res;
        return etherTokenContract.approve(
          subscribeContract.address, reqVal, {from: INVESTOR}
        )
      })
      .then(() => subscribeContract.createSharesWithReferenceAsset(
        vaultContract.address, wantedShares, reqVal, {from: INVESTOR}
      ))
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res.toNumber(), wantedShares.plus(origShares)))
    })

    it('Creates shares when investment less than portfolio funds', () => {
      let reqVal;
      let origShares;
      const wantedShares = new BigNumber(1e+18);
      return vaultContract.balanceOf.call(INVESTOR)
      .then(res => {
        origShares = res;
        return vaultContract.getRefPriceForNumShares.call(wantedShares)
      })
      .then(res => {
        reqVal = res;
        return etherTokenContract.approve(
          subscribeContract.address, reqVal, {from: INVESTOR}
        )
      })
      .then(() => subscribeContract.createSharesWithReferenceAsset(
        vaultContract.address, wantedShares, reqVal, {from: INVESTOR}
      ))
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res.toNumber(), wantedShares.plus(origShares)))
    })

    it('Annihilates shares when only ETH invested, and returns assets', () => {
      let redeemShares;
      const originalAmt = web3.toWei(10, 'ether');  // all of the token
      return vaultContract.balanceOf.call(INVESTOR) // all the shares
      .then(res => {
        redeemShares = res;
        return redeemContract.redeemShares(vaultContract.address, redeemShares, {from: INVESTOR})
      })
      .then(() => vaultContract.balanceOf(INVESTOR))
      .then(res => assert.equal(res, 0))
      .then(() => etherTokenContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res.toNumber(), originalAmt));
    })

    it('Creates shares when there are two assets in portfolio', () => {
      const wantedShares = new BigNumber(2e+17);
      const offeredValue = new BigNumber(2e+17);
      const mlnAmt = 10000;
      const ethAmt = 20000;
      let refPrice;
      let ownedShares;
      return vaultContract.balanceOf.call(INVESTOR)
      .then(res => {
        ownedShares = res;
        return vaultContract.getRefPriceForNumShares.call(wantedShares)
      })
      .then(res => {
        refPrice = res;
        return etherTokenContract.approve(
          subscribeContract.address, refPrice, {from: INVESTOR}
        )
      })
      .then(() => subscribeContract.createSharesWithReferenceAsset(
        vaultContract.address, wantedShares, refPrice, {from: INVESTOR}
      ))
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => {
        ownedShares = ownedShares.plus(wantedShares);
        assert.equal(res.toNumber(), ownedShares);
      })
      .then(() => melonTokenContract.approve(exchangeContract.address, mlnAmt, {from: OWNER}))
      .then(() => exchangeContract.make(
        mlnAmt, melonTokenContract.address, ethAmt, etherTokenContract.address, {from: OWNER}
      ))
      .then(() => melonTokenContract.transfer(subscribeContract.address, mlnAmt, {from:OWNER}))
      .then(() => vaultContract.takeOrder(exchangeContract.address, 1, mlnAmt))
      .then(success => {
        assert(success);  // trade occurred
        return melonTokenContract.balanceOf.call(vaultContract.address);
      })
      .then(mlnBalance => assert.equal(mlnBalance, mlnAmt))
      .then(() => vaultContract.getRefPriceForNumShares.call(wantedShares))
      .then(res => refPrice = res)
      .then(() => etherTokenContract.approve(
        subscribeContract.address, refPrice, {from: INVESTOR}
      ))
      .then(() => {
        return subscribeContract.createSharesWithReferenceAsset(
          vaultContract.address, wantedShares, refPrice, {from: INVESTOR}
       )
      })
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => {
        ownedShares = ownedShares.plus(wantedShares);
        assert.equal(res.toNumber(), ownedShares.toNumber());
      })
    })

    it('Redeems shares for ref asset when two assets in portfolio', () => {
      const ethAmt = new BigNumber(1e+18);  // eth to start redeem contract with
      let initialBal; // initial ref balance of investor
      let redeemShares;
      let investorShareVal;
      return etherTokenContract.transfer(redeemContract.address, ethAmt, {from:OWNER})
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => redeemShares = res)
      .then(() => etherTokenContract.balanceOf.call(INVESTOR))
      .then(res => initialBal = res)
      .then(() => vaultContract.getRefPriceForNumShares.call(redeemShares))
      .then(res => investorShareVal = res)
      .then(() => vaultContract.approve(redeemContract.address, redeemShares, {from: INVESTOR}))
      .then(() => redeemContract.redeemSharesForReferenceAsset(vaultContract.address, redeemShares, {from: INVESTOR}))
      .then(() => vaultContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res, 0))  // no shares left
      .then(() => etherTokenContract.balanceOf.call(INVESTOR))
      .then(res => assert.equal(res.toNumber(), investorShareVal.plus(initialBal))) // refAsset returned
    })
  });
});
});
