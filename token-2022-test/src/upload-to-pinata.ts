import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

// Pinata configuration - you'll need to set your API keys
const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY || "";

if (!PINATA_API_KEY || !PINATA_SECRET_API_KEY) {
  console.error(
    "❌ Please set PINATA_API_KEY and PINATA_SECRET_API_KEY environment variables"
  );
  console.log("💡 Get your keys from: https://app.pinata.cloud/keys");
  process.exit(1);
}

const PINATA_BASE_URL = "https://api.pinata.cloud";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

function makeHttpRequest(
  url: string,
  options: any,
  data?: Buffer | string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === "https:" ? https : http;

    const req = client.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              resolve({
                ok: true,
                status: res.statusCode,
                statusText: res.statusMessage || "",
                json: () => JSON.parse(body),
                text: () => body,
              });
            } else {
              resolve({
                ok: false,
                status: res.statusCode,
                statusText: res.statusMessage || "",
                json: () => JSON.parse(body),
                text: () => body,
              });
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

function createMultipartForm(
  fields: { [key: string]: string },
  files: { [key: string]: { path: string; filename: string } }
): { data: Buffer; boundary: string } {
  const boundary = `----formdata-pinata-${Date.now()}`;
  const chunks: Buffer[] = [];

  // Add text fields
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
    );
    chunks.push(Buffer.from(`${value}\r\n`));
  }

  // Add files
  for (const [name, file] of Object.entries(files)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${name}"; filename="${file.filename}"\r\n`
      )
    );
    chunks.push(Buffer.from(`Content-Type: application/octet-stream\r\n\r\n`));
    chunks.push(fs.readFileSync(file.path));
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    data: Buffer.concat(chunks),
    boundary,
  };
}

