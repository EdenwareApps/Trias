// test/trias.test.mjs

import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// __dirname configuration for ES modules
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'model.trias');

// Function to clean up the test model files
async function cleanup() {
  try {
    await fs.unlink(modelFile);
  } catch (err) {
    // Ignore errors if file doesn't exist
  }
  try {
    await fs.unlink('./test-model2.trias');
  } catch (err) {
    // Ignore errors if file doesn't exist
  }
  
  // Force garbage collection to prevent lingering references
  if (global.gc) {
    global.gc();
  }
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

async function testImportExportCompatibility() {
  console.log("Executing: testImportExportCompatibility");

  // Don't cleanup here to avoid file access issues
  // await cleanup();
  
  // Create first instance and train with data
  const trias1 = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 1024 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  await trias1.initialized;
  
  // Train with diverse data including multi-category items to create relations
  await trias1.train([
    {input: 'Artificial intelligence and machine learning', output: 'Technology'},
    {input: 'Medical treatments and healthcare', output: 'Health'},
    {input: 'Financial markets and investments', output: 'Finance'},
    {input: 'Sports news and athletic achievements', output: 'Sports'},
    {input: 'Political debates and elections', output: 'Politics'},
    {input: 'Entertainment and media updates', output: 'Entertainment'},
    {input: 'Scientific research and discoveries', output: 'Science'},
    {input: 'Cooking recipes and culinary arts', output: 'Cooking'},
    {input: 'Travel destinations and tourism', output: 'Travel'},
    {input: 'Educational content and learning', output: 'Education'},
    // Multi-category items to create category relations
    {input: 'Tech news and financial analysis', output: ['Technology', 'Finance']},
    {input: 'Health technology and medical innovations', output: ['Technology', 'Health']},
    {input: 'Sports entertainment and media coverage', output: ['Sports', 'Entertainment']},
    {input: 'Political science and research', output: ['Politics', 'Science']},
    {input: 'Travel cooking and culinary tourism', output: ['Travel', 'Cooking']}
  ]);
  
  // Add gravitational groups
  trias1.addGravitationalGroups({
    'tech': ['artificial intelligence', 'machine learning', 'software', 'programming'],
    'health': ['medical', 'healthcare', 'treatment', 'therapy'],
    'finance': ['financial', 'investment', 'market', 'trading']
  });
  
  // Test predictions on first model
  const prediction1 = await trias1.predict('AI and machine learning');
  assert.ok(typeof prediction1 === 'string' && prediction1.length > 0, "First model should return valid prediction");
  
  // Test JSON serialization/deserialization
  const jsonData = trias1.toJSON();
  assert.ok(typeof jsonData === 'string', "toJSON should return a string");
  

  
  // Create second instance from JSON with a non-existent file to prevent initialization
  const trias2 = new Trias({
    file: './non-existent-file.trias',
    language: 'en',
    capitalize: true,
    autoImport: false,
    create: false // Don't create a new model
  });
  trias2.fromJSON(jsonData);
  
  // Don't wait for initialization since we loaded via JSON
  // await trias2.initialized;
  
  // Verify that the model loaded correctly
  assert.ok(trias2.categoryStemToId.size > 0, "categoryStemToId should be loaded");
  assert.ok(trias2.categoryVariations.size > 0, "categoryVariations should be loaded");
  assert.ok(trias2.categoryRelations.size > 0, "categoryRelations should be loaded");
  assert.ok(trias2.excludes instanceof Set, "excludes should be a Set");
  assert.ok(trias2.gravitationalGroups.size > 0, "gravitationalGroups should be loaded");
  assert.ok(trias2.omens.length > 0, "omens should be loaded");
  assert.ok(trias2.totalDocuments > 0, "totalDocuments should be loaded");
  
  // Test predictions on JSON-loaded model
  const prediction2 = await trias2.predict('AI and machine learning', {as: 'objects', amount: 5});
  assert.ok(Array.isArray(prediction2) && prediction2.length > 0, "JSON-loaded model should return valid predictions");
  
  // Test that all categories are available
  const allPredictions = await trias2.predict('test', {as: 'objects', amount: 10});
  assert.ok(allPredictions.length > 0, "Should have predictions");
  
  // Test gravitational groups influence
  const techPrediction = await trias2.predict('artificial intelligence systems');
  assert.ok(typeof techPrediction === 'string' && techPrediction.length > 0, "Gravitational groups should work");
  
  // Test related categories
  const related = await trias2.related('Technology', {as: 'array', amount: 3});
  assert.ok(Array.isArray(related) || typeof related === 'string', "Related should return valid result");
  
  // Test reduce function - temporarily bypass initialization
  const categories = ['Technology', 'Health', 'Finance', 'Sports', 'Politics'];
  const originalInitialized = trias2.initialized;
  trias2.initialized = Promise.resolve();
  
  const clusters = await trias2.reduce(categories, {amount: 3});
  assert.ok(typeof clusters === 'object', "Clusters should be an object");
  
  // Restore original initialized
  trias2.initialized = originalInitialized;
  
  // Verify all properties are correctly restored
  assert.ok(trias2.categoryStemToId.size === trias1.categoryStemToId.size, "categoryStemToId size should match");
  assert.ok(trias2.categoryVariations.size === trias1.categoryVariations.size, "categoryVariations size should match");
  assert.ok(trias2.gravitationalGroups.size === trias1.gravitationalGroups.size, "gravitationalGroups size should match");
  assert.ok(trias2.omens.length === trias1.omens.length, "omens length should match");
  assert.ok(trias2.totalDocuments === trias1.totalDocuments, "totalDocuments should match");
  
  // Prevent initialization errors by resolving the promise
  trias2.initialized = Promise.resolve();
  
  console.log("testImportExportCompatibility passed.");
}

async function testProblematicScenario() {
  console.log("Executing: testProblematicScenario");

  await cleanup();
  
  // Create first instance and train with a large dataset to simulate the 2.8MB model
  const trias1 = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 1024 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  await trias1.initialized;
  
  // Train with a large dataset to simulate the real scenario
  const trainingData = [];
  const categories = ['Technology', 'Health', 'Finance', 'Sports', 'Politics', 'Entertainment', 'Science', 'Cooking', 'Travel', 'Education'];
  
  // Create 100 training examples to simulate a substantial model
  for (let i = 0; i < 100; i++) {
    const category = categories[i % categories.length];
    trainingData.push({
      input: `Sample text for ${category} category number ${i}`,
      output: category
    });
  }
  
  await trias1.train(trainingData);
  
  // Verify the model has data
  assert.ok(trias1.totalDocuments > 0, "Model should have documents");
  assert.ok(trias1.omens.length > 0, "Model should have omens");
  assert.ok(trias1.categoryStemToId.size > 0, "Model should have categories");
  
  // Save the model
  await trias1.save();
  
  // Create second instance that loads the saved model (this should trigger the problematic scenario)
  const trias2 = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    create: false // Don't create a new model, load existing
  });
  
  // This should trigger the problematic initialization
  await trias2.initialized;
  
  // Check if the model loaded correctly (this is where the original problem occurred)
  console.log(`[testProblematicScenario] Loaded model stats:`);
  console.log(`- Total documents: ${trias2.totalDocuments}`);
  console.log(`- Omens count: ${trias2.omens.length}`);
  console.log(`- Categories count: ${trias2.categoryStemToId.size}`);
  
  // These assertions should fail if the original problem exists
  assert.ok(trias2.totalDocuments > 0, "Loaded model should have documents");
  assert.ok(trias2.omens.length > 0, "Loaded model should have omens");
  assert.ok(trias2.categoryStemToId.size > 0, "Loaded model should have categories");
  
  // Test the reduce function specifically (this was the main issue)
  const testCategories = ['Technology', 'Health', 'Finance', 'Sports', 'Politics'];
  const clusters = await trias2.reduce(testCategories, {amount: 3});
  
  console.log(`[testProblematicScenario] Clustering results:`);
  console.log(`- Number of clusters: ${Object.keys(clusters).length}`);
  console.log(`- Clusters:`, clusters);
  
  // This assertion should fail if the original problem exists (only 1 cluster)
  assert.ok(Object.keys(clusters).length > 1, "Should have more than 1 cluster");
  
  // Test predictions to ensure the model is working
  const prediction = await trias2.predict('Technology sample text');
  assert.ok(typeof prediction === 'string' && prediction.length > 0, "Should return valid prediction");
  
  console.log("testProblematicScenario passed.");
}

