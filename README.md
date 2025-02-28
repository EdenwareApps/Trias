# Trias: A Fast and Smart Text Classifier

**Trias** is an innovative text classifier that empowers you to:
- **Automatically infer categories** from textual data.
- **Train and update its model in real-time**, allowing you to add training examples on the fly.
- **Persist the trained model** in a compact, portable, and compressed file.

Inspired by the ancient Greek prophetic nymphs known as the Trias (Cleodora, Melaina and Daphnis), this tool reimagines divination for the digital age. Just as the Trias interpreted omens to foresee the future, Trias processes large streams of text to generate insightful predictions.

<p align="center">
    <img src="http://edenware.app/trias/images/trias-logo.jpg" height="440" width="600" style="border-radius: 24px;" id="trias" alt="Trias" title="Trias" />
</p>


**Note:** All Trias methods are asynchronous, so you can perform additional training and prediction simultaneously without blocking your application.

<br />  

## Installation
  

Install Trias via NPM:
  

```bash

npm install trias

```

<br />

## Usage

  

#### Importing

  

```javascript

import { Trias } from 'trias';

// or, using CommonJS:
const { Trias } = require('trias');

```

  

#### Initializing

Creating a new `Trias` instance.

```javascript

const trias = new Trias({

    file: './my-model.trias', // Path to the model file
    create: true, // Initialize a new model if none exists
    n: 3, // Maximum n-gram length (1-3)
    language: 'en', // ISO 2-letter code for the language (e.g., 'en' for English)
    excludes: ['separator', 'live', 'unknown'], // Terms to exclude
    size: 4096 * 1024 // Maximum model size in bytes

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

<br />
  
#### Predicting

Predict the category of a new text asynchronously:

```javascript
const prediction = await trias.predict("What does the future hold?");
console.log(prediction);
// Example output: "optimistic"
```
For a more detailed prediction with scores:

```javascript
const predictions = await trias.predict("What does the future hold?", { as: "objects", limit: 2 });
console.log(predictions);
// Example output:
// [
//   { category: "optimistic", score: 0.8 },
//   { category: "pessimistic", score: 0.2 }
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

<br />  

#### Saving

Save the instance's current state to the designated file:


```javascript

await trias.save();

```

<br />

#### Resetting

Reset Trias by clearing all trained data:


```javascript

trias.reset();

```

<br />

## API Reference

#### Constructor Options

| Option          | Type      | Default Value     | Description                                                        |
|-----------------|-----------|-------------------|--------------------------------------------------------------------|
| `file`          | `string`  | `'./model.trias'` | Path to the model file.                                            |
| `create`        | `boolean` | `true`            | Automatically create a new model if the file is not found.     |
| `n`             | `number`  | `3`               | Maximum n-gram length to generate (e.g., 1–3).                       |
| `language`      | `string`  | `'en'`            | ISO 2-letter language code for stemming (e.g., `'en'` for English). |
| `capitalize`    | `boolean` | `false`           | If true, capitalizes the category names in the prediction output.   |
| `excludes`      | `array`   | `['separator', ...]` | List of tokens to exclude during processing.                      |
| `size`          | `number`  | `4096 * 1024`      | Maximum model file size in bytes (approximately 4MB).             |

<br />

#### Methods
<br />

#### `train(text, category)`

Train the instance with a new example.

**Parameters:**
- `text` (`string | object`): The input text. You can also provide an object with an `input` property.
- `category` (`string`): The associated category or label for the text.

<br />

#### `predict(text, options)`

Asynchronously predicts the category of the input text using a TF-IDF approach.

**Parameters:**
- `text` (`string | object`): The input text for prediction.
- `options` (`object`):
    - `as` (`string`): Desired output format (`'string'`, `'array'`, or `'objects'`).
    - `limit` (`number`): Maximum number of categories to return.

**Returns:** A prediction result in the specified format.

<br />  

#### `getRelatedGroups(categoryScores, options)`

Get related groups of categories based on the input category scores.

**Parameters:**
- `categoryScores` (`object`): An object where keys are category names and values are their scores.
- `options` (`object`):
    - `as` (`string`): Desired output format (`'string'`, `'array'`, or `'objects'`).
    - `limit` (`number`): Maximum number of categories to return.

**Returns:** Related groups of categories in the specified format.
<br />  

#### `save()`

Asynchronously saves the current state of the model to the designated file.

<br />  

#### `reset()`

Clears all trained data and resets the model.

<br /> 

## Notes

- `Trias` removes infrequently used omens to maintain the model within the specified size limit.
