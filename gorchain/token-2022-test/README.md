# SPL Token-2022 TypeScript Creator

This TypeScript project provides a programmatic way to create and manage SPL Token-2022 tokens with metadata on your Agave Solana fork.

## Features

- ✅ Create SPL Token-2022 with embedded metadata
- ✅ Proper metadata pointer extension initialization
- ✅ Token minting functionality
- ✅ Balance checking and verification
- ✅ Comprehensive error handling and logging
- ✅ TypeScript with full type safety

## Prerequisites

1. **Agave Validator Running**: Ensure your Agave validator is running on `http://localhost:8899`
2. **Wallet**: Have your `dev-wallet.json` in the parent directory (`../dev-wallet.json`)
3. **Funded Wallet**: Ensure your wallet has sufficient SOL (at least 0.1 SOL recommended)
4. **SPL Token-2022 Program**: The program should be deployed at genesis (handled by your `start-validator.sh`)

## Installation

```bash
cd token-2022-test
npm install
```

## Usage

### 1. Create a New SPL Token-2022 with Metadata

```bash
npm start
```

This will:
- Connect to your local validator
- Check wallet balance
- Create a new mint account with metadata extensions
- Initialize the token with metadata (name, symbol, URI)
- Verify the creation was successful

### 2. Mint Tokens to Your Wallet

After creating a token, use the mint address to mint tokens:

```bash
npm run mint <MINT_ADDRESS>
```

Example:
```bash
npm run mint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

This will:
- Create an associated token account (if needed)
- Mint 1,000,000 tokens to your wallet
- Display the final balance

## Configuration

Edit the configuration at the top of `src/create-token.ts`:

```typescript
// Configuration
const VALIDATOR_URL = 'http://localhost:8899';
const WALLET_PATH = '../dev-wallet.json';
const TOKEN_2022_PROGRAM_ID_STRING = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// Token metadata
const TOKEN_NAME = 'RadBro Token';
const TOKEN_SYMBOL = 'RADBRO';
const TOKEN_DECIMALS = 6;
const TOKEN_URI = 'https://radbro.com/metadata.json';
```

## Key Features Explained

### Embedded Metadata
The script creates tokens with **embedded metadata**, meaning the metadata is stored directly in the mint account rather than in a separate account. This approach:
- Reduces complexity
- Ensures the mint account owns the metadata
- Avoids reallocation issues between different program accounts

### Metadata Pointer Extension
The script properly initializes the metadata pointer extension, which tells the Token-2022 program where to find the token's metadata.

### Comprehensive Error Handling
The script includes detailed error logging and transaction log inspection to help debug any issues.

## Troubleshooting

### Common Issues

1. **"Wallet file not found"**
   - Ensure `dev-wallet.json` exists in the parent directory
   - Check the `WALLET_PATH` configuration

2. **"Insufficient balance"**
   - Fund your wallet with more SOL
   - At least 0.1 SOL is recommended for token creation

3. **"Failed to connect to validator"**
   - Ensure your Agave validator is running
   - Check that it's accessible at `http://localhost:8899`

4. **"Failed to reallocate account data"**
   - This was the issue we encountered with CLI tools
   - The TypeScript approach uses embedded metadata to avoid this
   - If you still see this, check that the Token-2022 program is properly deployed

### Debugging

The scripts provide detailed logging. Look for:
- ✅ Success indicators
- ❌ Error indicators  
- 🔗 Transaction signatures for blockchain explorer lookup
- 📊 Account details and balances

## Files Structure

```
token-2022-test/
├── src/
│   ├── create-token.ts    # Main token creation script
│   └── mint-tokens.ts     # Token minting utility
├── package.json           # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md             # This file
```

## Development

For development with auto-reload:

```bash
npm run dev
```

To build TypeScript to JavaScript:

```bash
npm run build
```

## Next Steps

1. **Test the Creation**: Run `npm start` to create your first token
2. **Mint Tokens**: Use the returned mint address with `npm run mint`
3. **Verify in Wallet**: Check if your wallet now displays the token with proper metadata
4. **Customize**: Modify the metadata and configuration as needed

This TypeScript approach should bypass the reallocation issues we encountered with the CLI tools by using the proper programmatic API calls with embedded metadata.

