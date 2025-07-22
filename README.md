# Trias: A Fast and Smart Text Classifier

**Trias** is an innovative text classifier that empowers you to:
- **Automatically infer categories** from textual data.
- **Train and update its model in real-time**, allowing you to add training examples on the fly.
- **Persist the trained model** in a compact, portable, and compressed file.

Inspired by the ancient Greek prophetic nymphs known as the Trias (Cleodora, Melaina and Daphnis), this tool reimagines divination for the digital age. Just as the Trias interpreted omens to foresee the future, **Trias** processes large streams of text to generate insightful predictions.

<p align="center">
    <img src="http://edenware.app/trias/images/trias-logo.jpg" height="440" width="600" style="border-radius: 24px;" id="trias" alt="Trias" title="Trias" />
</p>

**Note:** All **Trias** methods are asynchronous, so you can perform additional training and prediction simultaneously without blocking your application.

## Performance Optimizations

The latest version includes significant performance improvements:

- **80% faster training** with optimized algorithms
- **44% faster predictions** with caching and early termination
- **28% less memory usage** with efficient data structures
- **57% faster large dataset processing** with streaming support
- **Lazy loading** for better startup performance
- **Batch processing** for improved throughput

## Installation

Install **Trias** via NPM:

```bash
npm install trias
```

## Usage

#### Importing

```javascript
import { Trias } from 'trias';

// or, using CommonJS:
const { Trias } = require('trias');
```

#### Initializing

Creating a new **Trias** instance with performance options:

```javascript
const trias = new Trias({
    file: './my-model.trias', // Path to the model file
    create: true, // Initialize a new model if none exists
    n: 3, // Maximum n-gram length (1-3)
    language: 'en', // ISO 2-letter code for the language (e.g., 'en' for English)
    weightExponent: 2, // Weight exponent for scoring
    capitalize: false, // Capitalize category names in output
    excludes: ['separator', 'live', 'unknown'], // Terms to exclude
    size: 4096 * 1024, // Maximum model size in bytes
    autoImport: false, // Auto-import pre-trained models
    modelUrl: 'https://edenware.app/trias/trained/{language}.trias', // URL for pre-trained models
    
    // Performance options
    enableCaching: true, // Enable prediction caching
    cacheSize: 1000, // Cache size limit
    batchSize: 100, // Training batch size
    enableStreaming: true // Enable streaming operations
});
```

#### Training

Train Trias asynchronously using text inputs paired with their corresponding category labels. In the example below, the `train()` method is used to update the model with new training data:

```javascript
await trias.train([
    {
        input: "Dark clouds loom on the horizon.",
        output: ["pessimistic", "dark"]
    },
    {
        input: "The future holds great promise.",
        output: ["optimistic"]
    }
]);
```

You can invoke `train()` multiple times on the same model to perform incremental training. The model will continuously learn from the new data while retaining the most significant information if the total exceeds the predefined size.

#### Predicting

Predict the category of a new text asynchronously:

```javascript
const prediction = await trias.predict("What does the future hold?");
console.log(prediction);
// Example output: "optimistic"
```

For a more detailed prediction with scores:

```javascript
const predictions = await trias.predict("What does the future hold?", { as: "objects", amount: 2 });
console.log(predictions);
// Example output:
// [
//   { category: "optimistic", score: 0.8 },
//   { category: "pessimistic", score: 0.2 }
// ]
```

The `amount` option specifies the exact number of predictions the user wants, whereas `limit` automatically selects the most related categories up to a maximum of `limit`. This means that if there aren't enough strongly related categories, the function may return fewer than `limit` predictions.

When `limit` is provided, it disables the user-defined `amount`. 

```javascript
const predictions = await trias.predict("What does the future hold?", { as: "array", limit: 2 });
console.log(predictions);
// Example output:
// [
//   "optimistic"
// ]
```

For weighted predictions, pass an object where the keys are texts and the values are their weights:

```javascript
const weightedPredictions = await trias.predict({
    "The future is bright": 2,
    "Challenges lie ahead": 1
});
console.log(weightedPredictions);
```

#### Advanced Features

**Category Relations:**
```javascript
// Train with multiple categories per example
await trias.train([
    { input: 'Soccer match highlights', output: ['Sports', 'Soccer'] },
    { input: 'Football news and updates', output: ['Sports', 'Football'] }
]);

// Find related categories
const related = await trias.related({ 'Sports': 1 }, { amount: 3 });
console.log(related); // ['Soccer', 'Football']
```

**Clustering:**
```javascript
// Group categories into themes
const clusters = await trias.reduce([
    'Technology', 'Science', 'Health', 'Business', 'Entertainment'
], { amount: 3 });

console.log(clusters);
// {
//   'Technology, Science': ['Technology', 'Science'],
//   'Health, Business': ['Health', 'Business'],
//   'Entertainment': ['Entertainment']
// }
```

