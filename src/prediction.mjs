import { chant } from './training.mjs';

/**
 * Normalizes and sorts prediction results.
 * @param {Object[]} results - Array of objects with { category, score }.
 * @param {Object} options - Output options: { as: 'string'|'array'|'objects', limit: number }.
 * @param {Function} bestVariantFn - Function to retrieve the best variant.
 * @param {boolean} capitalize - Whether to capitalize categories.
 * @returns {Object[]|string|string[]} - Formatted prediction results.
 */
export function norm(results, options, bestVariantFn, capitalize) {
    if (results.length) {
      results.forEach(result => {
        result.category = bestVariantFn(result.category);
      });
      if (capitalize) {
        results.forEach(result => {
          result.category = result.category.charAt(0).toUpperCase() + result.category.slice(1);
        });
      }
      results.sort((a, b) => b.score - a.score);
      if (options.limit) results = results.slice(0, options.limit);
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
    
    if(typeof text === 'object' && !Array.isArray(text)) {
        return predictWeightedText(text, context);
    }

    // Tokenize text and compute term frequencies
    const omensList = chant(text, context.stemmer, context.excludes, context.n);
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
    
    for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
      const docsInCategory = context.divinerDocCount[oracleId];
      if (docsInCategory === 0) continue;
      
      const logPrior = Math.log(docsInCategory / totalTransmissions);
      let logLikelihood = 0;
      idFreq.forEach((tf, omenId) => {
        const df = context.omenDocFreq[omenId] || 0;
        const idf = Math.log((totalTransmissions + 1) / (df + 1)); // Smoothing
        const tfidf = tf * idf;
        const freq = context.omenFrequencies[oracleId].get(omenId) || 0;
        const totalOmens = context.omenCount[oracleId];
        const pOmen = (freq + 1) / (totalOmens + context.omens.length);
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
      const omensList = chant(rawText, context.stemmer, context.excludes, context.n);
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
  