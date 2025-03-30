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

function preprocess(context) {
  if (context.preprocessed) return;
  context.preprocessed = {};
  
  // Pre-process: Prior
  const priorCache = new Map();
  const totalDocuments = context.totalDocuments; // Total documents
  const alpha = 0.5; // Laplace smoothing

  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const docsInCategory = context.divinerDocCount[oracleId];
    const prior = Math.log(
      (docsInCategory + alpha) / 
      (totalDocuments + alpha * context.divinerGroups.length)
    );
    priorCache.set(oracleId, prior);
  }
  context.preprocessed.prior = priorCache;

  // Pre-process: P(omen)
  const pOmenCache = new Map();
  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const omenFreq = context.omenFrequencies[oracleId];
    const totalOmens = context.omenCount[oracleId];
    const omenProbMap = new Map();
    context.omens.forEach(omenId => {
      const freq = omenFreq.get(omenId) || 0;
      const pOmen = (freq + 0.5) / (totalOmens + 0.5 * context.omens.length);
      omenProbMap.set(omenId, pOmen);
    });
    pOmenCache.set(oracleId, omenProbMap);
  }
  context.preprocessed.pOmen = pOmenCache;
  
  // Pre-process IDF
  const idfCache = new Map();
  context.omens.forEach(omenId => {
    const df = context.omenDocFreq[omenId] || 0;
    const idf = Math.log((totalDocuments + 1) / (df + 1));
    idfCache.set(omenId, idf);
  });
  context.preprocessed.idf = idfCache;

  // Pre-process: TF-IDF
  const categoryTFIDF = new Map();
  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const omenFreq = context.omenFrequencies[oracleId];
    const totalOmens = context.omenCount[oracleId];
    const tfidfVector = new Map();
    context.omens.forEach(omenId => {
      const tf = (omenFreq.get(omenId) || 0) / totalOmens;
      const idf = idfCache.get(omenId);
      tfidfVector.set(omenId, tf * idf);
    });
    categoryTFIDF.set(oracleId, tfidfVector);
  }
  context.preprocessed.categoryTFIDF = categoryTFIDF;
}

/**
 * Predicts the diviner category for the given text using a TF-IDF-based approach.
 * @param {string} text - The input text.
 * @param {Object} context - The model context.
 * @returns {Object[]} - Array of objects with { category, score }.
 */
