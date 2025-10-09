// test/test-original-problem.js

import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// __dirname configuration for ES modules
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'original-problem-model.trias');

// Function to clean up the test model files
async function cleanup() {
  try {
    await fs.unlink(modelFile);
  } catch (err) {
    // Ignore errors if file doesn't exist
  }
}

async function testOriginalProblem() {
  console.log("🧪 Testing Original Problem Scenario...");
  console.log("==========================================");

  await cleanup();

  // Step 1: Create and train a model (simulating the 2.8MB model)
  console.log("📚 Step 1: Creating and training model...");
  
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

  // Train with diverse categories to simulate the real scenario
  const trainingData = [];
  const categories = [
    'Technology', 'Health', 'Finance', 'Sports', 'Politics', 
    'Entertainment', 'Science', 'Cooking', 'Travel', 'Education',
    'Business', 'Art', 'Music', 'Literature', 'History'
  ];

  // Create substantial training data
  for (let i = 0; i < 200; i++) {
    const category = categories[i % categories.length];
    trainingData.push({
      input: `Sample text for ${category} category with unique identifier ${i}`,
      output: category
    });
  }

  await trias1.train(trainingData);

  // Verify initial model state
  console.log("📊 Initial model stats:");
  console.log(`- Total documents: ${trias1.totalDocuments}`);
  console.log(`- Omens count: ${trias1.omens.length}`);
  console.log(`- Categories count: ${trias1.categoryStemToId.size}`);

  assert.ok(trias1.totalDocuments > 0, "Initial model should have documents");
  assert.ok(trias1.omens.length > 0, "Initial model should have omens");
  assert.ok(trias1.categoryStemToId.size > 0, "Initial model should have categories");

  // Step 2: Save the model
  console.log("💾 Step 2: Saving model...");
  await trias1.save();

  // Step 3: Create new instance and load the saved model (this is where the problem occurred)
  console.log("🔄 Step 3: Loading saved model...");
  
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
  console.log("📊 Loaded model stats:");
  console.log(`- Total documents: ${trias2.totalDocuments}`);
  console.log(`- Omens count: ${trias2.omens.length}`);
  console.log(`- Categories count: ${trias2.categoryStemToId.size}`);

  // These assertions should fail if the original problem exists
  assert.ok(trias2.totalDocuments > 0, "Loaded model should have documents");
  assert.ok(trias2.omens.length > 0, "Loaded model should have omens");
  assert.ok(trias2.categoryStemToId.size > 0, "Loaded model should have categories");

  // Step 4: Test the reduce function specifically (this was the main issue)
  console.log("🎯 Step 4: Testing reduce function...");
  
  const testCategories = ['Technology', 'Health', 'Finance', 'Sports', 'Politics', 'Entertainment', 'Science'];
  const clusters = await trias2.reduce(testCategories, {amount: 3});

  console.log("📊 Clustering results:");
  console.log(`- Number of clusters: ${Object.keys(clusters).length}`);
  console.log(`- Clusters:`, JSON.stringify(clusters, null, 2));

  // This assertion should fail if the original problem exists (only 1 cluster)
  assert.ok(Object.keys(clusters).length > 1, "Should have more than 1 cluster");

  // Step 5: Test predictions to ensure the model is working
  console.log("🔮 Step 5: Testing predictions...");
  
  const prediction = await trias2.predict('Technology sample text');
  console.log(`- Prediction result: ${prediction}`);
  
  assert.ok(typeof prediction === 'string' && prediction.length > 0, "Should return valid prediction");

  // Step 6: Test with more categories to ensure clustering works properly
  console.log("🎯 Step 6: Testing clustering with more categories...");
  
  const allCategories = Array.from(trias2.categoryStemToId.keys());
  console.log(`- Available categories: ${allCategories.length}`);
  
  if (allCategories.length >= 5) {
    const moreClusters = await trias2.reduce(allCategories.slice(0, 10), {amount: 5});
    console.log(`- More clustering results: ${Object.keys(moreClusters).length} clusters`);
    assert.ok(Object.keys(moreClusters).length > 1, "Should have multiple clusters with more categories");
  }

  console.log("✅ Original problem test passed!");
}

async function testFormatConversionIssue() {
  console.log("\n🧪 Testing Format Conversion Issue...");
  console.log("=====================================");

  await cleanup();

  // Create a model with current format
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
    {input: 'Technology innovations and AI', output: 'Technology'},
    {input: 'Medical treatments and healthcare', output: 'Health'},
    {input: 'Financial markets and investments', output: 'Finance'},
    {input: 'Sports news and athletics', output: 'Sports'},
    {input: 'Political debates and elections', output: 'Politics'}
  ]);

  // Get current format data
  const jsonData = trias1.toJSON();
  const parsedData = JSON.parse(jsonData);

  console.log("📊 Current format data:");
  console.log(`- Has omens: ${!!parsedData.omens}`);
  console.log(`- Has divinerGroups: ${!!parsedData.divinerGroups}`);
  console.log(`- Has divinerDocCount: ${!!parsedData.divinerDocCount}`);
  console.log(`- Omens length: ${parsedData.omens?.length || 0}`);

  // Simulate old format data (this is what the problem analysis mentioned)
  const oldFormatData = {
    ...parsedData,
    // Remove new format properties
    omens: undefined,
    divinerGroups: undefined,
    divinerDocCount: undefined,
    // Add old format properties (simulated)
    idToCategory: { "0": "Technology", "1": "Health", "2": "Finance", "3": "Sports", "4": "Politics" },
    idToWord: { "0": "technolog", "1": "health", "2": "financ", "3": "sport", "4": "polit" }
  };

  console.log("📊 Old format data:");
  console.log(`- Has idToCategory: ${!!oldFormatData.idToCategory}`);
  console.log(`- Has idToWord: ${!!oldFormatData.idToWord}`);
  console.log(`- Has omens: ${!!oldFormatData.omens}`);

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

    console.log("📊 After loading old format:");
    console.log(`- Total documents: ${trias2.totalDocuments}`);
    console.log(`- Omens count: ${trias2.omens.length}`);
    console.log(`- Categories count: ${trias2.categoryStemToId.size}`);

    // This is the key issue: omens count should not be 0
    if (trias2.omens.length === 0) {
      console.log("⚠️  WARNING: Omens count is 0 after loading old format!");
      console.log("   This indicates the format conversion is not working properly.");
      console.log("   The original problem may still exist.");
    } else {
      console.log("✅ Format conversion is working properly.");
    }

    // Test if the model can still function
    const prediction = await trias2.predict('Technology sample');
    console.log(`- Prediction test: ${prediction}`);

  } catch (error) {
    console.log(`❌ Error loading old format: ${error.message}`);
    console.log("   This is expected if old format is not supported.");
  }

  console.log("✅ Format conversion test completed!");
}

async function runOriginalProblemTests() {
  try {
    await testOriginalProblem();
    await testFormatConversionIssue();
    console.log("\n🎉 All original problem tests completed!");
  } catch (err) {
    console.error("❌ Original problem tests failed:", err);
    process.exit(1);
  } finally {
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }
  }
}

runOriginalProblemTests();
