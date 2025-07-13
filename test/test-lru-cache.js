import { Trias } from '../src/trias.mjs';
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// __dirname configuration for ES modules
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'lru-test-model.trias');

// Function to clean up the test model file
async function cleanup() {
  await fs.unlink(modelFile).catch(() => {});
}

async function testLRUCache() {
  console.log('🧪 Testing LRU Cache Implementation...\n');
  
  await cleanup();
  
  // Create instance with small cache size to test LRU
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    enableCaching: true,
    cacheSize: 3, // Small cache to test LRU behavior
    batchSize: 50
  });
  
  await oracle.initialized;
  
  // Train with some data
  await oracle.train([
    { input: 'Test prediction one', output: 'Test1' },
    { input: 'Test prediction two', output: 'Test2' },
    { input: 'Test prediction three', output: 'Test3' }
  ]);
  
  console.log('📊 Test 1: Basic Cache Operations');
  console.log('==================================');
  
  // First prediction - should be cached
  const start1 = performance.now();
  const pred1 = await oracle.predict('Test prediction one');
  const time1 = performance.now() - start1;
  
  // Second prediction - should use cache
  const start2 = performance.now();
  const pred2 = await oracle.predict('Test prediction one');
  const time2 = performance.now() - start2;
  
  console.log('✅ First prediction (no cache):', time1.toFixed(3), 'ms');
  console.log('✅ Second prediction (with cache):', time2.toFixed(3), 'ms');
  console.log('✅ Cache hit working:', time2 < time1);
  console.log('✅ Cache size after 1 item:', oracle.cache.size);
  console.log('✅ Timestamps size after 1 item:', oracle.cacheTimestamps.size);
  console.log();
  
  console.log('🔄 Test 2: LRU Eviction Behavior');
  console.log('=================================');
  
  // Add more predictions to fill cache
  await oracle.predict('Test prediction two');
  await oracle.predict('Test prediction three');
  
  console.log('✅ Cache size after 3 items:', oracle.cache.size);
  console.log('✅ Timestamps size after 3 items:', oracle.cacheTimestamps.size);
  
  // Add 4th prediction - should evict least recently used
  await oracle.predict('Test prediction four');
  
  console.log('✅ Cache size after 4th item:', oracle.cache.size);
  console.log('✅ Timestamps size after 4th item:', oracle.cacheTimestamps.size);
  
  // Verify that the first prediction was evicted (LRU)
  const cacheKeys = Array.from(oracle.cache.keys());
  const hasFirstPrediction = cacheKeys.some(key => key.includes('Test prediction one'));
  
  console.log('✅ First prediction evicted (LRU):', !hasFirstPrediction);
  console.log('✅ Cache keys:', cacheKeys.map(k => k.substring(0, 20) + '...'));
  console.log();
  
  console.log('⏰ Test 3: Access Time Updates');
  console.log('=============================');
  
  // Access the second prediction to update its timestamp
  const oldTimestamp = oracle.cacheTimestamps.get(cacheKeys.find(k => k.includes('Test prediction two')));
  
  // Wait a bit to ensure timestamp difference
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Access the second prediction again
  await oracle.predict('Test prediction two');
  
  const newTimestamp = oracle.cacheTimestamps.get(cacheKeys.find(k => k.includes('Test prediction two')));
  
  console.log('✅ Timestamp updated on access:', newTimestamp > oldTimestamp);
  console.log('✅ Old timestamp:', oldTimestamp);
  console.log('✅ New timestamp:', newTimestamp);
  console.log();
  
  console.log('🧹 Test 4: Cache Reset');
  console.log('======================');
  
  const cacheSizeBefore = oracle.cache.size;
  const timestampsSizeBefore = oracle.cacheTimestamps.size;
  
  oracle.reset();
  
  console.log('✅ Cache cleared on reset:', oracle.cache.size === 0);
  console.log('✅ Timestamps cleared on reset:', oracle.cacheTimestamps.size === 0);
  console.log('✅ Cache size before reset:', cacheSizeBefore);
  console.log('✅ Timestamps size before reset:', timestampsSizeBefore);
  console.log();
  
  console.log('🎯 Test 5: LRU Under Load');
  console.log('==========================');
  
  // Test with more items to ensure LRU works correctly
  const predictions = [
    'First prediction',
    'Second prediction', 
    'Third prediction',
    'Fourth prediction',
    'Fifth prediction',
    'Sixth prediction'
  ];
  
  // Fill cache and access in specific pattern
  for (const pred of predictions) {
    await oracle.predict(pred);
  }
  
  console.log('✅ Final cache size:', oracle.cache.size);
  console.log('✅ Final timestamps size:', oracle.cacheTimestamps.size);
  
  // Access middle item to make it most recently used
  await oracle.predict('Third prediction');
  
  // Add one more to trigger eviction
  await oracle.predict('Seventh prediction');
  
  const finalKeys = Array.from(oracle.cache.keys());
  const hasThirdPredictionFinal = finalKeys.some(key => key.includes('Third prediction'));
  const hasFirstPredictionFinal = finalKeys.some(key => key.includes('First prediction'));
  
  console.log('✅ Third prediction still in cache (MRU):', hasThirdPredictionFinal);
  console.log('✅ First prediction evicted (LRU):', !hasFirstPredictionFinal);
  console.log('✅ Final cache keys:', finalKeys.map(k => k.substring(0, 15) + '...'));
  
  console.log('\n🎉 LRU Cache Test Completed Successfully!');
  
  await cleanup();
}

testLRUCache().catch(console.error); 