class PinataUploader {
  private async uploadFile(
    filePath: string,
    fileName: string
  ): Promise<string> {
    const url = `${PINATA_BASE_URL}/pinning/pinFileToIPFS`;

    const metadata = JSON.stringify({
      name: fileName,
    });

    const options = JSON.stringify({
      cidVersion: 0,
    });

    const formData = createMultipartForm(
      {
        pinataMetadata: metadata,
        pinataOptions: options,
      },
      {
        file: { path: filePath, filename: fileName },
      }
    );

    try {
      const response = await makeHttpRequest(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${formData.boundary}`,
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
          },
        },
        formData.data
      );

      if (!response.ok) {
        const errorText = response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorText}`
        );
      }

      const result: PinataResponse = response.json();
      const ipfsUrl = `${PINATA_GATEWAY}/${result.IpfsHash}`;

      console.log(`✅ File uploaded successfully!`);
      console.log(`📁 IPFS Hash: ${result.IpfsHash}`);
      console.log(`🔗 URL: ${ipfsUrl}`);

      return ipfsUrl;
    } catch (error) {
      console.error("❌ Error uploading file to Pinata:", error);
      throw error;
    }
  }

  private async uploadJSON(jsonData: any, fileName: string): Promise<string> {
    const url = `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`;

    const data = {
      pinataContent: jsonData,
      pinataMetadata: {
        name: fileName,
      },
      pinataOptions: {
        cidVersion: 0,
      },
    };

    try {
      const response = await makeHttpRequest(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_API_KEY,
          },
        },
        JSON.stringify(data)
      );

      if (!response.ok) {
        const errorText = response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorText}`
        );
      }

      const result: PinataResponse = response.json();
      const ipfsUrl = `${PINATA_GATEWAY}/${result.IpfsHash}`;

      console.log(`✅ JSON uploaded successfully!`);
      console.log(`📁 IPFS Hash: ${result.IpfsHash}`);
      console.log(`🔗 URL: ${ipfsUrl}`);

      return ipfsUrl;
    } catch (error) {
      console.error("❌ Error uploading JSON to Pinata:", error);
      throw error;
    }
  }

  async uploadTokenAssets(): Promise<{
    imageUri: string;
    metadataUri: string;
  }> {
    console.log("🚀 Starting upload to Pinata IPFS...");

    // Step 1: Upload image
    console.log("\n📸 Step 1: Uploading image...");
    const imagePath = path.resolve(__dirname, "../myradbro.png");

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found at ${imagePath}`);
    }

    const imageStats = fs.statSync(imagePath);
    console.log(`📊 Image size: ${(imageStats.size / 1024).toFixed(2)} KB`);

    const imageUri = await this.uploadFile(imagePath, "myradbro.png");

    // Step 2: Create and upload metadata
    console.log("\n📝 Step 2: Creating metadata...");

    // Load wallet to get creator address
    const walletPath = path.resolve(__dirname, "../../dev-wallet.json");
    let creatorAddress = "";

    if (fs.existsSync(walletPath)) {
      const walletData = JSON.parse(fs.readFileSync(walletPath, "utf8"));
      const { Keypair } = await import("@solana/web3.js");
      const keypair = Keypair.fromSecretKey(new Uint8Array(walletData));
      creatorAddress = keypair.publicKey.toBase58();
      console.log(`👤 Creator: ${creatorAddress}`);
    } else {
      console.log("⚠️  No wallet found, using placeholder creator address");
      creatorAddress = "11111111111111111111111111111111"; // System Program as placeholder
    }

    // Create metadata following Metaplex Token Metadata standard
    const metadata = {
      name: "RadBro Token",
      symbol: "RADBRO",
      description:
        "A radical token for the RadBro community - powered by Agave validator with Metaplex Token Metadata",
      image: imageUri,
      attributes: [
        {
          trait_type: "Type",
          value: "Community Token",
        },
        {
          trait_type: "Network",
          value: "Solana",
        },
        {
          trait_type: "Standard",
          value: "Metaplex Token Metadata",
        },
        {
          trait_type: "Rarity",
          value: "Legendary",
        },
      ],
      properties: {
        files: [
          {
            uri: imageUri,
            type: "image/png",
          },
        ],
        category: "image",
        creators: [
          {
            address: creatorAddress,
            share: 100,
          },
        ],
      },
    };

    console.log("📋 Metadata preview:");
    console.log(JSON.stringify(metadata, null, 2));

    console.log("\n☁️  Step 3: Uploading metadata...");
    const metadataUri = await this.uploadJSON(
      metadata,
      "radbro-token-metadata.json"
    );

    console.log("\n🎉 Upload completed successfully!");
    console.log(`🖼️  Image URI: ${imageUri}`);
    console.log(`📄 Metadata URI: ${metadataUri}`);

    // Verify the URLs are accessible
    console.log("\n🔍 Verifying uploads...");
    try {
      const imageResponse = await makeHttpRequest(imageUri, {});
      console.log(
        `✅ Image accessible: ${imageResponse.status} ${imageResponse.statusText}`
      );

      const metadataResponse = await makeHttpRequest(metadataUri, {});
      if (metadataResponse.ok) {
        const metadataJson: any = metadataResponse.json();
        console.log(
          `✅ Metadata accessible: ${metadataResponse.status} ${metadataResponse.statusText}`
        );
        console.log(`📊 Metadata name: "${metadataJson.name}"`);
        console.log(`🎨 Metadata image: ${metadataJson.image}`);
      } else {
        console.log(
          `⚠️  Metadata response: ${metadataResponse.status} ${metadataResponse.statusText}`
        );
      }
    } catch (error) {
      console.log(`⚠️  Verification failed: ${error}`);
    }

    return { imageUri, metadataUri };
  }
}

async function main() {
  try {
    const uploader = new PinataUploader();
    const { imageUri, metadataUri } = await uploader.uploadTokenAssets();

    console.log("\n💡 Next steps:");
    console.log("1. Copy the metadata URI above");
    console.log("2. Update your token creation script to use this URI");
    console.log("3. Create a new token with the hosted metadata");

    // Save URIs to a file for easy reference
    const uris = {
      imageUri,
      metadataUri,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.resolve(__dirname, "../uploaded-assets.json"),
      JSON.stringify(uris, null, 2)
    );

    console.log("💾 URIs saved to uploaded-assets.json");
  } catch (error) {
    console.error("💥 Upload failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { PinataUploader };
