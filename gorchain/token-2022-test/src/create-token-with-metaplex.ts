import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMintLen,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  createV1,
  createFungible,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  keypairIdentity,
  percentAmount,
  generateSigner,
} from "@metaplex-foundation/umi";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import * as fs from "fs";
import * as path from "path";

// Configuration - use HTTPS endpoint with proper SSL
const VALIDATOR_URL = "https://rpc.gorbagana.wtf";
const WALLET_PATH = "../../dev-wallet.json";

// Token configuration
const TOKEN_NAME = "RadBro Token";
const TOKEN_SYMBOL = "RADBRO";
const TOKEN_DECIMALS = 6;
const TOKEN_URI =
  "https://gateway.pinata.cloud/ipfs/QmQTD7wgoEbWjTfAsSNzEfaVETq9wHZYDcAamv1uaSnpiZ"; // Proper hosted metadata on IPFS
const INITIAL_SUPPLY = 1000000; // 1 million tokens

interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
}

class MetaplexTokenCreator {
  private connection: Connection;
  private payer: Keypair;
  private umi: any;

  constructor() {
    // Initialize connection without WebSocket to avoid 405 errors
    this.connection = new Connection(VALIDATOR_URL, {
      commitment: "confirmed",
      wsEndpoint: undefined,
    });

    // Load payer keypair
    const walletPath = path.resolve(__dirname, WALLET_PATH);
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found at ${walletPath}`);
    }

    const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    this.payer = Keypair.fromSecretKey(new Uint8Array(walletData));

    console.log(`💼 Using wallet: ${this.payer.publicKey.toBase58()}`);

    // Initialize Umi for Metaplex operations (HTTP-only to avoid WebSocket 405 errors)
    // Use only the HTTP endpoint directly without creating a Connection object
    this.umi = createUmi(VALIDATOR_URL)
      .use(mplTokenMetadata())
      .use(keypairIdentity(fromWeb3JsKeypair(this.payer)));
  }

  async pollForConfirmation(
    signature: string,
    maxAttempts: number = 30
  ): Promise<void> {
    console.log(`🔄 Polling for confirmation of ${signature}...`);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        if (
          status?.value?.confirmationStatus === "confirmed" ||
          status?.value?.confirmationStatus === "finalized"
        ) {
          console.log(`✅ Transaction confirmed after ${attempt} attempts`);
          return;
        }
        if (status?.value?.err) {
          throw new Error(
            `Transaction failed: ${JSON.stringify(status.value.err)}`
          );
        }
        console.log(
          `⏳ Attempt ${attempt}/${maxAttempts} - Status: ${
            status?.value?.confirmationStatus || "pending"
          }`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(
            `Failed to confirm transaction after ${maxAttempts} attempts: ${error}`
          );
        }
        console.log(`⚠️  Attempt ${attempt} failed, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    throw new Error(
      `Transaction confirmation timeout after ${maxAttempts} attempts`
    );
  }

  async createTokenWithMetaplexOnly(): Promise<{
    mint: PublicKey;
    tokenAccount: PublicKey;
  }> {
    console.log(
      "🚀 Creating SPL Token with Metaplex (step-by-step approach)..."
    );

    // Generate mint signer using Umi
    const mintSigner = generateSigner(this.umi);
    console.log(`🎯 Mint address: ${mintSigner.publicKey}`);

    try {
      // Step 1: Create the mint account first using createV1
      console.log("📝 Step 1: Creating mint and metadata...");
      const result = await createV1(this.umi, {
        mint: mintSigner,
        authority: this.umi.identity,
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: TOKEN_URI,
        sellerFeeBasisPoints: percentAmount(0),
        tokenStandard: TokenStandard.Fungible,
        decimals: TOKEN_DECIMALS,
      }).sendAndConfirm(this.umi);

      console.log(
        `✅ Mint and metadata created! Signature: ${result.signature}`
      );

      // Convert back to web3.js types for token account creation
      const mint = new PublicKey(mintSigner.publicKey.toString());

      // Step 2: Create associated token account using web3.js
      console.log("📝 Step 2: Creating associated token account...");
      const tokenAccount = await getAssociatedTokenAddress(
        mint,
        this.payer.publicKey
      );

      const createTokenAccountTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          this.payer.publicKey, // payer
          tokenAccount, // associated token account
          this.payer.publicKey, // owner
          mint // mint
        )
      );

