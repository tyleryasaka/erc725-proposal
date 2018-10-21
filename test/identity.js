var Identity = artifacts.require('Identity')
var Counter = artifacts.require('Counter')
var IdentityManager = artifacts.require('IdentityManager')
var IdentityRegistry = artifacts.require('IdentityRegistry')
var ClaimRegistry780 = artifacts.require('ClaimRegistry780')
var IdentityFactory = artifacts.require('IdentityFactory')
var Web3 = require('web3')

const claimKey = '0x0000000000000000000000000000000000000000000000000000000000000000'
const claimValue = '0x0000000000000000000000000000000000000000000000000000000000000123'
const delegateType = '0x0000000000000000000000000000000000000000000000000000000000000abc'
const web3 = new Web3(Web3.givenProvider)

const getEncodedCall = (web3, instance, method, params = []) => {
  const contract = new web3.eth.Contract(instance.abi)
  return contract.methods[method](...params).encodeABI()
}

const sign = async (params, account) => {
  const signatureData = web3.utils.soliditySha3(...params)
  return await web3.eth.sign(signatureData, account)
}

contract('Identity', function(accounts) {
  it('should allow the owner to call execute', async function() {
    // Deploy contracts
    const identity = await Identity.new(accounts[0])
    const counter = await Counter.new()
    const identityRegistry = await IdentityRegistry.new()

    // Counter should be 0 initially
    assert.equal((await counter.get()).toString(), '0')

    // Call counter.increment from identity
    const encodedCall = getEncodedCall(web3, counter, 'increment')
    const result = await identity.execute(counter.address, 0, encodedCall, { from: accounts[0] })

    // Check that increment was called
    assert.equal((await counter.get()).toString(), '1')
  })

  it('should be able to integrate with identity manager', async function() {
    // Deploy contracts
    const identity = await Identity.new(accounts[0])
    const counter = await Counter.new()

    // Counter should be 0 initially
    assert.equal((await counter.get()).toString(), '0')

    // Transfer identity ownership to the key manager
    const identityManager = await IdentityManager.new(identity.address, accounts[1], { from: accounts[1] })
    await identity.transferOwnership(identityManager.address)

    // Call counter.increment from identity, through identity manager
    const encodedCall = getEncodedCall(web3, counter, 'increment')
    const result = await identityManager.execute(counter.address, 0, encodedCall, { from: accounts[1] })

    // Check that increment was called
    assert.equal((await counter.get()).toString(), '1')
  })

  it('should own itself via ERC1056', async function() {
    // Deploy contracts
    const identity = await Identity.new(accounts[0])
    const identityRegistry = await IdentityRegistry.new()

    // Check that identity owns itself via ERC1056
    const identityOwner = await identityRegistry.identityOwner(identity.address)
    assert.equal(identityOwner, identity.address)
  })

  it('should be able to make a claim via ERC780', async function() {
    // Deploy contracts
    const identity = await Identity.new(accounts[0])
    const claimRegistry780 = await ClaimRegistry780.new()

    // Call setClaim using identity
    const subject = accounts[1]
    const encodedCall = getEncodedCall(web3, claimRegistry780, 'setClaim', [subject, claimKey, claimValue])
    const result = await identity.execute(claimRegistry780.address, 0, encodedCall)

    // Check that claim was recorded
    const claim = await claimRegistry780.getClaim(identity.address, subject, claimKey)
    assert.equal(claim, claimValue)
  })

  describe('gas cost comparison', async function() {
    let identity, identityWithManager, counter, identityManager

    beforeEach(async function() {
      identity = await Identity.new(accounts[0])
      identityWithManager = await Identity.new(accounts[0])
      counter = await Counter.new()
      identityManager = await IdentityManager.new(identityWithManager.address, accounts[1], { from: accounts[1] })
      await identityWithManager.transferOwnership(identityManager.address)
    })

    it('without identity or manager', async function() {
      // Call counter.increment
      await counter.increment()

      // Check that increment was called
      assert.equal((await counter.get()).toString(), '1')
    })

    it('with identity, without manager', async function() {
      // Call counter.increment from identity
      const encodedCall = getEncodedCall(web3, counter, 'increment')
      await identity.execute(counter.address, 0, encodedCall)

      // Check that increment was called
      assert.equal((await counter.get()).toString(), '1')
    })

    it('with identity and manager', async function() {
      // Call counter.increment from identity, through identity manager
      const encodedCall = getEncodedCall(web3, counter, 'increment')
      await identityManager.execute(counter.address, 0, encodedCall, { from: accounts[1] })

      // Check that increment was called
      assert.equal((await counter.get()).toString(), '1')
    })
  })
})

