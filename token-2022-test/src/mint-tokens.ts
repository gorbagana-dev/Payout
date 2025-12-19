import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Configuration
const VALIDATOR_URL = "https://rpc.gorbagana.wtf";
const WALLET_PATH = "../../dev-wallet.json";
const MINT_AMOUNT = 1_000_000; // 1 million tokens (with 6 decimals = 1,000,000.000000)

class TokenMinter {
  public connection: Connection;
  public payer: Keypair;

  constructor() {
    this.connection = new Connection(VALIDATOR_URL, {
      commitment: "confirmed",
      wsEndpoint: undefined, // Disable WebSocket to avoid 405 errors
    });

    // Load wallet keypair
    const walletPath = path.resolve(__dirname, WALLET_PATH);
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found at ${walletPath}`);
    }

    const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
    this.payer = Keypair.fromSecretKey(new Uint8Array(walletData));

    console.log("🔑 Loaded wallet:", this.payer.publicKey.toBase58());
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

  async mintTokens(mintAddress: string, amount: number): Promise<string> {
    console.log("\n🪙 Starting token minting...");
    console.log("🎯 Mint address:", mintAddress);
    console.log("📊 Amount to mint:", amount);

    try {
      const mintPubkey = new PublicKey(mintAddress);

      // Get associated token account address
      const associatedTokenAccount = getAssociatedTokenAddressSync(
        mintPubkey,
        this.payer.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_2022_PROGRAM_ID
      );

      console.log(
        "🏦 Associated token account:",
        associatedTokenAccount.toBase58()
      );

      // Check if associated token account exists
      let accountExists = false;
      try {
        await getAccount(
          this.connection,
          associatedTokenAccount,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        accountExists = true;
        console.log("✅ Associated token account already exists");
      } catch (error) {
        console.log("📝 Need to create associated token account");
      }

      const transaction = new Transaction();

      // Create associated token account if it doesn't exist
      if (!accountExists) {
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          this.payer.publicKey, // payer
          associatedTokenAccount, // associatedToken
          this.payer.publicKey, // owner
          mintPubkey, // mint
          TOKEN_2022_PROGRAM_ID
        );
        transaction.add(createATAInstruction);
        console.log("➕ Added create ATA instruction");
      }

      // Create mint to instruction
      const mintToInstruction = createMintToInstruction(
        mintPubkey, // mint
        associatedTokenAccount, // destination
        this.payer.publicKey, // authority
        amount, // amount (in smallest units)
        [], // multiSigners
        TOKEN_2022_PROGRAM_ID
      );

      transaction.add(mintToInstruction);
      console.log("➕ Added mint to instruction");

      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.payer.publicKey;

      console.log("🔄 Sending transaction...");

      // Sign and send transaction
      transaction.sign(this.payer);
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

      console.log("✅ Tokens minted successfully!");
      console.log("🔗 Transaction signature:", signature);
      console.log("🏦 Token account:", associatedTokenAccount.toBase58());

      return signature;
    } catch (error) {
      console.error("❌ Failed to mint tokens:", error);

      if (error instanceof Error) {
        console.error("Error details:", error.message);
        if ("logs" in error && Array.isArray(error.logs)) {
          console.error("Transaction logs:", error.logs);
        }
      }

      throw error;
    }
  }

  async checkTokenBalance(mintAddress: string): Promise<void> {
    console.log("\n💰 Checking token balance...");

    try {
      const mintPubkey = new PublicKey(mintAddress);
      const associatedTokenAccount = getAssociatedTokenAddressSync(
        mintPubkey,
        this.payer.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const tokenAccount = await getAccount(
        this.connection,
        associatedTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );

      console.log("✅ Token balance:", tokenAccount.amount.toString());
      console.log("🏦 Token account:", associatedTokenAccount.toBase58());
      console.log("🪙 Mint:", tokenAccount.mint.toBase58());
      console.log("👤 Owner:", tokenAccount.owner.toBase58());
    } catch (error) {
      console.error("❌ Failed to check balance:", error);
    }
  }
}

// Main execution
async function main() {
  console.log("🪙 SPL Token-2022 Minter");
  console.log("========================\n");

  // Get mint address from command line arguments
  const mintAddress = process.argv[2];
  if (!mintAddress) {
    console.error("❌ Please provide mint address as argument");
    console.log("Usage: npm run mint <MINT_ADDRESS>");
    process.exit(1);
  }

  try {
    const minter = new TokenMinter();

    // Check connection
    const version = await minter.connection.getVersion();
    console.log("✅ Connected to Solana cluster:", version);

    // Check wallet balance
    const balance = await minter.connection.getBalance(minter.payer.publicKey);
    console.log(`💰 Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    // Mint tokens
    await minter.mintTokens(mintAddress, MINT_AMOUNT);

    // Check final balance
    await minter.checkTokenBalance(mintAddress);

    console.log("\n🎉 SUCCESS! Tokens minted successfully");
  } catch (error) {
    console.error("\n💥 FAILED to mint tokens:", error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

export { TokenMinter };
