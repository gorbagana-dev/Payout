import { PublicKey } from '@solana/web3.js';
import { TestUtils } from './utils';
import type { TokenMetadata } from '@solana/spl-token-metadata';

// TO-TEST
// 1. Create a mint with default parameters i.e. decimals = 6, mintAuthority = payer, freezeAuthority = payer
// 2. Create a mint with custom decimals i.e. decimals = 9
// 3. Create a mint with custom mint authority
// 4. Create a mint with null freeze authority
// 5. Create multiple unique mints
// 6. Retrieve correct mint information
// 7. Handle invalid mint address
// 8. Create a mint with metadata extension
// 9. Initialize metadata with name, symbol, and URI

describe('SPL Token 2022 - Mint Operations', () => {
  let testUtils: TestUtils;

  beforeAll(async () => {
    testUtils = new TestUtils();
    await testUtils.initialize();
  });

  describe('Mint Creation', () => {
    it('should create a new mint with default parameters', async () => {
      const { mint, mintAddress } = await testUtils.createMint();
      
      expect(PublicKey.isOnCurve(mintAddress.toBytes())).toBe(true);
      expect(mint.publicKey.toBase58()).toBe(mintAddress.toBase58());
      
      const mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.decimals).toBe(6);
      expect(mintInfo.supply).toBe(0n);
      expect(mintInfo.mintAuthority?.toBase58()).toBe(testUtils.payer.publicKey.toBase58());
      expect(mintInfo.freezeAuthority?.toBase58()).toBe(testUtils.payer.publicKey.toBase58());
    });

    it('should create a mint with custom decimals', async () => {
      const decimals = 9;
      const { mintAddress } = await testUtils.createMint(decimals);
      
      const mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.decimals).toBe(decimals);
    });

    it('should create a mint with custom mint authority', async () => {
      const customAuthority = testUtils.generateKeypair();
      const { mintAddress } = await testUtils.createMint(6, customAuthority.publicKey);
      
      const mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.mintAuthority?.toBase58()).toBe(customAuthority.publicKey.toBase58());
    });

    it('should create a mint with null freeze authority', async () => {
      const { mintAddress } = await testUtils.createMint(6, undefined, null);
      
      const mintInfo = await testUtils.getMintInfo(mintAddress);
      expect(mintInfo.freezeAuthority).toBeNull();
    });

    it('should create multiple unique mints', async () => {
      const { mintAddress: mint1 } = await testUtils.createMint();
      const { mintAddress: mint2 } = await testUtils.createMint();
      
      expect(mint1.toBase58()).not.toBe(mint2.toBase58());
      
      const mint1Info = await testUtils.getMintInfo(mint1);
      const mint2Info = await testUtils.getMintInfo(mint2);
      
      expect(mint1Info.supply).toBe(0n);
      expect(mint2Info.supply).toBe(0n);
    });
  });

  describe('Mint Information Retrieval', () => {
    let mintAddress: PublicKey;

    beforeAll(async () => {
      const result = await testUtils.createMint(8);
      mintAddress = result.mintAddress;
    });

    it('should retrieve correct mint information', async () => {
      const mintInfo = await testUtils.getMintInfo(mintAddress);
      
      expect(mintInfo.address.toBase58()).toBe(mintAddress.toBase58());
      expect(mintInfo.decimals).toBe(8);
      expect(mintInfo.supply).toBe(0n);
      expect(mintInfo.isInitialized).toBe(true);
    });

    it('should handle invalid mint address', async () => {
      const invalidMint = testUtils.generateKeypair().publicKey;
      
      await expect(testUtils.getMintInfo(invalidMint)).rejects.toThrow();
    });
  });
});
