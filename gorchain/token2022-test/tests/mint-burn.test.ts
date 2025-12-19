import { PublicKey, Keypair } from '@solana/web3.js';
import { TestUtils } from './utils';

describe('SPL Token 2022 - Mint and Burn Operations', () => {
  let testUtils: TestUtils;
  let mintAddress: PublicKey;
  let tokenAccount: PublicKey;
  let mintAuthority: Keypair;

  beforeAll(async () => {
    testUtils = new TestUtils();
    await testUtils.initialize();
    
    mintAuthority = testUtils.payer;
    const result = await testUtils.createMint(6, mintAuthority.publicKey);
    mintAddress = result.mintAddress;
    tokenAccount = await testUtils.createATokenAccount(mintAddress);
  });

  describe('Minting Tokens', () => {
    it('should mint tokens to an account', async () => {
      const mintAmount = 1000n;
      
      // Check initial balances
      let accountInfo = await testUtils.getTokenAccount(tokenAccount);
      let mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(accountInfo.amount).toBe(0n);
      expect(mintInfo.supply).toBe(0n);
      
      // Mint tokens
      const signature = await testUtils.mintTo(mintAddress, tokenAccount, mintAmount, mintAuthority);
      expect(signature).toBeTruthy();
      
      // Check updated balances
      accountInfo = await testUtils.getTokenAccount(tokenAccount);
      mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(accountInfo.amount).toBe(mintAmount);
      expect(mintInfo.supply).toBe(mintAmount);
    });

    it('should mint additional tokens to existing balance', async () => {
      const initialAmount = 500n;
      const additionalAmount = 300n;
      const expectedTotal = initialAmount + additionalAmount;
      
      // Create fresh account and mint initial amount
      const newTokenAccount = await testUtils.createATokenAccount(mintAddress);
      await testUtils.mintTo(mintAddress, newTokenAccount, initialAmount, mintAuthority);
      
      let accountInfo = await testUtils.getTokenAccount(newTokenAccount);
      expect(accountInfo.amount).toBe(initialAmount);
      
      // Mint additional tokens
      await testUtils.mintTo(mintAddress, newTokenAccount, additionalAmount, mintAuthority);
      
      accountInfo = await testUtils.getTokenAccount(newTokenAccount);
      expect(accountInfo.amount).toBe(expectedTotal);
    });

    it('should mint large amounts without overflow', async () => {
      const largeAmount = 1000000000n; // 1 billion tokens
      const newTokenAccount = await testUtils.createATokenAccount(mintAddress);
      
      await testUtils.mintTo(mintAddress, newTokenAccount, largeAmount, mintAuthority);
      
      const accountInfo = await testUtils.getTokenAccount(newTokenAccount);
      expect(accountInfo.amount).toBe(largeAmount);
    });

    it('should fail to mint with wrong authority', async () => {
      const wrongAuthority = testUtils.generateKeypair();
      await testUtils.fundAccount(wrongAuthority.publicKey);
      
      const newTokenAccount = await testUtils.createATokenAccount(mintAddress);
      
      await expect(
        testUtils.mintTo(mintAddress, newTokenAccount, 100n, wrongAuthority)
      ).rejects.toThrow();
    });

    it('should mint to multiple accounts', async () => {
      const account1 = await testUtils.createATokenAccount(mintAddress);
      const account2 = await testUtils.createATokenAccount(mintAddress);
      const mintAmount = 500n;
      
      await testUtils.mintTo(mintAddress, account1, mintAmount, mintAuthority);
      await testUtils.mintTo(mintAddress, account2, mintAmount, mintAuthority);
      
      const account1Info = await testUtils.getTokenAccount(account1);
      const account2Info = await testUtils.getTokenAccount(account2);
      const mintInfo = await testUtils.getMintInfo(mintAddress);
      
      expect(account1Info.amount).toBe(mintAmount);
      expect(account2Info.amount).toBe(mintAmount);
      expect(mintInfo.supply).toBeGreaterThanOrEqual(mintAmount * 2n);
    });
  });

  describe('Burning Tokens', () => {
    let burnTestAccount: PublicKey;
    const initialMintAmount = 2000n;

    beforeEach(async () => {
      burnTestAccount = await testUtils.createATokenAccount(mintAddress);
      await testUtils.mintTo(mintAddress, burnTestAccount, initialMintAmount, mintAuthority);
    });

    it('should burn tokens from an account', async () => {
      const burnAmount = 500n;
      const expectedRemaining = initialMintAmount - burnAmount;
      
      // Check initial balance
      let accountInfo = await testUtils.getTokenAccount(burnTestAccount);
      let mintInfo = await testUtils.getMintInfo(mintAddress);
      const initialSupply = mintInfo.supply;
      expect(accountInfo.amount).toBe(initialMintAmount);
      
      // Burn tokens
      const signature = await testUtils.burn(mintAddress, burnTestAccount, burnAmount);
      expect(signature).toBeTruthy();
      
      // Check updated balances
      accountInfo = await testUtils.getTokenAccount(burnTestAccount);
      mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(accountInfo.amount).toBe(expectedRemaining);
      expect(mintInfo.supply).toBe(initialSupply - burnAmount);
    });

    it('should burn all tokens from an account', async () => {
      // Check initial balance
      let accountInfo = await testUtils.getTokenAccount(burnTestAccount);
      let mintInfo = await testUtils.getMintInfo(mintAddress);
      const initialSupply = mintInfo.supply;
      expect(accountInfo.amount).toBe(initialMintAmount);
      
      // Burn all tokens
      await testUtils.burn(mintAddress, burnTestAccount, initialMintAmount);
      
      // Check updated balances
      accountInfo = await testUtils.getTokenAccount(burnTestAccount);
      mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(accountInfo.amount).toBe(0n);
      expect(mintInfo.supply).toBe(initialSupply - initialMintAmount);
    });

    it('should fail to burn more tokens than available', async () => {
      const excessiveAmount = initialMintAmount + 1n;
      
      await expect(
        testUtils.burn(mintAddress, burnTestAccount, excessiveAmount)
      ).rejects.toThrow();
    });

    it('should fail to burn with wrong owner', async () => {
      const wrongOwner = testUtils.generateKeypair();
      await testUtils.fundAccount(wrongOwner.publicKey);
      
      await expect(
        testUtils.burn(mintAddress, burnTestAccount, 100n, wrongOwner)
      ).rejects.toThrow();
    });

    it('should burn from account with zero balance (should fail)', async () => {
      const emptyAccount = await testUtils.createATokenAccount(mintAddress);
      
      await expect(
        testUtils.burn(mintAddress, emptyAccount, 1n)
      ).rejects.toThrow();
    });
  });

  describe('Mint and Burn Integration', () => {
    it('should handle multiple mint and burn operations', async () => {
      const testAccount = await testUtils.createATokenAccount(mintAddress);
      
      // Mint 1000 tokens
      await testUtils.mintTo(mintAddress, testAccount, 1000n, mintAuthority);
      let accountInfo = await testUtils.getTokenAccount(testAccount);
      expect(accountInfo.amount).toBe(1000n);
      
      // Burn 300 tokens
      await testUtils.burn(mintAddress, testAccount, 300n);
      accountInfo = await testUtils.getTokenAccount(testAccount);
      expect(accountInfo.amount).toBe(700n);
      
      // Mint 500 more tokens
      await testUtils.mintTo(mintAddress, testAccount, 500n, mintAuthority);
      accountInfo = await testUtils.getTokenAccount(testAccount);
      expect(accountInfo.amount).toBe(1200n);
      
      // Burn all remaining tokens
      await testUtils.burn(mintAddress, testAccount, 1200n);
      accountInfo = await testUtils.getTokenAccount(testAccount);
      expect(accountInfo.amount).toBe(0n);
    });

    it('should maintain correct total supply across operations', async () => {
      const account1 = await testUtils.createATokenAccount(mintAddress);
      const account2 = await testUtils.createATokenAccount(mintAddress);
      
      const initialMintInfo = await testUtils.getMintInfo(mintAddress);
      const initialSupply = initialMintInfo.supply;
      
      // Mint to both accounts
      await testUtils.mintTo(mintAddress, account1, 1000n, mintAuthority);
      await testUtils.mintTo(mintAddress, account2, 500n, mintAuthority);
      
      let mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.supply).toBe(initialSupply + 1500n);
      
      // Burn from first account
      await testUtils.burn(mintAddress, account1, 300n);
      
      mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.supply).toBe(initialSupply + 1200n);
      
      // Burn from second account
      await testUtils.burn(mintAddress, account2, 200n);
      
      mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.supply).toBe(initialSupply + 1000n);
    });
  });
});
