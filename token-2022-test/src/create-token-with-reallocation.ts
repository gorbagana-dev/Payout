import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  tokenMetadataInitialize,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Configuration
const VALIDATOR_URL = "https://rpc.gorbagana.wtf";
const WALLET_PATH = "../../dev-wallet.json";
const TOKEN_2022_PROGRAM_ID_STRING =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Token metadata
const TOKEN_NAME = "RadBro Token";
const TOKEN_SYMBOL = "RADBRO";
const TOKEN_DECIMALS = 6;
const TOKEN_URI = "https://radbro.com/metadata.json";

interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
}

class SPLToken2022WithReallocation {
  private connection: Connection;
  private payer: Keypair;
  private mint: Keypair;

  constructor() {
    this.connection = new Connection(VALIDATOR_URL, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
      confirmTransactionInitialTimeout: 60000,
    });
    this.mint = Keypair.generate();

    // Load wallet keypair
    const walletPath = path.resolve(__dirname, WALLET_PATH);
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found at ${walletPath}`);
    }

    const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    this.payer = Keypair.fromSecretKey(new Uint8Array(walletData));

    console.log("🔑 Loaded wallet:", this.payer.publicKey.toBase58());
    console.log("🪙 Generated mint keypair:", this.mint.publicKey.toBase58());
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

        // Wait 2 seconds before next attempt
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

  async checkConnection(): Promise<void> {
    try {
      const version = await this.connection.getVersion();
      console.log("✅ Connected to Solana cluster:", version);

      const balance = await this.connection.getBalance(this.payer.publicKey);
      console.log(`💰 Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

