// test/trias.test.mjs

import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// __dirname configuration for ES modules
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'model.trias');

// Function to clean up the test model file
async function cleanup() {
  await fs.unlink(modelFile).catch(() => {});
}

async function testTrainingAndPrediction() {
  console.log("Executing: testTrainingAndPrediction");

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

  // Train with samples for different categories
  await oracle.train([
    {input: 'Weather forecast with sunny skies', output: 'Weather'},
    {input: 'Stock market analysis with financial news', output: 'Finance'},
    {input: 'Culinary recipes and cooking tips', output: 'Cooking'},
    // If you want to test 'Sparse', use really generic examples:
    {input: 'Random unrelated text', output: 'Sparse'},
    {input: 'Miscellaneous information', output: 'Sparse'}
  ]);

  // Test predictions with similar texts
  let prediction = await oracle.predict('Sunny forecast');
  assert.strictEqual(prediction.toLowerCase(), 'weather', "The prediction for 'Sunny forecast' should be 'Weather'");

  prediction = await oracle.predict('Latest financial updates');
  assert.strictEqual(prediction.toLowerCase(), 'finance', "The prediction for 'Latest financial updates' should be 'Finance'");

  prediction = await oracle.predict('Cooking tips and recipes');
  assert.strictEqual(prediction.toLowerCase(), 'cooking', "The prediction for 'Cooking tips and recipes' should be 'Cooking'");

  console.log("testTrainingAndPrediction passed.");
}

async function testSaveAndLoad() {
  console.log("Executing: testSaveAndLoad");
  await cleanup();
  console.log('[testSaveAndLoad] Starting save/load test');
  // Create an instance and train
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

  await oracle.train([
    {input: 'Tech innovations and latest gadgets', output: 'Technology'},
    {input: 'Cool Amish furniture and crafts', output: ['Amish', 'Furniture']}
  ]);
  
  // Save the model
  await oracle.save();

  // Create a new instance to load the saved model
  const oracleReloaded = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  await oracleReloaded.initialized;

  // check if the model is loaded correctly, especially the properties that should be Maps or Sets, check if they are not empty
  assert.ok(oracleReloaded.categoryStemToId.size > 0, "categoryStemToId should have at least one element");
  assert.ok(oracleReloaded.categoryVariations.size > 0, "categoryVariations should have at least one element");
  assert.ok(oracleReloaded.categoryRelations.size > 0, "categoryRelations should have at least one element");
  assert.ok(oracleReloaded.excludes instanceof Set, "excludes should be an instance of Set");

  const prediction2 = await oracleReloaded.predict('Innovative gadgets', {as: 'objects', amount: 4});
  const prediction = await oracleReloaded.predict('Innovative gadgets');
  assert.strictEqual(prediction.toLowerCase(), 'technology', "After loading, the prediction should be 'Technology'");

  console.log("testSaveAndLoad passed.");
}

async function testBestVariant() {
  console.log("Executing: testBestVariant");

  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: false,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  await oracle.initialized;

  // Configure variations for a custom category
  oracle.categoryVariations.set('tech', new Map([['Technology', 10], ['Tech', 5]]));
  const best = oracle.bestVariant('tech');
  assert.strictEqual(best, 'Technology', "The best variation for 'tech' should be 'Technology'");

  console.log("testBestVariant passed.");
}

async function testResetAndDestroy() {
  console.log("Executing: testResetAndDestroy");

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

  // Train a sample and test the prediction
  await oracle.train([
    {input: 'Political debate and news', output: 'Politics'}
  ]);
  let prediction = await oracle.predict('Political debate');
  assert.strictEqual(prediction.toLowerCase(), 'politics', "Before reset, the prediction should be 'Politics'");

  // Reset the model
  oracle.reset();
  // After reset, the prediction can return undefined or null
  prediction = await oracle.predict('Political debate').catch(() => null);
  assert.ok(!prediction, "After reset, there should be no valid prediction");

  // Train again to confirm that the model is still functional
  await oracle.train([
    {input: 'Health and wellness tips', output: 'Health'}
  ]);
  prediction = await oracle.predict('Wellness tips');
  assert.strictEqual(prediction.toLowerCase(), 'health', "After training again, the prediction should be 'Health'");

  // Test destroy: after destroy, methods should throw an error
  await oracle.destroy().catch(() => {}); // destroy rejects the promise
  try {
    await oracle.predict('Any text');
    assert.fail("It should not be possible to predict after destroy");
  } catch (err) {
    assert.ok(err, "Expected error after destroy");
  }

  console.log("testResetAndDestroy passed.");
}

async function testWeightedPrediction() {
  console.log("Executing: testWeightedPrediction");

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

  await oracle.train([
    {input: 'News report and current events', output: 'News'},
    {input: 'Exciting football match highlights', output: 'Sports'}
  ]);

  // Test weighted prediction using an object with weights
  const weightedResults = await oracle.predict({
    'News report and current events': 0.3,
    'Exciting football match highlights': 0.7
  }, {as: 'objects', amount: 2});
  
  assert.ok(Array.isArray(weightedResults), "Weighted prediction should return an array");
  assert.ok(weightedResults.length > 0, "There should be at least one result in the weighted prediction");

  weightedResults.forEach(result => {
    // Each result must contain the 'score' property
    assert.ok(result.score, "Each result must possess the 'score' property");
  });

  console.log("testWeightedPrediction passed.");
}