export function predictText(text, context) {
  if (context.totalDocuments === 0) return [];

  // Check if the text is an object of weights
  if (typeof text === 'object' && !Array.isArray(text)) {
    return predictWeightedText(text, context);
  }

  preprocess(context);

  // Tokenize the text and calculate term frequencies
  const scores = new Map();
  const omensList = chant(text, context);
  const idFreq = new Map();
  for (const omen of omensList) {
    const omenId = context.omenMapping.get(omen);
    if (omenId !== undefined) {
      idFreq.set(omenId, (idFreq.get(omenId) || 0) + 1);
    }
  }

  const totalDocuments = context.totalDocuments;

  // Use precomputed IDF
  const idfMap = context.preprocessed.idf;

  // Define the scoring algorithms using precomputed data
  const algorithms = {
    prior: (oracleId) => {
      return context.preprocessed.prior.get(oracleId) || 0;
    },
    crossEntropy: (oracleId) => {
      let entropy = 0;
      idFreq.forEach((tf, omenId) => {
        const tfidf = tf * (idfMap.get(omenId) || 0);
        const pOmen = context.preprocessed.pOmen.get(oracleId).get(omenId) || 1e-10;
        entropy -= tfidf * Math.log(pOmen);
      });
      return -entropy;
    },
    correlation: (oracleId) => {
      const categoryVector = context.preprocessed.categoryTFIDF.get(oracleId);
      if (!categoryVector) return 0;

      // Calculate input TF-IDF vector
      const inputVector = new Map();
      idFreq.forEach((tf, omenId) => {
        const idf = idfMap.get(omenId) || 0;
        inputVector.set(omenId, tf * idf);
      });

      // Use only omens present in both vectors
      const commonOmens = Array.from(inputVector.keys()).filter(omenId => categoryVector.has(omenId));
      if (commonOmens.length === 0) return 0;

      let sumA = 0, sumB = 0, sumAB = 0, sumAA = 0, sumBB = 0;
      commonOmens.forEach(omenId => {
        const a = inputVector.get(omenId) || 0;
        const b = categoryVector.get(omenId) || 0;
        sumA += a;
        sumB += b;
        sumAB += a * b;
        sumAA += a * a;
        sumBB += b * b;
      });

      const n = commonOmens.length;
      const meanA = sumA / n;
      const meanB = sumB / n;
      const covariance = (sumAB / n) - (meanA * meanB);
      const varianceA = (sumAA / n) - (meanA * meanA);
      const varianceB = (sumBB / n) - (meanB * meanB);
      const stdA = Math.sqrt(varianceA);
      const stdB = Math.sqrt(varianceB);

      return covariance / (stdA * stdB || 1);
    },
    tfidf: (oracleId) => { // cooccurrence
      let sum = 0;
      idFreq.forEach((tf, omenId) => {
        if (context.omenFrequencies[oracleId]?.has(omenId)) {
          sum += tf * (idfMap.get(omenId) || 0);
        }
      });
      return sum;
    },
    missingOmensPenalty: (oracleId) => {
      let penalty = 0;
      context.omenFrequencies[oracleId]?.forEach((freq, omenId) => {
        if (!idFreq.has(omenId) && freq > 10) {
          penalty -= Math.log(freq / (context.omenCount[oracleId] + 1));
        }
      });
      return penalty;
    },
    cosine: (oracleId) => {
      const categoryVector = context.preprocessed.categoryTFIDF.get(oracleId);
      if (!categoryVector) return 0;

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      idFreq.forEach((tf, omenId) => {
        const tfidfA = tf * (idfMap.get(omenId) || 0);
        const tfidfB = categoryVector.get(omenId) || 0;

        dotProduct += tfidfA * tfidfB;
        normA += tfidfA ** 2;
        normB += tfidfB ** 2;
      });

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    },
    jaccard: (oracleId) => {
      const intersection = new Set([...idFreq.keys()]
        .filter(omenId => context.omenFrequencies[oracleId]?.has(omenId)));
      const unionSize = idFreq.size + context.omenFrequencies[oracleId].size 
        - intersection.size;
      return intersection.size / unionSize;
    }
  };

  // First pass: Calculate raw scores
  const rawScores = {};
  const algorithmNames = Object.keys(algorithms);
  algorithmNames.forEach(name => rawScores[name] = new Map());

  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const docsInCategory = context.divinerDocCount[oracleId];
    if (docsInCategory === 0) continue;

    algorithmNames.forEach(algoName => {
      if (context.weights[algoName] === undefined || context.weights[algoName] === 0) {
        rawScores[algoName].set(categoryStem, 0);
        return;
      }
      const rawScore = algorithms[algoName](oracleId);
      rawScores[algoName].set(categoryStem, rawScore);
    });
  }

  // Calculate normalization statistics for each algorithm
  const algoStats = {};
  algorithmNames.forEach(algoName => {
    const values = Array.from(rawScores[algoName].values());
    algoStats[algoName] = {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  });

  // Second pass: Apply normalization and weights
  let maxScore = -Infinity;

  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const docsInCategory = context.divinerDocCount[oracleId];
    if (docsInCategory === 0) continue;

    let total = 0;
    algorithmNames.forEach(algoName => {
      if (context.weights[algoName] === undefined || context.weights[algoName] === 0) return;

      const raw = rawScores[algoName].get(categoryStem);
      const { min, max } = algoStats[algoName];

      // Adaptive normalization between -1 and 1
      let normalized = 0;
      if (max !== min) {
        normalized = 2 * (raw - min) / (max - min) - 1;
      }

      total += normalized * context.weights[algoName];
    });

    scores.set(categoryStem, total);
    if (total > maxScore) maxScore = total;
  }

  const results = [];
  scores.forEach((score, category) => {
    results.push({ category, score: Math.exp(score - maxScore) });
  });

  results.sort((a, b) => b.score - a.score);

  // After calculating the normalized scores (results):
  if (context.gravitationalGroups.size === 0 || context.weights.gravity <= 0) {
    return results;
  }

  // 1. Identify groups activated by the text
  const gravitationalBoost = new Map();
  const samplingLimits = new Map();
  const samplesLimit = 3;
  const uniqueOmens = new Set(omensList.map(omen => 
    context.stemmer.stem(omen.toLowerCase())
  ));

  context.gravitationalGroups.forEach((group, groupName) => {
    let count = 0;
    group.members.forEach(member => {
      if (uniqueOmens.has(member)) {
        count++;
      }
    });
    if (count > 0) gravitationalBoost.set(groupName, count);
  });

  // 2. Identify groups activated by the top results
  results.forEach(result => {
    const categoryStem = context.stemmer.stem(result.category);
    context.gravitationalGroups.forEach((group, groupName) => {
      const limit = samplingLimits.get(groupName) || 0;
      if (limit >= samplesLimit) return;
      if (group.members.has(categoryStem)) {
        const current = gravitationalBoost.get(groupName) || 0;
        gravitationalBoost.set(groupName, current + result.score);
        samplingLimits.set(groupName, limit + 1);
      }
    });
  });

  // Choose the most activated groups, allowing ties, but keeping only the highest score
  let topScore = 0;
  gravitationalBoost.forEach((score, groupName) => {
    if (score > topScore) {
      topScore = score;
    }
  });
  gravitationalBoost.forEach((score, groupName) => {
    if (score === topScore) {
      score = score / topScore;
    } else {
      gravitationalBoost.delete(groupName);
    }
  });
  console.log({ topScore, gravitationalBoost });

  results.forEach(result => {
    const categoryStem = result.category;
    gravitationalBoost.forEach((score, groupName) => {
      if (context.gravitationalGroups.has(categoryStem)) {
        result.score += context.weights.gravitationalGroups * score;
      }
    });
  });

  // Re-order with the new scores
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Predicts the diviner category for multiple texts with associated weights.
 * @param {Object} inputObj - An object mapping texts to their weights.
 * @param {Object} context - The model context.
 * @returns {Object[]} - Array of objects with { category, score }.
 */