contract('IdentityManager', function(accounts) {
  it('should be able to add and remove roles', async function() {
    const identity = await Identity.new(accounts[0])
    const identityManager = await IdentityManager.new(identity.address, accounts[0])
    const actionRole = 2
    const emptyRole = 0

    // add role
    await identityManager.addRole(accounts[1], actionRole)

    // check that role was added
    let hasRole = await identityManager.hasRole(accounts[1], actionRole)
    assert.equal(hasRole, true)

    // remove role
    await identityManager.removeRole(accounts[1])

    // check that role was removed
    hasRole = await identityManager.hasRole(accounts[1], actionRole)
    assert.equal(hasRole, false)
  })

  it('should allow execution for action roles', async function() {
    const identity = await Identity.new(accounts[0])
    const identityManager = await IdentityManager.new(identity.address, accounts[0])
    const counter = await Counter.new()
    const actionRole = 2
    await identity.transferOwnership(identityManager.address)

    // add role
    await identityManager.addRole(accounts[1], actionRole)

    // execute counter
    const encodedCall = getEncodedCall(web3, counter, 'increment')
    await identityManager.execute(counter.address, 0, encodedCall, { from: accounts[1] })
    assert.equal((await counter.get()).toString(), '1')

    // execute counter, signed
    let nonce = Number(await identityManager.getNonce(counter.address, 0, encodedCall))
    let signature = await sign([identityManager.address, counter.address, 0, encodedCall, nonce], accounts[1])
    await identityManager.executeSigned(counter.address, 0, encodedCall, signature, { from: accounts[2] })
    assert.equal((await counter.get()).toString(), '2')

    // remove role
    await identityManager.removeRole(accounts[1])

    // execute counter should fail
    try {
      await identityManager.execute(counter.address, 0, encodedCall, { from: accounts[1] })
      throw null;
    } catch (error) {
      assert.include(String(error), 'VM Exception')
    }

    // execute counter, signed should fail
    nonce = Number(await identityManager.getNonce(counter.address, 0, encodedCall))
    assert.equal(nonce, 1)
    try {
      signature = await sign([identityManager.address, counter.address, 0, encodedCall, nonce], accounts[1])
      await identityManager.executeSigned(counter.address, 0, encodedCall, signature, { from: accounts[2] })
      throw null;
    } catch (error) {
      assert.include(String(error), 'VM Exception')
    }
  })

  it('should not allow replay attacks', async function() {
    const identity = await Identity.new(accounts[0])
    const identityManager = await IdentityManager.new(identity.address, accounts[0])
    const counter = await Counter.new()
    const actionRole = 2
    await identity.transferOwnership(identityManager.address)

    // add role
    await identityManager.addRole(accounts[1], actionRole)

    // execute counter, signed
    const encodedCall = getEncodedCall(web3, counter, 'increment')
    let nonce = 0
    signature = await sign([identityManager.address, counter.address, 0, encodedCall, nonce], accounts[1])
    await identityManager.executeSigned(counter.address, 0, encodedCall, signature, { from: accounts[2] })
    assert.equal((await counter.get()).toString(), '1')

    // replay attack should fail
    try {
      await identityManager.executeSigned(counter.address, 0, encodedCall, signature, { from: accounts[3] })
      throw null;
    } catch (error) {
      assert.include(String(error), 'VM Exception')
    }
  })

  it('should be able to be deployed with identity in one transaction', async function() {
    // Deploy contracts
    const counter = await Counter.new()
    const identityFactory = await IdentityFactory.new()

    // Create identity and manager with factory
    const result = await identityFactory.createIdentityWithManager()
    assert.equal(result.logs.length, 1)
    const { identity, manager } = result.logs[0].args
    assert.ok(identity)
    assert.ok(manager)

    // Test new contracts
    const identityManager = IdentityManager.at(manager)
    const encodedCall = getEncodedCall(web3, counter, 'increment')
    await identityManager.execute(counter.address, 0, encodedCall)
    assert.equal((await counter.get()).toString(), '1')
  })
})
