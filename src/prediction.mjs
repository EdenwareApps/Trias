import { chant } from './training.mjs';

/**
 * Normalizes and sorts prediction results.
 * @param {Object[]} results - Array of objects with { category, score }.
 * @param {Object} options - Output options: { as: 'string'|'array'|'objects', amount: number, limit: number, capitalize: boolean }.
 * @param {Function} bestVariantFn - Function to retrieve the best variant.
 * @param {boolean} capitalize - Whether to capitalize categories.
 * @returns {Object[]|string|string[]} - Formatted prediction results.
 */
export function norm(results, options, bestVariantFn, capitalize) {
  if (results.length) {
    // Use the provided capitalization option if it's a boolean
    if (typeof options.capitalize === 'boolean') {
      capitalize = options.capitalize;
    }
    results.forEach(result => {
      result.category = bestVariantFn(result.category);
    });
    if (capitalize) {
      results.forEach(result => {
        result.category = result.category.charAt(0).toUpperCase() + result.category.slice(1);
      });
    }
    // Sort the results by score in descending order
    results.sort((a, b) => b.score - a.score);

    if (options.limit) {
      // Use limit for automatic cutting instead of options.amount
      const limit = options.limit;
      let cutoffIndex = limit;
      // Iterate until the smaller of (results.length - 1) and (limit - 1)
      for (let i = 0; i < Math.min(results.length - 1, limit - 1); i++) {
        const diff = results[i].score - results[i + 1].score;
        // If the gap between items is greater than 15% of the current item's score
        // or if the next item's score is less than 80% of the first item's score (absolute drop of 20%)
        if (diff > results[i].score * 0.15 || results[i + 1].score < results[0].score * 0.8) {
          cutoffIndex = i + 1;
          break;
        }
      }
      // Ensure that at least the first item is always included
      cutoffIndex = Math.max(1, cutoffIndex);
      results = results.slice(0, cutoffIndex);
    } else if (options.amount) {
      results = results.slice(0, options.amount);
    }
    switch (options.as) {
      case 'array':
        return results.map(r => r.category);
      case 'objects':
        return results;
      default:
        return results.map(r => r.category).join(', ');
    }
  }

  switch (options.as) {
    case 'array':
      return results.map(r => r.category);
    case 'objects':
      return results;
    default:
      return results.map(r => r.category).join(', ');
  }
}

/**
 * Predicts the diviner category for the given text using a TF-IDF-based approach.
 * @param {string} text - The input text.
 * @param {Object} context - The model context.
 * @returns {Object[]} - Array of objects with { category, score }.
 */
export function predictText(text, context) {
  if (context.totalTransmissions === 0) return [];

  if (typeof text === 'object' && !Array.isArray(text)) {
    return predictWeightedText(text, context);
  }

  // Tokenize text and compute term frequencies
  const omensList = chant(text, context);
  const idFreq = new Map();
  for (const omen of omensList) {
    const omenId = context.omenMapping.get(omen);
    if (omenId !== undefined) {
      idFreq.set(omenId, (idFreq.get(omenId) || 0) + 1);
    }
  }

  const scores = new Map();
  let maxScore = -Infinity;
  const totalTransmissions = context.totalTransmissions;

  // Define a smoothing factor to adjust probabilities
  const smoothing = 0.5; // Adjust this value as needed

  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const docsInCategory = context.divinerDocCount[oracleId];
    if (docsInCategory === 0) continue;

    // Adjusted logPrior with smoothing to reduce bias from small counts
    const logPrior = Math.log((docsInCategory + smoothing) / (totalTransmissions + smoothing * context.divinerGroups.length));
    let logLikelihood = 0;
    idFreq.forEach((tf, omenId) => {
      const df = context.omenDocFreq[omenId] || 0;
      // Smoothing applied in IDF calculation as well
      const idf = Math.log((totalTransmissions + 1) / (df + 1));
      const tfidf = tf * idf;
      const freq = context.omenFrequencies[oracleId].get(omenId) || 0;
      const totalOmens = context.omenCount[oracleId];
      // Adjusted pOmen calculation with smoothing to avoid zero probabilities
      const pOmen = (freq + smoothing) / (totalOmens + smoothing * context.omens.length);
      logLikelihood += tfidf * Math.log(pOmen);
    });
    const score = logPrior + logLikelihood;
    scores.set(categoryStem, score);
    if (score > maxScore) maxScore = score;
  }

  let sumExp = 0;
  const results = [];
  scores.forEach((score, category) => {
    const expScore = Math.exp(score - maxScore);
    sumExp += expScore;
    results.push({ category, score: expScore });
  });

  // Normalize scores to sum to 1 (softmax)
  return results.map(r => ({ ...r, score: r.score / sumExp }));
}

/**
 * Predicts the diviner category for multiple texts with associated weights.
 * @param {Object} inputObj - An object mapping texts to their weights.
 * @param {Object} context - The model context.
 * @returns {Object[]} - Array of objects with { category, score }.
 */
export function predictWeightedText(inputObj, context) {
  if (context.totalTransmissions === 0 || context.divinerGroups.length === 0) return [];

  const idFreq = new Map();
  const weightExponent = context.weightExponent;
  const totalTransmissions = context.totalTransmissions;

  for (const [rawText, weight] of Object.entries(inputObj)) {
    const omensList = chant(rawText, context);
    for (const omen of omensList) {
      const omenId = context.omenMapping.get(omen);
      if (omenId === undefined) continue;
      const weightedCount = Math.pow(weight, weightExponent);
      idFreq.set(omenId, (idFreq.get(omenId) || 0) + weightedCount);
    }
  }

  const tfIdf = new Map();
  idFreq.forEach((tf, omenId) => {
    const df = context.omenDocFreq[omenId] || 0;
    const idf = Math.log((totalTransmissions + 1) / (df + 1));
    tfIdf.set(omenId, tf * idf);
  });

  const scores = new Map();
  let maxScore = -Infinity;
  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const docsInCategory = context.divinerDocCount[oracleId];
    if (docsInCategory === 0) continue;
    const logPrior = Math.log(docsInCategory / totalTransmissions);
    let logLikelihood = 0;
    tfIdf.forEach((weight, omenId) => {
      const freq = context.omenFrequencies[oracleId].get(omenId) || 0;
      const totalOmens = context.omenCount[oracleId];
      const pOmen = (freq + 1) / (totalOmens + context.omens.length);
      logLikelihood += weight * Math.log(pOmen);
    });
    const score = logPrior + logLikelihood;
    scores.set(categoryStem, score);
    if (score > maxScore) maxScore = score;
  }

  let sumExp = 0;
  const results = [];
  scores.forEach((score, category) => {
    const expScore = Math.exp(score - maxScore);
    sumExp += expScore;
    results.push({ category, score: expScore });
  });

  return results.map(r => ({ ...r, score: r.score / sumExp }));
}
