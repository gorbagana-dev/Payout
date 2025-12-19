import { TestUtils } from './utils';

async function runTest() {
  const testUtils = new TestUtils();
  await testUtils.initialize();

  const { mintAddress } = await testUtils.createMintWithMetadata();

  console.log(mintAddress);
}

runTest().catch(console.error);
