import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  createBurnInstruction,
  createTransferInstruction,
  getAccount,
  getMint,
  getMintLen,
  createInitializeMintInstruction,
  ExtensionType,
  createInitializeMetadataPointerInstruction,
  LENGTH_SIZE,
  TYPE_SIZE,
} from "@solana/spl-token";

// Metadata functionality imports
import type { TokenMetadata } from "@solana/spl-token-metadata";
import {
  createInitializeInstruction,
  pack,
  createUpdateFieldInstruction,
} from "@solana/spl-token-metadata";

export class TestUtils {
  public connection: Connection;
  public payer: Keypair;

  constructor() {
    // Connect to local validator
    this.connection = new Connection("http://localhost:8899", "confirmed");
    // this.connection = new Connection("https://devnet.helius-rpc.com/?api-key=8ff87f94-5a19-45e5-b9ff-51d35fb0a02f", "confirmed");
    this.payer = Keypair.generate();
  }

  /**
   * Initialize test environment by funding the payer account
   */
  async initialize(): Promise<void> {
    try {
      // Request airdrop for payer
      const signature = await this.connection.requestAirdrop(
        this.payer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await this.connection.confirmTransaction(signature);

      console.log(`Payer funded: ${this.payer.publicKey.toBase58()}`);
    } catch (error) {
      console.error("Failed to initialize test utils:", error);
      throw error;
    }
  }

  /**
   * Create a new SPL Token 2022 mint
   */
  async createMint(
    decimals: number = 6,
    mintAuthority?: PublicKey | null,
    freezeAuthority?: PublicKey | null
  ): Promise<{ mint: Keypair; mintAddress: PublicKey }> {
    const mint = Keypair.generate();
    const mintAuthority_ =
      mintAuthority === undefined ? this.payer.publicKey : mintAuthority;
    const freezeAuthority_ =
      freezeAuthority === undefined ? this.payer.publicKey : freezeAuthority;

    const mintLen = getMintLen([]);
    const lamports = await this.connection.getMinimumBalanceForRentExemption(
      mintLen
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        decimals,
        mintAuthority_!,
        freezeAuthority_,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(this.connection, transaction, [
      this.payer,
      mint,
    ]);

    return {
      mint,
      mintAddress: mint.publicKey,
    };
  }

  /**
   * Create an associated token account
   */
  async createATokenAccount(
    mint: PublicKey,
    owner: PublicKey = this.payer.publicKey
  ): Promise<PublicKey> {
    const associatedTokenAddress = getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if account already exists
    try {
      await getAccount(
        this.connection,
        associatedTokenAddress,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      return associatedTokenAddress; // Account already exists
    } catch (error) {
      // Account doesn't exist, create it
    }

    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        this.payer.publicKey,
        associatedTokenAddress,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);

    return associatedTokenAddress;
  }

  /**
   * Mint tokens to an account
   */
  async mintTo(
    mint: PublicKey,
    destination: PublicKey,
    amount: bigint,
    mintAuthority: Keypair = this.payer
  ): Promise<string> {
    const transaction = new Transaction().add(
      createMintToInstruction(
        mint,
        destination,
        mintAuthority.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    return await sendAndConfirmTransaction(this.connection, transaction, [
      this.payer,
      mintAuthority,
    ]);
  }

  /**
   * Burn tokens from an account
   */
  async burn(
    mint: PublicKey,
    account: PublicKey,
    amount: bigint,
    owner: Keypair = this.payer
  ): Promise<string> {
    const transaction = new Transaction().add(
      createBurnInstruction(
        account,
        mint,
        owner.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    return await sendAndConfirmTransaction(this.connection, transaction, [
      this.payer,
      owner,
    ]);
  }

  /**
   * Transfer tokens between accounts
   */
  async transfer(
    mint: PublicKey,
    source: PublicKey,
    destination: PublicKey,
    amount: bigint,
    owner: Keypair = this.payer
  ): Promise<string> {
    const transaction = new Transaction().add(
      createTransferInstruction(
        source,
        destination,
        owner.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    return await sendAndConfirmTransaction(this.connection, transaction, [
      this.payer,
      owner,
    ]);
  }

  /**
   * Get token account info
   */
  async getTokenAccount(account: PublicKey) {
    return await getAccount(
      this.connection,
      account,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
  }

  /**
   * Get mint info
   */
  async getMintInfo(mint: PublicKey) {
    return await getMint(
      this.connection,
      mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
  }

  /**
   * Generate a new keypair
   */
  generateKeypair(): Keypair {
    return Keypair.generate();
  }

  /**
   * Fund an account with SOL
   */
  async fundAccount(
    account: PublicKey,
    lamports: number = LAMPORTS_PER_SOL
  ): Promise<void> {
    const signature = await this.connection.requestAirdrop(account, lamports);
    await this.connection.confirmTransaction(signature);
  }

  /**
   * Wait for transaction confirmation
   */
  async confirmTransaction(signature: string): Promise<void> {
    await this.connection.confirmTransaction(signature);
  }

  /**
   * Get account balance
   */
  async getBalance(account: PublicKey): Promise<number> {
    return await this.connection.getBalance(account);
  }

  /**
   * Create a new SPL Token 2022 mint with metadata extension
   */
  async createMintWithMetadata(): Promise<{
    mint: Keypair;
    mintAddress: PublicKey;
  }> {
    // Generate new keypair for Mint Account
    const mintKeypair = Keypair.generate();
    // Address for Mint Account
    const mint = mintKeypair.publicKey;
    // Decimals for Mint Account
    const decimals = 9;
    // Authority that can mint new tokens
    const mintAuthority = this.payer.publicKey;
    // Authority that can update the metadata pointer and token metadata
    const updateAuthority = this.payer.publicKey;

    // Metadata to store in Mint Account
    const metaData: TokenMetadata = {
      updateAuthority: updateAuthority,
      mint: mint,
      name: "OPOS",
      symbol: "OPOS",
      uri: "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/DeveloperPortal/metadata.json",
      additionalMetadata: [["description", "Only Possible On Solana"]],
    };

    // Size of MetadataExtension 2 bytes for type, 2 bytes for length
    const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
    // Size of metadata
    const metadataLen = pack(metaData).length;
    // Size of Mint Account with extension
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    // Total space needed for the account
    const totalSpace = mintLen + metadataExtension + metadataLen;
    // Minimum lamports required for Mint Account
    const lamports = await this.connection.getMinimumBalanceForRentExemption(totalSpace);

    // Instruction to invoke System Program to create new account
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: this.payer.publicKey, // Account that will transfer lamports to created account
      newAccountPubkey: mint, // Address of the account to create
      space: totalSpace, // Amount of bytes to allocate to the created account
      lamports, // Amount of lamports transferred to created account
      programId: TOKEN_2022_PROGRAM_ID, // Program assigned as owner of created account
    });

    // Instruction to initialize the MetadataPointer Extension
    const initializeMetadataPointerInstruction =
      createInitializeMetadataPointerInstruction(
        mint, // Mint Account address
        updateAuthority, // Authority that can set the metadata address
        mint, // Account address that holds the metadata
        TOKEN_2022_PROGRAM_ID
      );

    // Instruction to initialize Mint Account data
    const initializeMintInstruction = createInitializeMintInstruction(
      mint, // Mint Account Address
      decimals, // Decimals of Mint
      mintAuthority, // Designated Mint Authority
      null, // Optional Freeze Authority
      TOKEN_2022_PROGRAM_ID // Token Extension Program ID
    );
    console.log("initializeMintInstruction", initializeMintInstruction);


    // Instruction to initialize Metadata Account data
    const initializeMetadataInstruction = createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
      metadata: mint, // Account address that holds the metadata
      updateAuthority: updateAuthority, // Authority that can update the metadata
      mint: mint, // Mint Account address
      mintAuthority: mintAuthority, // Designated Mint Authority
      name: metaData.name,
      symbol: metaData.symbol,
      uri: metaData.uri,
    });

    // Instruction to update metadata, adding custom field
    const updateFieldInstruction = createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
      metadata: mint, // Account address that holds the metadata
      updateAuthority: updateAuthority, // Authority that can update the metadata
      field: metaData.additionalMetadata[0][0], // key
      value: metaData.additionalMetadata[0][1], // value
    });

    // Create transaction with all instructions
    const transaction = new Transaction().add(
      createAccountInstruction,
      initializeMetadataPointerInstruction,
      // note: the above instructions are required before initializing the mint
      initializeMintInstruction,
      initializeMetadataInstruction,
      updateFieldInstruction
    );

    // Send transaction
    const transactionSignature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer, mintKeypair] // Signers
    );

    console.log(
      " \n Create Mint Account:",
      `https://solana.fm/tx/${transactionSignature}?cluster=custom&customUrl=http://localhost:8899`
    );

    return {
      mint: mintKeypair,
      mintAddress: mint,
    };
  }
}