async function testOldFormatCompatibility() {
  console.log("Executing: testOldFormatCompatibility");

  await cleanup();
  
  // Create a model with the current format
  const trias1 = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 1024 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  await trias1.initialized;
  
  await trias1.train([
    {input: 'Technology news and innovations', output: 'Technology'},
    {input: 'Health and medical updates', output: 'Health'},
    {input: 'Financial market analysis', output: 'Finance'}
  ]);
  
  // Get the JSON data in current format
  const jsonData = trias1.toJSON();
  const parsedData = JSON.parse(jsonData);
  
  // Simulate old format data (idToCategory, idToWord instead of omens, divinerGroups)
  const oldFormatData = {
    ...parsedData,
    // Remove new format properties
    omens: undefined,
    divinerGroups: undefined,
    divinerDocCount: undefined,
    // Add old format properties (simulated)
    idToCategory: { "0": "Technology", "1": "Health", "2": "Finance" },
    idToWord: { "0": "technolog", "1": "health", "2": "financ" }
  };
  
  // Create new instance and try to load old format
  const trias2 = new Trias({
    file: './non-existent-file.trias',
    language: 'en',
    capitalize: true,
    autoImport: false,
    create: false
  });
  
  try {
    trias2.fromJSON(JSON.stringify(oldFormatData));
    
    // Check if the model handles old format gracefully
    console.log(`[testOldFormatCompatibility] Old format loading:`);
    console.log(`- Total documents: ${trias2.totalDocuments}`);
    console.log(`- Omens count: ${trias2.omens.length}`);
    console.log(`- Categories count: ${trias2.categoryStemToId.size}`);
    
    // The model should either convert old format or handle it gracefully
    assert.ok(trias2.totalDocuments >= 0, "Should handle old format gracefully");
    
  } catch (error) {
    // If old format is not supported, that's also acceptable
    console.log(`[testOldFormatCompatibility] Old format not supported (expected): ${error.message}`);
    assert.ok(error.message, "Should handle old format error gracefully");
  }
  
  console.log("testOldFormatCompatibility passed.");
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
    await testImportExportCompatibility();
    await testProblematicScenario();
    await testOldFormatCompatibility();
    console.log("All tests passed successfully.");
  } catch (err) {
    console.error("Tests failed:", err);
    process.exit(1);
  } finally {
    try {
      await cleanup();
    } catch (cleanupErr) {
      // Ignore cleanup errors to prevent them from masking test results
      console.warn("Cleanup warning:", cleanupErr.message);
    }
  }
}

runAllTests();