      const { blockhash } = await this.connection.getLatestBlockhash();
      createTokenAccountTx.recentBlockhash = blockhash;
      createTokenAccountTx.feePayer = this.payer.publicKey;
      createTokenAccountTx.sign(this.payer);

      const tokenAccountSignature = await this.connection.sendRawTransaction(
        createTokenAccountTx.serialize()
      );

      console.log(`📦 Token account signature: ${tokenAccountSignature}`);
      await this.pollForConfirmation(tokenAccountSignature);

      // Step 3: Mint initial supply
      console.log("📝 Step 3: Minting initial supply...");
      const mintToTx = new Transaction().add(
        createMintToInstruction(
          mint,
          tokenAccount,
          this.payer.publicKey,
          INITIAL_SUPPLY * Math.pow(10, TOKEN_DECIMALS)
        )
      );

      mintToTx.recentBlockhash = blockhash;
      mintToTx.feePayer = this.payer.publicKey;
      mintToTx.sign(this.payer);

      const mintToSignature = await this.connection.sendRawTransaction(
        mintToTx.serialize()
      );

      console.log(`🪙 Mint to signature: ${mintToSignature}`);
      await this.pollForConfirmation(mintToSignature);

      console.log(`✅ Token creation completed successfully!`);
      return { mint, tokenAccount };
    } catch (error) {
      console.error("❌ Failed to create token with Metaplex:", error);
      throw error;
    }
  }

  async createTokenWithMetadata(): Promise<{
    mint: PublicKey;
    tokenAccount: PublicKey;
    mintKeypair: Keypair;
  }> {
    console.log("🚀 Creating SPL Token with Metaplex metadata...");

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    console.log(`🎯 Mint address: ${mint.toBase58()}`);

    // Get associated token account
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      this.payer.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    console.log(`📦 Token account: ${tokenAccount.toBase58()}`);

    // Calculate required lamports for mint account
    const mintLamports = await getMinimumBalanceForRentExemptMint(
      this.connection
    );

    // Step 1: Create and initialize the mint account
    console.log("📝 Step 1: Creating mint account...");
    const mintTransaction = new Transaction().add(
      // Create mint account
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: mint,
        space: getMintLen([]),
        lamports: mintLamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      // Initialize mint
      createInitializeMintInstruction(
        mint,
        TOKEN_DECIMALS,
        this.payer.publicKey,
        this.payer.publicKey,
        TOKEN_PROGRAM_ID
      )
    );

    // Set recent blockhash
    const { blockhash } = await this.connection.getRecentBlockhash();
    mintTransaction.recentBlockhash = blockhash;
    mintTransaction.feePayer = this.payer.publicKey;

    mintTransaction.partialSign(mintKeypair, this.payer);
    const mintSignature = await this.connection.sendRawTransaction(
      mintTransaction.serialize(),
      { skipPreflight: false }
    );

    console.log(`📝 Mint transaction signature: ${mintSignature}`);
    await this.pollForConfirmation(mintSignature);

    // Step 2: Create associated token account and mint tokens
    console.log("📝 Step 2: Creating token account and minting...");
    const tokenTransaction = new Transaction().add(
      // Create associated token account
      createAssociatedTokenAccountInstruction(
        this.payer.publicKey,
        tokenAccount,
        this.payer.publicKey,
        mint,
        TOKEN_PROGRAM_ID
      ),
      // Mint tokens
      createMintToInstruction(
        mint,
        tokenAccount,
        this.payer.publicKey,
        INITIAL_SUPPLY * Math.pow(10, TOKEN_DECIMALS),
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Set recent blockhash
    const { blockhash: tokenBlockhash } =
      await this.connection.getRecentBlockhash();
    tokenTransaction.recentBlockhash = tokenBlockhash;
    tokenTransaction.feePayer = this.payer.publicKey;

    tokenTransaction.partialSign(this.payer);
    const tokenSignature = await this.connection.sendRawTransaction(
      tokenTransaction.serialize(),
      { skipPreflight: false }
    );

    console.log(`📦 Token transaction signature: ${tokenSignature}`);
    await this.pollForConfirmation(tokenSignature);

    // Step 3: Add Metaplex metadata
    console.log("📝 Step 3: Adding Metaplex metadata...");

    console.log(
      "⚠️  Using legacy approach - metadata creation may fail due to signing requirements"
    );
    console.log(
      "💡 Consider using createTokenWithMetaplexOnly() for better results"
    );

    return { mint, tokenAccount, mintKeypair };
  }

  async checkBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.payer.publicKey);
    console.log(`💰 Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    return balance;
  }

  async requestAirdrop(amount: number = 10): Promise<void> {
    console.log(`🪂 Requesting ${amount} SOL airdrop...`);
    try {
      // Check current balance before airdrop
      const balanceBefore = await this.connection.getBalance(
        this.payer.publicKey
      );
      console.log(
        `💰 Balance before airdrop: ${balanceBefore / LAMPORTS_PER_SOL} SOL`
      );

      const signature = await this.connection.requestAirdrop(
        this.payer.publicKey,
        amount * LAMPORTS_PER_SOL
      );
      console.log(`🔄 Airdrop signature: ${signature}`);
      await this.pollForConfirmation(signature);
      console.log(`✅ Airdrop confirmed!`);

      // Check balance after airdrop
      const balanceAfter = await this.connection.getBalance(
        this.payer.publicKey
      );
      console.log(
        `💰 Balance after airdrop: ${balanceAfter / LAMPORTS_PER_SOL} SOL`
      );
      console.log(
        `📈 Balance increase: ${
          (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL
        } SOL`
      );
    } catch (error) {
      console.log(
        `⚠️  Airdrop failed (may not be available on this network): ${error}`
      );
      throw error; // Re-throw so caller can handle
    }
  }

  async getTokenInfo(mint: PublicKey, tokenAccount: PublicKey): Promise<void> {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(mint);
      const tokenInfo = await this.connection.getParsedAccountInfo(
        tokenAccount
      );

      console.log("\n📊 Token Information:");
      console.log(`🎯 Mint: ${mint.toBase58()}`);
      console.log(`📦 Token Account: ${tokenAccount.toBase58()}`);

      if (mintInfo.value?.data && "parsed" in mintInfo.value.data) {
        const mintData = mintInfo.value.data.parsed.info;
        console.log(`🔢 Decimals: ${mintData.decimals}`);
        console.log(`📈 Supply: ${mintData.supply}`);
        console.log(`👤 Mint Authority: ${mintData.mintAuthority}`);
      }

      if (tokenInfo.value?.data && "parsed" in tokenInfo.value.data) {
        const tokenData = tokenInfo.value.data.parsed.info;
        console.log(
          `💎 Token Balance: ${tokenData.tokenAmount.uiAmount} ${TOKEN_SYMBOL}`
        );
      }

      // Check if metadata exists
      const metadataPda = findMetadataPda(this.umi, {
        mint: fromWeb3JsPublicKey(mint),
      });

      try {
        const metadataAccount = await this.connection.getAccountInfo(
          new PublicKey(metadataPda[0])
        );
        if (metadataAccount) {
          console.log(
            `🎨 Metadata Account: ${metadataPda[0]} (${metadataAccount.data.length} bytes)`
          );
          console.log("✅ Metaplex metadata is present!");
        } else {
          console.log("❌ No metadata account found");
        }
      } catch (error) {
        console.log("⚠️  Could not check metadata account:", error);
      }
    } catch (error) {
      console.error("❌ Failed to get token info:", error);
    }
  }
}

async function main() {
  try {
    const creator = new MetaplexTokenCreator();

    // Check wallet balance
    const balance = await creator.checkBalance();

    // Request airdrop if balance is too low (need more for metadata rent)
    if (balance < 2 * LAMPORTS_PER_SOL) {
      await creator.requestAirdrop(5); // Request 5 SOL for metadata account rent

      // Wait a bit for balance to update
      console.log("⏳ Waiting for balance to update...");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const newBalance = await creator.checkBalance();
      if (newBalance < 1 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Insufficient balance after airdrop: ${
            newBalance / LAMPORTS_PER_SOL
          } SOL. Need at least 1 SOL.`
        );
      }
    }

    // Create token with metadata using unified Metaplex approach
    const { mint, tokenAccount } = await creator.createTokenWithMetaplexOnly();

    // Display token information
    await creator.getTokenInfo(mint, tokenAccount);

    console.log("\n🎉 Token creation with Metaplex metadata completed!");
    console.log("\n💡 Next steps:");
    console.log(
      "1. Check your wallet - the token should display with name and symbol"
    );
    console.log("2. Verify on Solana Explorer that metadata is attached");
    console.log(
      "3. The token should be compatible with all Solana wallets and dApps"
    );
  } catch (error) {
    console.error("❌ Error in main:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { MetaplexTokenCreator };
