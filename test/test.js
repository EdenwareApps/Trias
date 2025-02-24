import { Trias } from "../src/trias.js";
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
      capitalize: true
    });

    (async function runTest() {
      console.log('Training model...');
      await Promise.allSettled([
        oracle.learn('Aqui Agora', 'News'),
        oracle.learn('Telejornal reporting the day\'s news', 'News'),
        oracle.learn('Total Sports', 'Sports'),
        oracle.learn('Tech Today', 'Technology'),
        oracle.learn('World in Focus', 'News'),
        oracle.learn('Live Football', 'Sports'),
        oracle.learn('Cinema on Screen', 'Entertainment'),
        oracle.learn('Fashion Showcase', 'Entertainment'),
        oracle.learn('Living Culture', 'Culture'),
        oracle.learn('Health Today', 'Health'),
        oracle.learn('Eco News', 'News'),
        oracle.learn('Intense political debate in Congress', 'Politics'),
        oracle.learn('Business World', 'Economy'),
        oracle.learn('Travel and Destinations', 'Travel'),
        oracle.learn('Live Musical Show', 'Music'),
        oracle.learn('Game World', 'Technology'),
        oracle.learn('Science Today', 'Science'),
        // Note: Extra third parameter in these calls is maintained as in the original script
        oracle.learn('Stories from the Past', 'History', 'Documentary'),
        oracle.learn('Animal World', 'News'),
        oracle.learn('Express Cooking', 'Cooking'),
        oracle.learn('Auto Sports', 'Sports', 'Technology')
      ]);

      await oracle.save();

      // Define a set of test samples with texts and their expected labels
      const testSamples = [
        { text: 'News Broadcast reporting the latest news of the day', expected: 'News' },
        { text: 'Live Football, incredible play and full coverage', expected: 'Sports' },
        { text: 'Latest in technology and revolutionary gadgets', expected: 'Technology' },
        { text: 'Film review: Cinema on Screen with excellent critiques', expected: 'Entertainment' },
        { text: 'Health tips for a better and more active life', expected: 'Health' },
        { text: 'Intense political debate in the National Congress', expected: 'Politics' },
        { text: 'Analysis of the financial market and current business', expected: 'Economy' },
        { text: 'Incredible travel destinations to explore the world', expected: 'Travel' },
        { text: 'Live musical show with renowned bands', expected: 'Music' },
        { text: 'Scientific discoveries that change the world', expected: 'Science' },
        { text: 'Documentary: Stories from the Past told in a unique way', expected: 'History' },
        { text: 'Express Cooking recipes and tips for quick cooking', expected: 'Cooking' },
        { text: 'Complete coverage of Auto Sports with detailed analyses', expected: 'Sports' }
      ];

      console.log('\nPredicting on test samples...\n');
      let correctCount = 0;
      const results = [];

      for (const sample of testSamples) {
        const predictions = await oracle.predict(sample.text);
        
        // Assume the top prediction is the first element in the sorted results
        const topPrediction = predictions.shift();

        if (topPrediction && topPrediction.category.toLowerCase() === sample.expected.toLowerCase()) {
          correctCount++;
          results.push({
            expected: sample.expected,
            predicted: topPrediction.category,
            result: 'CORRECT'
          });
        } else {
          results.push({
            expected: sample.expected,
            predicted: topPrediction.category,
            result: 'INCORRECT'
          });
        }
      }

      const precision = (correctCount / testSamples.length) * 100;
      console.log('\nTest results\n');
      console.table(results);
      console.log(`\nOverall test precision: ${precision.toFixed(2)}%`);

      const modelSize = (await oracle.size() / 1024).toFixed(2) + ' kb';
      const modelSize2 = (await oracle.size(true) / 1024).toFixed(2) + ' kb';
      console.log(`\nEstimated model size: ${modelSize}`);
      console.log(`\nActual model size: ${modelSize2}`);

      const testWeighted = await oracle.predictW({
        'News Broadcast reporting the latest news of the day': 0.1,
        'Live Football, incredible play and full coverage': 1
      });
      console.log('\nPredict on test sample with weighted probabilities\n');
      console.table(testWeighted);
    })();
  } catch (error) {
    console.error('Error during process:', error);
  }
})();
