import { PublicKey } from '@solana/web3.js';
import { TestUtils } from './utils';

// TO-TEST
// 1. Create an ATA for the payer i.e ATA should be off curve
// 2. Create an ATA for a different owner
// 3. Create multiple ATAs for the same mint
// 4. Retrieve correct ATA information
// 5. Handle invalid ATA address
// 6. Reflect balance changes after minting

describe('SPL Token 2022 - ATA Operations', () => {
  let testUtils: TestUtils;
  let mintAddress: PublicKey;

  // Before all create mint
  beforeAll(async () => {
    testUtils = new TestUtils();
    await testUtils.initialize();
    
    const result = await testUtils.createMint();
    mintAddress = result.mintAddress;
  });

  describe('ATA Creation', () => {
    it('should create an associated token account (ATA)', async () => {
      const ata = await testUtils.createATokenAccount(mintAddress);
      
      expect(PublicKey.isOnCurve(ata.toBytes())).toBe(false);
      
      const ataInfo = await testUtils.getTokenAccount(ata);
      expect(ataInfo.mint.toBase58()).toBe(mintAddress.toBase58());
      expect(ataInfo.owner.toBase58()).toBe(testUtils.payer.publicKey.toBase58());
      expect(ataInfo.amount).toBe(0n);
      expect(ataInfo.isInitialized).toBe(true);
      expect(ataInfo.isFrozen).toBe(false);
    });

    it('should create ATA for different owner', async () => {
      const owner = testUtils.generateKeypair();
      await testUtils.fundAccount(owner.publicKey);
      
      const ata = await testUtils.createATokenAccount(mintAddress, owner.publicKey);
      
      const ataInfo = await testUtils.getTokenAccount(ata);
      expect(ataInfo.owner.toBase58()).toBe(owner.publicKey.toBase58());
      expect(ataInfo.mint.toBase58()).toBe(mintAddress.toBase58());
    });

    it('should create multiple ATAs for same mint', async () => {
      const owner1 = testUtils.generateKeypair();
      const owner2 = testUtils.generateKeypair();
      
      await testUtils.fundAccount(owner1.publicKey);
      await testUtils.fundAccount(owner2.publicKey);
      
      const ata1 = await testUtils.createATokenAccount(mintAddress, owner1.publicKey);
      const ata2 = await testUtils.createATokenAccount(mintAddress, owner2.publicKey);
      
      expect(ata1.toBase58()).not.toBe(ata2.toBase58());
      
      const ata1Info = await testUtils.getTokenAccount(ata1);
      const ata2Info = await testUtils.getTokenAccount(ata2);
      
      expect(ata1Info.owner.toBase58()).toBe(owner1.publicKey.toBase58());
      expect(ata2Info.owner.toBase58()).toBe(owner2.publicKey.toBase58());
    });
  
  });

  describe('ATA Information Retrieval', () => {
    let ata: PublicKey;

    beforeAll(async () => {
      ata = await testUtils.createATokenAccount(mintAddress);
    });

    it('should retrieve correct ATA information', async () => {
      const ataInfo = await testUtils.getTokenAccount(ata);
      
      expect(ataInfo.address.toBase58()).toBe(ata.toBase58());
      expect(ataInfo.mint.toBase58()).toBe(mintAddress.toBase58());
      expect(ataInfo.owner.toBase58()).toBe(testUtils.payer.publicKey.toBase58());
      expect(ataInfo.amount).toBe(0n);
      expect(ataInfo.isInitialized).toBe(true);
      expect(ataInfo.isFrozen).toBe(false);
    });

    it('should handle invalid ATA address', async () => {
      const invalidAccount = testUtils.generateKeypair().publicKey;
      
      await expect(testUtils.getTokenAccount(invalidAccount)).rejects.toThrow();
    });
  });

  describe('ATA State Management', () => {
    it('should reflect balance changes after minting', async () => {
      const ata = await testUtils.createATokenAccount(mintAddress);
      const mintAmount = 1000n;
      
      // Check initial balance
      let ataInfo = await testUtils.getTokenAccount(ata);
      expect(ataInfo.amount).toBe(0n);
      
      // Mint tokens
      await testUtils.mintTo(mintAddress, ata, mintAmount);
      
      // Check updated balance
      ataInfo = await testUtils.getTokenAccount(ata);
      expect(ataInfo.amount).toBe(mintAmount);
    });
  });
});
