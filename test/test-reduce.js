import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// __dirname configuration for ES modules
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'reduce-test-model.trias');

// Function to clean up the test model file
async function cleanup() {
  await fs.unlink(modelFile).catch(() => {});
}

async function testReduceClustering() {
  console.log("🧪 Testing Reduce Function (Clustering)...\n");
  
  await cleanup();
  
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  
  await oracle.initialized;
  
  console.log('📚 Training model with diverse categories...');
  
  // Train with diverse categories
  await oracle.train([
    {input: 'Latest technology innovations and AI breakthroughs', output: 'Technology'},
    {input: 'Scientific discoveries and research findings', output: 'Science'},
    {input: 'Health and medical advances in treatment', output: 'Health'},
    {input: 'Business and financial market analysis', output: 'Business'},
    {input: 'Entertainment and media industry updates', output: 'Entertainment'},
    {input: 'Sports and athletic achievements worldwide', output: 'Sports'},
    {input: 'Political developments and government news', output: 'Politics'},
    {input: 'Environmental science and climate research', output: 'Environment'}
  ]);
  
  console.log('✅ Training completed');
  
  console.log('\n🔍 Test 1: Basic Clustering with Array Input');
  console.log('============================================');
  
  const categories = ['Technology', 'Science', 'Health', 'Business', 'Entertainment', 'Sports'];
  const clusters = await oracle.reduce(categories, { amount: 3 });
  
  console.log('📊 Clustering Results:');
  console.table(clusters);
  
  assert.ok(typeof clusters === 'object', "Clusters should be an object");
  assert.ok(Object.keys(clusters).length > 0, "Should have at least one cluster");
  
  // Verify all categories are included in clusters
  const allClusteredCategories = Object.values(clusters).flat();
  categories.forEach(category => {
    assert.ok(allClusteredCategories.includes(category), `Category ${category} should be in clusters`);
  });
  
  console.log('✅ Basic clustering test passed');
  
  console.log('\n🔍 Test 2: Weighted Clustering with Object Input');
  console.log('================================================');
  
  const weightedCategories = {
    'Technology': 2,
    'Science': 1.5,
    'Health': 1,
    'Business': 0.8,
    'Entertainment': 0.5,
    'Sports': 0.3
  };
  const weightedClusters = await oracle.reduce(weightedCategories, { amount: 2 });
  
  console.log('📊 Weighted Clustering Results:');
  console.table(weightedClusters);
  
  assert.ok(typeof weightedClusters === 'object', "Weighted clusters should be an object");
  assert.ok(Object.keys(weightedClusters).length > 0, "Should have at least one weighted cluster");
  
  console.log('✅ Weighted clustering test passed');
  
  console.log('\n🔍 Test 3: Edge Cases');
  console.log('=====================');
  
  // Test with fewer categories than requested clusters
  const smallCategories = ['Technology', 'Science'];
  const smallClusters = await oracle.reduce(smallCategories, { amount: 5 });
  
  console.log('📊 Small Categories Clustering:');
  console.table(smallClusters);
  
  assert.ok(Object.keys(smallClusters).length <= smallCategories.length, 
    "Should not have more clusters than categories");
  
  // Test with single category
  const singleCategory = ['Technology'];
  const singleCluster = await oracle.reduce(singleCategory, { amount: 3 });
  
  console.log('📊 Single Category Clustering:');
  console.table(singleCluster);
  
  assert.ok(Object.keys(singleCluster).length === 1, "Should have exactly one cluster for single category");
  
  console.log('✅ Edge cases test passed');
  
  console.log('\n🔍 Test 4: Performance Test');
  console.log('===========================');
  
  const startTime = performance.now();
  const performanceClusters = await oracle.reduce(categories, { amount: 3 });
  const endTime = performance.now();
  
  const executionTime = endTime - startTime;
  console.log(`⏱️  Clustering execution time: ${executionTime.toFixed(2)}ms`);
  
  assert.ok(executionTime < 1000, "Clustering should complete within 1 second");
  assert.ok(Object.keys(performanceClusters).length > 0, "Performance test should produce valid clusters");
  
  console.log('✅ Performance test passed');
  
  console.log('\n🎉 Reduce Function Test Completed Successfully!');
  
  await cleanup();
}

testReduceClustering().catch(console.error); 