import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';

// Enhanced usage example
(async () => {
  try {
    // Remove the model file if it exists (ignore errors)
    const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
    const modelFile = path.join(__dirname, 'model.trias');
    await fs.unlink(modelFile).catch(() => {});
    
    // Create a new Trias instance with the model file, using Portuguese language and capitalized output
    const oracle = new Trias({
      file: modelFile,
      language: 'en',
      capitalize: true,
      autoImport: false,
      modelUrl: 'https://edenware.app/trias/trained/{language}.trias',
      size: 512 * 1024 // 512kb
    });

    (async function runTest() {
      console.log('Training model...');
      await oracle.train([
        {input: 'News Broadcast reporting the latest news of the day', output: 'News'},
        {input: 'Live Football, incredible play and full coverage', output: 'Sports'},
        {input: 'Latest in technology and revolutionary gadgets', output: 'Technology'},
        {input: 'Film review: Cinema on Screen with excellent critiques', output: 'Entertainment'},
        {input: 'Health tips for a better and more active life', output: 'Health'},
        {input: 'Intense political debate in the National Congress', output: 'Politics'},
        {input: 'Analysis of the financial market and current business', output: 'Economy'},
        {input: 'Incredible travel destinations to explore the world', output: 'Travel'},
        {input: 'Live musical show with renowned bands', output: 'Music'},
        {input: 'Scientific discoveries that change the world', output: 'Science'},
        {input: 'Documentary: Stories from the Past told in a unique way', output: 'History'},
        {input: 'Express Cooking recipes and tips for quick cooking', output: 'Cooking'},
        {input: 'Complete coverage of Auto Sports with detailed analyses', output: 'Sports'}        
      ])

      await oracle.save();

      // Define a set of test samples with texts and their expected labels
      const challenges = [
        // test samples should be in english, use same categories as the training samples but with different words
        {text: 'Latest news of the day', expected: 'News'},
        {text: 'Incredible play and full coverage of football', expected: 'Sports'},
        {text: 'Revolutionary gadgets and latest technology', expected: 'Technology'},
        {text: 'Excellent critiques of Cinema on Screen', expected: 'Entertainment'},
        {text: 'Better and more active life with health tips', expected: 'Health'},
        {text: 'Intense political debate in the National Congress', expected: 'Politics'},
        {text: 'Analysis of the financial market and current business', expected: 'Economy'},
        {text: 'Incredible travel destinations to explore the world', expected: 'Travel'},
        {text: 'Live musical show with renowned bands', expected: 'Music'},
        {text: 'Scientific discoveries that change the world', expected: 'Science'},
        {text: 'Documentary: Stories from the Past told in a unique way', expected: 'History'},
        {text: 'Express Cooking recipes and tips for quick cooking', expected: 'Cooking'},
        {text: 'Complete coverage of Auto Sports with detailed analyses', expected: 'Sports'}        
      ];

      console.log('\nPredicting on test samples...\n');
      let correctCount = 0;
      const results = [];

      for (const challenge of challenges) {
        const prediction = await oracle.predict(challenge.text);
        if (prediction && prediction.toLowerCase() === challenge.expected.toLowerCase()) {
          correctCount++;
          results.push({
            expected: challenge.expected,
            predicted: prediction,
            result: 'CORRECT'
          });
        } else {
          results.push({
            expected: challenge.expected,
            predicted: prediction,
            result: 'INCORRECT'
          });
        }
      }

      const precision = (correctCount / challenges.length) * 100;
      console.log('\nTest results\n');
      console.table(results);
      console.log(`\nOverall test precision: ${precision.toFixed(2)}%`);

      const modelSize = (oracle.size / 1024).toFixed(2) + ' kb';
      console.log(`\nEstimated model size: ${modelSize}`, oracle.size);

      const testWeighted = await oracle.predict({
        'News Broadcast reporting the latest news of the day': 0.1,
        'Live Football, incredible play and full coverage': 1
      }, {as: 'objects', amount: 5});
      console.log('\nPredict on test sample with weighted probabilities\n');
      console.table(testWeighted);
    })();
  } catch (error) {
    console.error('Error during process:', error);
  }
})();
