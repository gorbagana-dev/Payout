import { PublicKey, Keypair } from '@solana/web3.js';
import { TestUtils } from './utils';

describe('SPL Token 2022 - Transfer Operations', () => {
  let testUtils: TestUtils;
  let mintAddress: PublicKey;
  let sourceAccount: PublicKey;
  let destinationAccount: PublicKey;
  let sourceOwner: Keypair;
  let destinationOwner: Keypair;

  beforeAll(async () => {
    testUtils = new TestUtils();
    await testUtils.initialize();
    
    // Create mint
    const result = await testUtils.createMint();
    mintAddress = result.mintAddress;
    
    // Create owners
    sourceOwner = testUtils.payer;
    destinationOwner = testUtils.generateKeypair();
    await testUtils.fundAccount(destinationOwner.publicKey);
    
    // Create token accounts
    sourceAccount = await testUtils.createATokenAccount(mintAddress, sourceOwner.publicKey);
    destinationAccount = await testUtils.createATokenAccount(mintAddress, destinationOwner.publicKey);
    
    // Mint initial tokens to source account
    await testUtils.mintTo(mintAddress, sourceAccount, 10000n);
  });

  describe('Basic Transfers', () => {
    it('should transfer tokens between accounts', async () => {
      const transferAmount = 1000n;
      
      // Check initial balances
      let sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      let destInfo = await testUtils.getTokenAccount(destinationAccount);
      const initialSourceBalance = sourceInfo.amount;
      const initialDestBalance = destInfo.amount;
      
      // Transfer tokens
      const signature = await testUtils.transfer(
        mintAddress,
        sourceAccount,
        destinationAccount,
        transferAmount,
        sourceOwner
      );
      expect(signature).toBeTruthy();
      
      // Check updated balances
      sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      destInfo = await testUtils.getTokenAccount(destinationAccount);
      
      expect(sourceInfo.amount).toBe(initialSourceBalance - transferAmount);
      expect(destInfo.amount).toBe(initialDestBalance + transferAmount);
    });

    it('should transfer partial balance', async () => {
      const transferAmount = 500n;
      
      let sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      const initialBalance = sourceInfo.amount;
      expect(initialBalance).toBeGreaterThan(transferAmount);
      
      await testUtils.transfer(
        mintAddress,
        sourceAccount,
        destinationAccount,
        transferAmount,
        sourceOwner
      );
      
      sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      expect(sourceInfo.amount).toBe(initialBalance - transferAmount);
    });

    it('should transfer entire balance', async () => {
      // Create a new account with a specific amount
      const newAccount = await testUtils.createATokenAccount(mintAddress);
      const entireAmount = 2000n;
      await testUtils.mintTo(mintAddress, newAccount, entireAmount);
      
      let accountInfo = await testUtils.getTokenAccount(newAccount);
      expect(accountInfo.amount).toBe(entireAmount);
      
      // Transfer entire balance
      await testUtils.transfer(
        mintAddress,
        newAccount,
        destinationAccount,
        entireAmount,
        sourceOwner
      );
      
      accountInfo = await testUtils.getTokenAccount(newAccount);
      expect(accountInfo.amount).toBe(0n);
    });

    it('should handle zero amount transfer', async () => {
      let sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      let destInfo = await testUtils.getTokenAccount(destinationAccount);
      const initialSourceBalance = sourceInfo.amount;
      const initialDestBalance = destInfo.amount;
      
      // Transfer zero tokens (should succeed but change nothing)
      await testUtils.transfer(
        mintAddress,
        sourceAccount,
        destinationAccount,
        0n,
        sourceOwner
      );
      
      sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      destInfo = await testUtils.getTokenAccount(destinationAccount);
      
      expect(sourceInfo.amount).toBe(initialSourceBalance);
      expect(destInfo.amount).toBe(initialDestBalance);
    });
  });

  describe('Transfer Validations', () => {
    it('should fail to transfer more than available balance', async () => {
      const sourceInfo = await testUtils.getTokenAccount(sourceAccount);
      const excessiveAmount = sourceInfo.amount + 1n;
      
      await expect(
        testUtils.transfer(
          mintAddress,
          sourceAccount,
          destinationAccount,
          excessiveAmount,
          sourceOwner
        )
      ).rejects.toThrow();
    });

    it('should fail to transfer with wrong owner', async () => {
      const wrongOwner = testUtils.generateKeypair();
      await testUtils.fundAccount(wrongOwner.publicKey);
      
      await expect(
        testUtils.transfer(
          mintAddress,
          sourceAccount,
          destinationAccount,
          100n,
          wrongOwner
        )
      ).rejects.toThrow();
    });

    it('should fail to transfer from non-existent account', async () => {
      const nonExistentAccount = testUtils.generateKeypair().publicKey;
      
      await expect(
        testUtils.transfer(
          mintAddress,
          nonExistentAccount,
          destinationAccount,
          100n,
          sourceOwner
        )
      ).rejects.toThrow();
    });

    it('should fail to transfer to non-existent account', async () => {
      const nonExistentAccount = testUtils.generateKeypair().publicKey;
      
      await expect(
        testUtils.transfer(
          mintAddress,
          sourceAccount,
          nonExistentAccount,
          100n,
          sourceOwner
        )
      ).rejects.toThrow();
    });

    it('should fail to transfer between accounts of different mints', async () => {
      // Create a different mint and account
      const { mintAddress: differentMint } = await testUtils.createMint();
      const differentMintAccount = await testUtils.createATokenAccount(differentMint);
      
      await expect(
        testUtils.transfer(
          mintAddress,
          sourceAccount,
          differentMintAccount,
          100n,
          sourceOwner
        )
      ).rejects.toThrow();
    });
  });

  describe('Multiple Transfer Scenarios', () => {
    it('should handle multiple sequential transfers', async () => {
      const account1 = await testUtils.createATokenAccount(mintAddress);
      const account2 = await testUtils.createATokenAccount(mintAddress);
      const account3 = await testUtils.createATokenAccount(mintAddress);
      
      // Initial mint to account1
      const initialAmount = 3000n;
      await testUtils.mintTo(mintAddress, account1, initialAmount);
      
      // Transfer chain: account1 -> account2 -> account3
      const firstTransfer = 1000n;
      const secondTransfer = 500n;
      
      await testUtils.transfer(mintAddress, account1, account2, firstTransfer);
      await testUtils.transfer(mintAddress, account2, account3, secondTransfer);
      
      // Check final balances
      const account1Info = await testUtils.getTokenAccount(account1);
      const account2Info = await testUtils.getTokenAccount(account2);
      const account3Info = await testUtils.getTokenAccount(account3);
      
      expect(account1Info.amount).toBe(initialAmount - firstTransfer);
      expect(account2Info.amount).toBe(firstTransfer - secondTransfer);
      expect(account3Info.amount).toBe(secondTransfer);
    });

    it('should handle circular transfers', async () => {
      const account1 = await testUtils.createATokenAccount(mintAddress);
      const account2 = await testUtils.createATokenAccount(mintAddress);
      
      // Mint to both accounts
      await testUtils.mintTo(mintAddress, account1, 1000n);
      await testUtils.mintTo(mintAddress, account2, 500n);
      
      const transferAmount = 200n;
      
      // Get initial balances
      let account1Info = await testUtils.getTokenAccount(account1);
      let account2Info = await testUtils.getTokenAccount(account2);
      const initialBalance1 = account1Info.amount;
      const initialBalance2 = account2Info.amount;
      
      // Transfer from account1 to account2
      await testUtils.transfer(mintAddress, account1, account2, transferAmount);
      
      // Transfer from account2 back to account1
      await testUtils.transfer(mintAddress, account2, account1, transferAmount);
      
      // Check balances are back to initial state
      account1Info = await testUtils.getTokenAccount(account1);
      account2Info = await testUtils.getTokenAccount(account2);
      
      expect(account1Info.amount).toBe(initialBalance1);
      expect(account2Info.amount).toBe(initialBalance2);
    });

    it('should maintain total supply during transfers', async () => {
      const account1 = await testUtils.createATokenAccount(mintAddress);
      const account2 = await testUtils.createATokenAccount(mintAddress);
      const account3 = await testUtils.createATokenAccount(mintAddress);
      
      // Mint tokens
      const mintAmount = 5000n;
      await testUtils.mintTo(mintAddress, account1, mintAmount);
      
      // Check initial supply
      let mintInfo = await testUtils.getMintInfo(mintAddress);
      const initialSupply = mintInfo.supply;
      
      // Perform multiple transfers
      await testUtils.transfer(mintAddress, account1, account2, 2000n);
      await testUtils.transfer(mintAddress, account2, account3, 1000n);
      await testUtils.transfer(mintAddress, account1, account3, 500n);
      
      // Check that total supply remains unchanged
      mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.supply).toBe(initialSupply);
      
      // Verify total balances add up correctly
      const account1Info = await testUtils.getTokenAccount(account1);
      const account2Info = await testUtils.getTokenAccount(account2);
      const account3Info = await testUtils.getTokenAccount(account3);
      
      const totalInAccounts = account1Info.amount + account2Info.amount + account3Info.amount;
      expect(totalInAccounts).toBe(mintAmount);
    });
  });

  describe('Self-Transfer', () => {
    it('should handle transfer to same account', async () => {
      const account = await testUtils.createATokenAccount(mintAddress);
      await testUtils.mintTo(mintAddress, account, 1000n);
      
      const initialInfo = await testUtils.getTokenAccount(account);
      const initialBalance = initialInfo.amount;
      
      // Transfer to self
      await testUtils.transfer(mintAddress, account, account, 100n);
      
      // Balance should remain the same
      const finalInfo = await testUtils.getTokenAccount(account);
      expect(finalInfo.amount).toBe(initialBalance);
    });
  });
});
