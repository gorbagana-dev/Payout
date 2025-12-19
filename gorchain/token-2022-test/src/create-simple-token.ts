import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
/*
```
> token-2022-test@1.0.0 start
> ts-node src/create-token.ts

🌟 SPL Token-2022 Creator with Metadata
=====================================

🔑 Loaded wallet: AfxkSLpytAtUgP4GKCErzkJPP2XXoVgqvAHZVmmyyHcp
🪙 Generated mint keypair: 7dLR3mWnYufFnfg1dVfsRxohkCcy7xSDArkAF4336fXt
(node:15814) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
✅ Connected to Solana cluster: { 'feature-set': 1632274241, 'solana-core': '3.0.0' }
💰 Wallet balance: 20.98988192 SOL

🚀 Starting SPL Token-2022 creation with metadata...
📏 Mint account space required: 234 bytes
💸 Rent exemption required: 0.00251952 SOL
📝 Transaction created with mint and metadata pointer
🔄 Sending transaction...
⏳ Waiting for transaction confirmation...
🔄 Polling for confirmation of 4gz7kJg1LjcR3iD4ceAz7H7o2hjo1JC85Y74mzNQeimoLsBfpJEu6Rg1bbfHKS2q6Ueot8swonsATmVLPT6brCch...
⏳ Attempt 1/30 - Status: pending
✅ Transaction confirmed after 2 attempts
✅ Mint created successfully!
🔗 Transaction signature: 4gz7kJg1LjcR3iD4ceAz7H7o2hjo1JC85Y74mzNQeimoLsBfpJEu6Rg1bbfHKS2q6Ueot8swonsATmVLPT6brCch
📝 Initializing token metadata...
❌ Failed to create token: SendTransactionError: Simulation failed. 
Message: Transaction simulation failed: Error processing Instruction 0: Failed to reallocate account data. 
Logs: 
[
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [1]",
  "Program log: TokenMetadataInstruction: Initialize",
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 2882 of 200000 compute units",
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: Failed to reallocate account data"
]. 
Catch the `SendTransactionError` and call `getLogs()` on it for full details.
    at Connection.sendEncodedTransaction (/Users/radbro/workspace/radbro-content/code/agave/token-2022-test/node_modules/@solana/web3.js/src/connection.ts:6053:13)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Connection.sendRawTransaction (/Users/radbro/workspace/radbro-content/code/agave/token-2022-test/node_modules/@solana/web3.js/src/connection.ts:6009:20)
    at async Connection.sendTransaction (/Users/radbro/workspace/radbro-content/code/agave/token-2022-test/node_modules/@solana/web3.js/src/connection.ts:5997:12)
    at async sendAndConfirmTransaction (/Users/ilackarms/workspace/radbro-content/code/agave/token-2022-test/node_modules/@solana/web3.js/src/utils/send-and-confirm-transaction.ts:36:21) {
  signature: '',
  transactionMessage: 'Transaction simulation failed: Error processing Instruction 0: Failed to reallocate account data',
  transactionLogs: [
    'Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [1]',
    'Program log: TokenMetadataInstruction: Initialize',
    'Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 2882 of 200000 compute units',
    'Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: Failed to reallocate account data'
  ]
}
Error details: Simulation failed. 
Message: Transaction simulation failed: Error processing Instruction 0: Failed to reallocate account data. 
Logs: 
[
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [1]",
  "Program log: TokenMetadataInstruction: Initialize",
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 2882 of 200000 compute units",
  "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: Failed to reallocate account data"
]. 
Catch the `SendTransactionError` and call `getLogs()` on it for full details.
```
*/
// Configuration
const VALIDATOR_URL = "https://rpc.gorbagana.wtf";
const WALLET_PATH = "../../dev-wallet.json";
const TOKEN_2022_PROGRAM_ID_STRING =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Token configuration
const TOKEN_DECIMALS = 6;

class SimpleTokenCreator {
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

  async createSimpleToken(): Promise<string> {
    console.log(
      "\n🚀 Starting simple SPL Token-2022 creation (no metadata)..."
    );

    try {
      // Calculate the required space for a basic mint account (no extensions)
      const mintLen = getMintLen([]);

      console.log(`📏 Mint account space required: ${mintLen} bytes`);

      // Calculate rent exemption
      const rentExemption =
        await this.connection.getMinimumBalanceForRentExemption(mintLen);
      console.log(
        `💸 Rent exemption required: ${rentExemption / LAMPORTS_PER_SOL} SOL`
      );

      // Create the transaction
      const transaction = new Transaction();

      // 1. Create account instruction
      const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: this.mint.publicKey,
        space: mintLen,
        lamports: rentExemption,
        programId: new PublicKey(TOKEN_2022_PROGRAM_ID_STRING),
      });

      // 2. Initialize mint instruction
      const initializeMintInstruction = createInitializeMintInstruction(
        this.mint.publicKey,
        TOKEN_DECIMALS,
        this.payer.publicKey, // mint authority
        this.payer.publicKey, // freeze authority
        TOKEN_2022_PROGRAM_ID
      );

      // Add instructions to transaction
      transaction.add(createAccountInstruction, initializeMintInstruction);

      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.payer.publicKey;

      console.log("📝 Transaction created with basic mint (no extensions)");
      console.log("🔄 Sending transaction...");

      // Sign and send transaction
      transaction.sign(this.payer, this.mint);
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        }
      );

      // Wait for confirmation using polling
      console.log("⏳ Waiting for transaction confirmation...");
      await this.pollForConfirmation(signature);

      console.log("✅ Simple token created successfully!");
      console.log("🔗 Transaction signature:", signature);
      console.log("🪙 Token mint address:", this.mint.publicKey.toBase58());

      return this.mint.publicKey.toBase58();
    } catch (error) {
      console.error("❌ Failed to create token:", error);

      // Try to get more details about the error
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
  console.log("🌟 Simple SPL Token-2022 Creator (No Metadata)");
  console.log("===============================================\n");

  try {
    const creator = new SimpleTokenCreator();

    // Check connection and balance
    await creator.checkConnection();

    // Create simple token without metadata
    const mintAddress = await creator.createSimpleToken();

    // Verify the token was created successfully
    await creator.verifyToken(mintAddress);

    console.log("\n🎉 SUCCESS! Simple SPL Token-2022 created");
    console.log("🪙 Mint Address:", mintAddress);
    console.log("🔢 Decimals:", TOKEN_DECIMALS);
    console.log(
      "📝 Note: This token has no metadata - it's a basic SPL Token-2022"
    );
    console.log("💡 You can now mint tokens using: npm run mint", mintAddress);
  } catch (error) {
    console.error("\n💥 FAILED to create simple SPL Token-2022:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { SimpleTokenCreator };