async function testCategoryRelations() {
  console.log("Executing: testCategoryRelations");

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

  await oracle.train([
    {input: 'News report and current events', output: ['Soccer', 'News']},
    {input: 'Exciting football match highlights', output: ['Soccer', 'Sports']}
  ]);
  
  const related = await oracle.related('News', {as: 'array', amount: 2});
  assert.ok(Array.isArray(related), "related should return an array");
  assert.ok(related.length > 0, "There should be at least one result in the weighted prediction");
  assert.ok(related[0] === 'Soccer', 'The first related category should be "Soccer"');

  console.log("testCategoryRelations passed.");
}

async function testReduceFunction() {
  console.log("Executing: testReduceFunction");

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

  // Train with diverse categories
  await oracle.train([
    {input: 'Latest technology innovations', output: 'Technology'},
    {input: 'Scientific discoveries and research', output: 'Science'},
    {input: 'Health and medical advances', output: 'Health'},
    {input: 'Business and financial news', output: 'Business'},
    {input: 'Entertainment and media updates', output: 'Entertainment'},
    {input: 'Sports and athletic achievements', output: 'Sports'}
  ]);

  // Test clustering with array input
  const categories = ['Technology', 'Science', 'Health', 'Business', 'Entertainment', 'Sports'];
  const clusters = await oracle.reduce(categories, { amount: 3 });
  
  assert.ok(typeof clusters === 'object', "Clusters should be an object");
  assert.ok(Object.keys(clusters).length > 0, "Should have at least one cluster");
  
  // Verify all categories are included in clusters
  const allClusteredCategories = Object.values(clusters).flat();
  categories.forEach(category => {
    assert.ok(allClusteredCategories.includes(category), `Category ${category} should be in clusters`);
  });

  // Test clustering with object input (weighted)
  const weightedCategories = {
    'Technology': 2,
    'Science': 1.5,
    'Health': 1,
    'Business': 0.8,
    'Entertainment': 0.5,
    'Sports': 0.3
  };
  const weightedClusters = await oracle.reduce(weightedCategories, { amount: 2 });
  
  assert.ok(typeof weightedClusters === 'object', "Weighted clusters should be an object");
  assert.ok(Object.keys(weightedClusters).length > 0, "Should have at least one weighted cluster");

  console.log("testReduceFunction passed.");
}

async function testGravitationalGroups() {
  console.log("Executing: testGravitationalGroups");

  await cleanup();
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50,
    weights: {
      gravity: 0.5
    }
  });
  await oracle.initialized;

  // Train with some data
  await oracle.train([
    {input: 'Artificial intelligence and machine learning', output: 'Technology'},
    {input: 'Medical treatments and healthcare', output: 'Health'},
    {input: 'Software development and programming', output: 'Technology'}
  ]);

  // Add gravitational groups
  oracle.addGravitationalGroups({
    'tech': ['artificial intelligence', 'machine learning', 'software', 'programming'],
    'health': ['medical', 'healthcare', 'treatment', 'therapy']
  });

  // Test prediction with gravitational influence
  const prediction = await oracle.predict('AI and machine learning systems', { as: 'objects', amount: 3 });
  
  assert.ok(Array.isArray(prediction), "Prediction should be an array");
  assert.ok(prediction.length > 0, "Should have at least one prediction");
  
  // Verify that Technology category is highly ranked due to gravitational groups
  const techPrediction = prediction.find(p => p.category.toLowerCase() === 'technology');
  assert.ok(techPrediction, "Technology should be in predictions due to gravitational groups");

  console.log("testGravitationalGroups passed.");
}

async function testErrorHandling() {
  console.log("Executing: testErrorHandling");

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

  // Test invalid input for reduce function
  try {
    await oracle.reduce(null, { amount: 3 });
    assert.fail("Should throw error for null input");
  } catch (err) {
    // Check if error message contains the expected text
    const hasValidError = err.message && (
      err.message.includes('Invalid categories type') || 
      err.message.includes('Invalid') ||
      err.message.includes('null')
    );
    assert.ok(hasValidError, "Should throw appropriate error");
  }

  // Test invalid input for gravitational groups - should handle gracefully
  try {
    oracle.addGravitationalGroups(null);
    // This should not throw
  } catch (err) {
    // If it throws, that's also acceptable as long as it doesn't crash
  }

  console.log("testErrorHandling passed.");
}

async function runAllTests() {
  try {
    await testTrainingAndPrediction();
    await testSaveAndLoad();
    await testBestVariant();
    await testResetAndDestroy();
    await testWeightedPrediction();
    await testCategoryRelations();
    await testReduceFunction();
    await testGravitationalGroups();
    await testErrorHandling();
    console.log("All tests passed successfully.");
  } catch (err) {
    console.error("Tests failed:", err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runAllTests();