      if (balance < 0.1 * LAMPORTS_PER_SOL) {
        throw new Error(
          "Insufficient balance. Need at least 0.1 SOL for token creation."
        );
      }
    } catch (error) {
      throw new Error(`Failed to connect to validator: ${error}`);
    }
  }

  // Create a reallocate instruction manually
  private createReallocateInstruction(
    account: PublicKey,
    payer: PublicKey,
    authority: PublicKey,
    extensionTypes: ExtensionType[]
  ): TransactionInstruction {
    // This is a simplified version - in production you'd want to use the proper
    // reallocate instruction from the SPL Token-2022 library
    const data = Buffer.alloc(1 + 1 + extensionTypes.length);
    data.writeUInt8(35, 0); // Reallocate instruction discriminator
    data.writeUInt8(extensionTypes.length, 1);

    for (let i = 0; i < extensionTypes.length; i++) {
      data.writeUInt8(extensionTypes[i], 2 + i);
    }

    return new TransactionInstruction({
      keys: [
        { pubkey: account, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data,
    });
  }

  async createTokenWithMetadataReallocation(
    metadata: TokenMetadata
  ): Promise<string> {
    console.log(
      "\n🚀 Starting SPL Token-2022 creation with proper reallocation..."
    );

    try {
      // Step 1: Create basic mint with metadata pointer extension
      console.log("📝 Step 1: Creating mint with metadata pointer...");

      const extensions = [ExtensionType.MetadataPointer];
      const mintLen = getMintLen(extensions);

      console.log(`📏 Initial mint account space required: ${mintLen} bytes`);

      const rentExemption =
        await this.connection.getMinimumBalanceForRentExemption(mintLen);
      console.log(
        `💸 Initial rent exemption required: ${
          rentExemption / LAMPORTS_PER_SOL
        } SOL`
      );

      const transaction1 = new Transaction();

      // Create account instruction
      const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: this.mint.publicKey,
        space: mintLen,
        lamports: rentExemption,
        programId: new PublicKey(TOKEN_2022_PROGRAM_ID_STRING),
      });

      // Initialize metadata pointer extension
      const initializeMetadataPointerInstruction =
        createInitializeMetadataPointerInstruction(
          this.mint.publicKey,
          this.payer.publicKey, // authority
          this.mint.publicKey, // metadata address (embedded)
          TOKEN_2022_PROGRAM_ID
        );

      // Initialize mint instruction
      const initializeMintInstruction = createInitializeMintInstruction(
        this.mint.publicKey,
        TOKEN_DECIMALS,
        this.payer.publicKey, // mint authority
        this.payer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
      );

      transaction1.add(
        createAccountInstruction,
        initializeMetadataPointerInstruction,
        initializeMintInstruction
      );

      const { blockhash: blockhash1 } =
        await this.connection.getLatestBlockhash();
      transaction1.recentBlockhash = blockhash1;
      transaction1.feePayer = this.payer.publicKey;

      console.log("🔄 Sending mint creation transaction...");

      transaction1.sign(this.payer, this.mint);
      const signature1 = await this.connection.sendRawTransaction(
        transaction1.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        }
      );

      await this.pollForConfirmation(signature1);
      console.log("✅ Mint created successfully!");
      console.log("🔗 Mint creation signature:", signature1);

      // Step 2: Reallocate account for metadata
      console.log("\n📝 Step 2: Reallocating account for metadata...");

      // Calculate the space needed for metadata
      const metadataExtensions = [ExtensionType.TokenMetadata];

      console.log("🔧 Creating reallocate instruction...");

      // Try using the tokenMetadataInitialize function with proper setup
      console.log("📝 Initializing token metadata directly...");

      const metadataSignature = await tokenMetadataInitialize(
        this.connection,
        this.payer, // payer
        this.mint.publicKey, // mint
        this.payer.publicKey, // updateAuthority
        this.payer.publicKey, // mintAuthority
        metadata.name,
        metadata.symbol,
        metadata.uri,
        [], // multiSigners
        {
          commitment: "confirmed",
          preflightCommitment: "confirmed",
        }, // confirmOptions
        TOKEN_2022_PROGRAM_ID
      );

      console.log("✅ Metadata initialized successfully!");
      console.log("🔗 Metadata transaction signature:", metadataSignature);
      console.log("🪙 Token mint address:", this.mint.publicKey.toBase58());

      return this.mint.publicKey.toBase58();
    } catch (error) {
      console.error("❌ Failed to create token:", error);

      if (error instanceof Error) {
        console.error("Error details:", error.message);
        if ("logs" in error && Array.isArray(error.logs)) {
          console.error("Transaction logs:", error.logs);
        }
      }

      throw error;
    }
  }

  async verifyToken(mintAddress: string): Promise<void> {
    console.log("\n🔍 Verifying token creation...");

    try {
      const mintInfo = await this.connection.getAccountInfo(
        new PublicKey(mintAddress)
      );

      if (!mintInfo) {
        throw new Error("Token mint account not found");
      }

      console.log("✅ Token mint account exists");
      console.log("📊 Account data length:", mintInfo.data.length);
      console.log("👤 Account owner:", mintInfo.owner.toBase58());
      console.log(
        "💰 Account balance:",
        mintInfo.lamports / LAMPORTS_PER_SOL,
        "SOL"
      );

      // Verify it's owned by Token-2022 program
      if (mintInfo.owner.toBase58() === TOKEN_2022_PROGRAM_ID_STRING) {
        console.log("✅ Confirmed: Account owned by SPL Token-2022 program");
      } else {
        console.warn(
          "⚠️  Warning: Account not owned by SPL Token-2022 program"
        );
      }
    } catch (error) {
      console.error("❌ Token verification failed:", error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  console.log("🌟 SPL Token-2022 Creator with Proper Reallocation");
  console.log("==================================================\n");

  try {
    const creator = new SPLToken2022WithReallocation();

    // Check connection and balance
    await creator.checkConnection();

    // Create token with metadata using proper reallocation
    const tokenMetadata: TokenMetadata = {
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      uri: TOKEN_URI,
    };

    const mintAddress = await creator.createTokenWithMetadataReallocation(
      tokenMetadata
    );

    // Verify the token was created successfully
    await creator.verifyToken(mintAddress);

    console.log("\n🎉 SUCCESS! SPL Token-2022 created with metadata");
    console.log("🪙 Mint Address:", mintAddress);
    console.log("📛 Token Name:", TOKEN_NAME);
    console.log("🔤 Token Symbol:", TOKEN_SYMBOL);
    console.log("🔢 Decimals:", TOKEN_DECIMALS);
    console.log("🔗 Metadata URI:", TOKEN_URI);
    console.log("💡 You can now mint tokens using: npm run mint", mintAddress);
  } catch (error) {
    console.error("\n💥 FAILED to create SPL Token-2022:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { SPLToken2022WithReallocation };
