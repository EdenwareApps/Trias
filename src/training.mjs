/**
 * chant
 * 
 * Prepares the omens (n-grams) from the provided text.
 * It tokenizes the text, applies the stemmer, filters out excluded terms,
 * and generates n-grams up to the specified 'n' value.
 * 
 * @param {string} text - Input text.
 * @param {Object} stemmer - Stemmer instance.
 * @param {Set} excludes - Set of excluded tokens.
 * @param {number} n - Maximum n-gram length.
 * @returns {string[]} - Array of n-grams.
 */
export function chant(text, stemmer, excludes, n) {
    if(typeof text !== 'string') {
        console.error('chant: text is not a string', text);
        return [];
    }
    const tokens = stemmer.tokenizeAndStem(text)
      .filter(token => !excludes.has(token) && token.length > 1);
    const omensList = [];
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j <= tokens.length - i; j++) {
        omensList.push(tokens.slice(j, j + i).join(' '));
      }
    }
    return omensList;
  }
  
  /**
   * Trains the model with a given text and category.
   * Updates the context (model state) accordingly.
   * @param {string|Object} text - The prophetic text, or an object with { input, output }.
   * @param {string} category - The diviner category for the prophecy.
   * @param {Object} context - The training context (model state).
   */
  export function trainText(text, category, context) {
    if (Array.isArray(text)) {
      for (const t of text) {
        if (category) {
          trainText(t, category, context);
        } else {
          trainText(t.input, t.output, context);
        }
      }
      return;
    }
    
    if (typeof text === 'object' && typeof text.input === 'string') {
      category = text.output;
      text = text.input;
    }
    
    const categoryStem = context.stemmer.stem(category);
    if (context.excludes.has(categoryStem)) return;
    
    if (!context.categoryStemToId.has(categoryStem)) {
      const oracleId = context.divinerGroups.length;
      context.categoryStemToId.set(categoryStem, oracleId);
      context.divinerGroups.push(categoryStem);
      context.categoryVariations.set(categoryStem, new Map());
      context.categoryVariations.get(categoryStem).set(category, 1);
      context.divinerDocCount[oracleId] = 0;
      context.omenCount[oracleId] = 0;
      context.omenFrequencies[oracleId] = new Map();
    } else {
      const variationCounts = context.categoryVariations.get(categoryStem);
      variationCounts.set(category, (variationCounts.get(category) || 0) + 1);
    }
    const oracleId = context.categoryStemToId.get(categoryStem);
    
    const omensList = chant(text, context.stemmer, context.excludes, context.n);
    if (omensList.length === 0) return;
    
    const uniqueOmens = new Set(omensList);
    
    // Register new omens
    for (const omen of uniqueOmens) {
      if (!context.omenMapping.has(omen)) {
        const omenId = context.omens.length;
        context.omenMapping.set(omen, omenId);
        context.omens.push(omen);
        context.omenDocFreq[omenId] = 0;
      }
    }
    
    // Update global omen frequency
    for (const omen of uniqueOmens) {
      const omenId = context.omenMapping.get(omen);
      context.omenDocFreq[omenId]++;
    }
    
    // Update the diviner category counts
    context.divinerDocCount[oracleId]++;
    for (const omen of omensList) {
      const omenId = context.omenMapping.get(omen);
      const current = context.omenFrequencies[oracleId].get(omenId) || 0;
      context.omenFrequencies[oracleId].set(omenId, current + 1);
      context.omenCount[oracleId]++;
    }
    context.totalTransmissions++;
  }
  