export function predictWeightedText(inputObj, context) {
  if (context.totalDocuments === 0 || context.divinerGroups.length === 0) return [];

  const idFreq = new Map();
  const smoothing = context.smoothing;
  const weightExponent = context.weightExponent;
  const totalDocuments = context.totalDocuments;

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
    const idf = Math.log((totalDocuments + 1) / (df + 1));
    tfIdf.set(omenId, tf * idf);
  });

  const scores = new Map();
  let maxScore = -Infinity;
  for (const [categoryStem, oracleId] of context.categoryStemToId.entries()) {
    const docsInCategory = context.divinerDocCount[oracleId];
    if (docsInCategory === 0) continue;

    const algorithms = {
      prior: {
        fn: () => {
          return Math.log((docsInCategory + 0.5) / (totalDocuments + 0.5 * context.divinerGroups.length));
        },
        weight: 0.1
      },
      likelihood: {
        fn: () => {
          let logLikelihood = 0;
          idFreq.forEach((tf, omenId) => {
            if (!context.omenFrequencies[oracleId]) return;
            const df = context.omenDocFreq[omenId] || 0;
            const idf = Math.log((totalDocuments + 1) / (df + 1));
            const tfidf = tf * idf;
            const freq = context.omenFrequencies[oracleId].get(omenId) || 0;
            const totalOmens = context.omenCount[oracleId];
            const pOmen = (freq + 0.5) / (totalOmens + 0.5 * context.omens.length);
            logLikelihood += tfidf * Math.log(pOmen);
          });
          return logLikelihood;
        },
        weight: 0.9
      }
    }

    const score = Object.keys(algorithms).reduce((acc, algorithm) => {
      return acc + algorithms[algorithm].fn() * algorithms[algorithm].weight;
    }, 0);

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
