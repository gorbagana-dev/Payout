import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  findMetadataPda,
  fetchDigitalAsset,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";

// Configuration - connect directly to validator
const VALIDATOR_URL = "https://rpc.gorbagana.wtf"; // HTTPS endpoint with proper SSL

async function verifyTokenMetadata(mintAddress: string) {
  console.log("🔍 Verifying Token Metadata...");
  console.log(`🎯 Mint Address: ${mintAddress}`);

  // Initialize connection and Umi
  const connection = new Connection(VALIDATOR_URL, {
    commitment: "confirmed",
    wsEndpoint: undefined,
  });

  const umi = createUmi(VALIDATOR_URL, {
    commitment: "confirmed",
    wsEndpoint: undefined,
  }).use(mplTokenMetadata());

  try {
    const mintPubkey = new PublicKey(mintAddress);
    const umiMintPubkey = fromWeb3JsPublicKey(mintPubkey);

    // Step 1: Check if mint account exists
    console.log("\n📋 Step 1: Checking mint account...");
    const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
    if (!mintAccountInfo) {
      console.log("❌ Mint account does not exist!");
      return;
    }
    console.log(
      `✅ Mint account exists (${mintAccountInfo.data.length} bytes)`
    );
    console.log(`💰 Mint account lamports: ${mintAccountInfo.lamports}`);
    console.log(`👤 Mint account owner: ${mintAccountInfo.owner.toBase58()}`);

    // Step 2: Find metadata PDA
    console.log("\n🔍 Step 2: Finding metadata PDA...");
    const [metadataPda] = findMetadataPda(umi, {
      mint: umiMintPubkey,
    });
    const metadataAddress = toWeb3JsPublicKey(metadataPda);
    console.log(`📍 Expected metadata PDA: ${metadataAddress.toBase58()}`);

    // Step 3: Check if metadata account exists
    console.log("\n📋 Step 3: Checking metadata account...");
    const metadataAccountInfo = await connection.getAccountInfo(
      metadataAddress
    );
    if (!metadataAccountInfo) {
      console.log("❌ Metadata account does not exist!");
      console.log("💡 This means the metadata was not properly created.");
      return;
    }
    console.log(
      `✅ Metadata account exists (${metadataAccountInfo.data.length} bytes)`
    );
    console.log(
      `💰 Metadata account lamports: ${metadataAccountInfo.lamports}`
    );
    console.log(
      `👤 Metadata account owner: ${metadataAccountInfo.owner.toBase58()}`
    );

    // Step 4: Fetch digital asset using Umi
    console.log("\n📖 Step 4: Fetching digital asset metadata...");
    try {
      const digitalAsset = await fetchDigitalAsset(umi, umiMintPubkey);
      console.log("✅ Digital asset fetched successfully!");

      console.log("\n📊 Digital Asset Details:");
      console.log(`  Public Key: ${digitalAsset.publicKey}`);
      console.log(`  Mint: ${digitalAsset.mint.publicKey}`);
      console.log(`  Supply: ${digitalAsset.mint.supply}`);
      console.log(`  Decimals: ${digitalAsset.mint.decimals}`);

      if (digitalAsset.metadata) {
        console.log("\n🎨 Metadata Details:");
        console.log(`  Name: "${digitalAsset.metadata.name}"`);
        console.log(`  Symbol: "${digitalAsset.metadata.symbol}"`);
        console.log(`  URI: "${digitalAsset.metadata.uri}"`);
        console.log(
          `  Update Authority: ${digitalAsset.metadata.updateAuthority}`
        );
        console.log(
          `  Token Standard: ${
            digitalAsset.metadata.tokenStandard
              ? JSON.stringify(digitalAsset.metadata.tokenStandard)
              : "None"
          }`
        );
        console.log(
          `  Seller Fee Basis Points: ${digitalAsset.metadata.sellerFeeBasisPoints}`
        );
        console.log(
          `  Primary Sale Happened: ${digitalAsset.metadata.primarySaleHappened}`
        );
        console.log(`  Is Mutable: ${digitalAsset.metadata.isMutable}`);

        if (
          digitalAsset.metadata.creators &&
          Array.isArray(digitalAsset.metadata.creators) &&
          digitalAsset.metadata.creators.length > 0
        ) {
          console.log(`  Creators:`);
          digitalAsset.metadata.creators.forEach(
            (creator: any, index: number) => {
              console.log(
                `    ${index + 1}. ${creator.address} (${creator.share}%) ${
                  creator.verified ? "✅" : "❌"
                }`
              );
            }
          );
        } else {
          console.log(`  Creators: None`);
        }

        // Step 5: Check if URI is accessible (if it's a real URL)
        if (
          digitalAsset.metadata.uri &&
          (digitalAsset.metadata.uri.startsWith("http://") ||
            digitalAsset.metadata.uri.startsWith("https://"))
        ) {
          console.log("\n🌐 Step 5: Checking metadata URI...");
          try {
            const response = await fetch(digitalAsset.metadata.uri);
            if (response.ok) {
              const jsonMetadata = await response.json();
              console.log("✅ URI is accessible!");
              console.log(
                "📄 JSON Metadata:",
                JSON.stringify(jsonMetadata, null, 2)
              );
            } else {
              console.log(`⚠️  URI returned status: ${response.status}`);
            }
          } catch (error) {
            console.log(`❌ Failed to fetch URI: ${error}`);
          }
        } else {
          console.log(
            "\n⏭️  Step 5: Skipping URI check (not a valid HTTP URL)"
          );
        }
      } else {
        console.log("⚠️  No metadata found in digital asset");
      }

      console.log("\n🎉 Metadata verification completed successfully!");
    } catch (error) {
      console.error("❌ Failed to fetch digital asset:", error);
      console.log("💡 This could mean:");
      console.log("   - The token doesn't have Metaplex metadata");
      console.log("   - The metadata account is corrupted");
      console.log("   - The token was created without proper metadata");

      // Let's examine the raw data if the metadata account exists
      if (metadataAccountInfo) {
        console.log("\n🔍 Raw metadata account data (first 100 bytes):");
        const rawData = metadataAccountInfo.data.slice(0, 100);
        console.log(
          Array.from(rawData)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ")
        );
      }
    }
  } catch (error) {
    console.error("💥 Verification failed:", error);
  }
}

// Main execution
const mintAddress =
  process.argv[2] || "BHCeRb9bGwGoEPAhuN32GZjgbrkYVKFEDdpKjG6V9GvY";
verifyTokenMetadata(mintAddress).catch((error) => {
  console.error("💥 Script failed:", error);
  process.exit(1);
});