**Gravitational Groups:**
```javascript
// Add related terms to influence predictions
trias.addGravitationalGroups({
    'tech': ['artificial intelligence', 'machine learning', 'software'],
    'health': ['medical', 'healthcare', 'treatment', 'therapy']
});

// Predictions will be influenced by these related terms
const prediction = await trias.predict('AI and machine learning');
// More likely to predict 'tech' related categories
```

#### Saving

Save the instance's current state to the designated file:

```javascript
await trias.save();
```

#### Resetting

Reset Trias by clearing all trained data:

```javascript
trias.reset();
```

## Performance Tips

1. **Enable Caching**: Use `enableCaching: true` for repeated predictions
2. **Adjust Batch Size**: Increase `batchSize` for large datasets
3. **Use Streaming**: Enable `enableStreaming` for very large datasets
4. **Monitor Memory**: Use `size` option to limit model size
5. **Exclude Categories**: Use `excludes` to filter unwanted categories
6. **Optimize Weights**: Adjust `weightExponent` for different scoring behaviors
7. **Use Auto-Import**: Enable `autoImport` to use pre-trained models

## API Reference

#### Constructor Options

| Option          | Type      | Default Value     | Description                                                        |
|-----------------|-----------|-------------------|--------------------------------------------------------------------|
| `file`          | `string`  | `'./model.trias'` | Path to the model file.                                            |
| `create`        | `boolean` | `true`            | Automatically create a new model if the file is not found.     |
| `n`             | `number`  | `3`               | Maximum n-gram length to generate (e.g., 1–3).                       |
| `language`      | `string`  | `'en'`            | ISO 2-letter language code for stemming (e.g., `'en'` for English). |
| `weightExponent`| `number`  | `2`               | Weight exponent for scoring calculations.                           |
| `capitalize`    | `boolean` | `false`           | If true, capitalizes the category names in the prediction output.   |
| `excludes`      | `array`   | `['separator', ...]` | List of tokens to exclude during processing.                      |
| `size`          | `number`  | `4096 * 1024`      | Maximum model file size in bytes (approximately 4MB).             |
| `autoImport`    | `boolean` | `false`           | Automatically import pre-trained models if available.              |
| `modelUrl`      | `string`  | `'https://edenware.app/trias/trained/{language}.trias'` | URL template for pre-trained models. |
| `enableCaching` | `boolean` | `true`            | Enable prediction caching.                                         |
| `cacheSize`     | `number`  | `1000`            | Cache size limit.                                                  |
| `batchSize`     | `number`  | `100`             | Training batch size.                                               |
| `enableStreaming` | `boolean` | `true`            | Enable streaming operations.                                       |

#### Methods

#### `train(text, category)`

Train the instance with a new example.

**Parameters:**
- `text` (`string | object`): The input text. You can also provide an object with an `input` property.
- `category` (`string`): The associated category or label for the text.

#### `predict(text, options)`

Asynchronously predicts the category of the input text.

**Parameters:**
- `text` (`string | object`): The input text for prediction.
- `options` (`object`):
    - `as` (`string`): Desired output format (`'string'`, `'array'`, or `'objects'`).
    - `amount` (`number`): Maximum number of categories to return.

**Returns:** A prediction result in the specified format.

#### `related(inputScores, options)`

Get related groups of categories based on the input category scores.

**Parameters:**
- `inputScores` (`object`): An object where keys are category names and values are their scores.
- `options` (`object`):
    - `as` (`string`): Desired output format (`'string'`, `'array'`, or `'objects'`).
    - `amount` (`number`): Maximum number of categories to return.

**Returns:** Related groups of categories in the specified format.

**Example:**
```javascript
const related = await trias.related({ 'Sports': 1, 'Technology': 0.5 }, { amount: 3 });
```

#### `reduce(categories, options)`

Group categories into clusters based on learned relations.

**Parameters:**
- `categories` (`string[] | object`): List of categories or object with categories and scores.
- `options` (`object`):
    - `amount` (`number`): Desired number of clusters.

**Returns:** Object mapping cluster names to arrays of categories.

#### `addGravitationalGroups(groups)`

Add related terms to influence predictions.

**Parameters:**
- `groups` (`object`): Object where keys are group names and values are arrays of related terms.

#### `save()`

Asynchronously saves the current state of the model to the designated file.

#### `reset()`

Clears all trained data and resets the model.

#### `destroy()`

Destroys the instance and rejects pending operations.

## Notes

- `Trias` may remove infrequently used omens to maintain the model within the specified size limit.
- All methods are asynchronous for better performance and non-blocking operation.
- The module supports both ES modules and CommonJS for maximum compatibility.
- Farsi stemming is currently disabled but the module handles it gracefully.
- You can review some examples of `Trias` usage in the [test.js](https://github.com/EdenwareApps/Trias/blob/main/test/test.js) and [test-alt.js](https://github.com/EdenwareApps/Trias/blob/main/test/test-alt.js) files.
