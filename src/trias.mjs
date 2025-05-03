import { getStemmer } from './stemmer.mjs';
import fs from 'fs';
import * as Persistence from './persistence.mjs';
import * as Training from './training.mjs';
import * as Prediction from './prediction.mjs';

/**
 * Trias class
 * 
 * Inspired by the ancient Greek Trias—the three prophetic nymphs (Cleodora, Melena, and Dafnis)
 * who performed divination through sacred rituals.
 * 
 * This class functions as an oracle that learns (records) prophetic texts and later predicts 
 * the oracle category (prophecy outcome) from input texts using a TF-IDF approach.
 */
export class Trias {
    constructor({
        file = './model.trias', // model file (the "tome of prophecies")
        create = true,
        n = 3,
        language = 'en',
        weightExponent = 2,
        capitalize = false,
        excludes = [],
        weights = {},
        size = 4096 * 1024,  // Approximate model size in bytes (limit for the prophetic tome)
        autoImport = false,  // Auto import pre-trained model if file doesn't exist
        modelUrl = 'https://edenware.app/trias/trained/{language}.trias' // URL template for pre-trained model
    } = {}) {
        this.file = file;
        this.weightExponent = weightExponent;
        this.autoImport = autoImport;
        this.modelUrl = modelUrl;
        this.language = language;
        this.create = create;
        this.n = n;
        this.weights = Object.assign({
            prior: 0.01,
            correlation: 0,
            tfidf: 0,
            missingOmensPenalty: 0,
            crossEntropy: 1,
            jaccard: 0.5,
            cosine: 0.5,
            gravity: 0.5
        }, weights);
        this.stemmer = getStemmer(language);
        this.maxModelSize = size;
        this.avgOmenSize = null;  // Average size per omen (calculated from condensed model file)

        // Model state variables
        this.categoryStemToId = new Map(); // mapping of category stem to category index
        this.categoryVariations = new Map(); // variations of each category
        this.categoryRelations = new Map(); // co-occurrence relations between categories
        this.divinerGroups = []; // list of diviner groups
        this.divinerDocCount = []; // number of documents in each category
        this.omenCount = []; // number of omens in each category
        this.omenFrequencies = []; // frequency of each omen in each category
        this.omenMapping = new Map(); // mapping of omen to category index
        this.omens = []; // list of omens
        this.omenDocFreq = []; // frequency of each omen in the entire corpus
        this.totalDocuments = 0; // total number of transmissions (documents) in the corpus
        this.capitalize = capitalize;
        this.excludes = new Set(excludes);
        this.gravitationalGroups = new Map();

        this.contextProperties = new Set([
            'n',
            'file',
            'autoImport',
            'weightExponent',
            'modelUrl',
            'language',
            'create',
            'capitalize',
            'excludes',
            'weights',
            'stemmer',
            'avgOmenSize',
            'categoryStemToId',
            'categoryVariations',
            'categoryRelations',
            'divinerGroups',
            'divinerDocCount',
            'omenCount',
            'omenFrequencies',
            'omenMapping',
            'omens',            
            'omenDocFreq',
            'totalDocuments',
            'gravitationalGroups'
        ]);

        this.trained = Promise.resolve();
        
        const ctl = {}
        this.initialized = new Promise((resolve, reject) => {
            ctl.resolve = resolve
            ctl.reject = reject
            this.init().then(resolve).catch(reject)
        })
        this.initialized.ctl = ctl
    }

    fromJSON(data) {
        data = JSON.parse(data.toString('utf-8'));
        
        // Restore Maps from serialized arrays/objects
        data.categoryStemToId = new Map(data.categoryStemToId);
        data.categoryVariations = new Map(
            Object.entries(data.categoryVariations || {}).map(([stem, variations]) => [
                stem,
                new Map(Object.entries(variations))
            ])
        );
        data.categoryRelations = new Map(
            Object.entries(data.categoryRelations || {}).map(([cat, relObj]) => [
                cat,
                new Map(Object.entries(relObj))
            ])
        );
        data.omenMapping = new Map(data.omenMapping);
        data.excludes = new Set(data.excludes);    

        // Restore omenFrequencies as an array of Maps
        data.omenFrequencies = (data.omenFrequencies || []).map(item => 
            new Map(
                Object.entries(item || {}).map(([k, v]) => [Number(k), v])
            )
        );

        // Restore gravitational groups
        this.gravitationalGroups = new Map(
            Object.entries(data.gravitationalGroups || {}).map(([key, group]) => [
                key,
                {
                    members: new Set(group.members),
                    strength: group.strength
                }
            ])
        );

        return data;
    }

    toJSON() {
        const result = {};
        for (const p of this.contextProperties) {
          if (p === "excludes") {
            result[p] = Array.from(this[p]);
          } else if (p === 'categoryRelations'  || p === "categoryVariations") { 
            result[p] = Object.fromEntries(
              [...this[p].entries()].map(([stem, entries]) => [ 
                stem,
                Object.fromEntries(entries)
              ])
            );
          } else if (p === 'categoryStemToId' || p === 'omenMapping') {
            result[p] = Array.from(this[p].entries());
          } else if (p === 'omenFrequencies') {
            result[p] = this[p].map(map => Object.fromEntries(map));
          } else if (p === 'gravitationalGroups') {
            result[p] = Object.fromEntries(
              [...this[p].entries()].map(([key, group]) => [
                key,
                {
                  members: Array.from(group.members),
                  strength: group.strength
                }
              ])
            );
          } else {
            result[p] = this[p];
          }
        }
        return JSON.stringify(result, null, 2);
    }

    async init() {
        const stat = await fs.promises.stat(this.file).catch(() => ({size: 0}));
        if (!stat || stat.size === 0) {
            if (this.create) {
                this.reset();
            } else {
                throw new Error('Model file not found');
            }
        } else {
            try {
                await this.load(this.file);
            } catch (err) {
                if (this.create) {
                    this.reset();
                } else {
                    throw new Error('Failed to load model: '+ err);
                }
            }
        }

        // Handle auto-import if enabled and the model is empty
        if (this.autoImport && this.totalDocuments === 0) {
            const url = this.modelUrl.replace('{language}', this.language).replace('{file}', this.file);
            try {
                await Persistence.importModel(url, this.file);
                await this.load(this.file);
            } catch (err) {
                console.warn(`Failed to auto-import model from ${url}: ${err.message}`);
                if (!this.create) {
                    throw err;
                }
            }
        }

        if (this.omens.length > 0) {
            const { size } = await fs.promises.stat(this.file).catch(() => ({ size: 0 }));
            this.avgOmenSize = size / this.omens.length;
        }
    }


    /**
     * Loads the model from the given file and restores its internal structure.
     */
    async load(modelFile) {
        // Read and decompress the file content
        const condensedData = await fs.promises.readFile(modelFile);
        if (!condensedData || !condensedData.length) throw new Error('Model file is empty');

        const jsonStr = await Persistence.expand(condensedData);
        if (!jsonStr) throw new Error('Decompressed data is empty');
        
        const model = this.fromJSON(jsonStr);

        // some of these below should be Map or Set by default instead of []
        this.divinerGroups = model.divinerGroups || [];
        this.categoryStemToId = model.categoryStemToId || new Map();
        this.categoryVariations = model.categoryVariations || new Map();
        this.categoryRelations = model.categoryRelations || new Map();
        this.excludes = model.excludes || new Set();
        this.omens = model.omens || [];
        this.omenMapping = model.omenMapping || new Map();
        this.omenFrequencies = model.omenFrequencies || [];
        
        this.divinerDocCount = model.divinerDocCount || [];
        this.omenCount = model.omenCount || [];
        this.omenDocFreq = model.omenDocFreq || [];

        this.totalDocuments = Number(model.totalDocuments) || 0;
        this.weightExponent = Number(model.weightExponent) || 2;

        if (await this.overloaded()) {
            await this.save(true); // save() will purge() if needed
        }
        return true;
    }

    get size() {
        if (this.avgOmenSize > 0) return this.omens.length * this.avgOmenSize;
        return 0;
    }

    async overloaded() {
        if (!this.avgOmenSize || isNaN(this.avgOmenSize)) {
            const { size } = await fs.promises.stat(this.file).catch(() => ({ size: 0 }));
            if (!size) return false;
            this.avgOmenSize = size / this.omens.length;
        }
        const allowedOmens = Math.floor(this.maxModelSize / this.avgOmenSize);
        return (!isNaN(allowedOmens) && allowedOmens > 0 && this.omens.length > allowedOmens);
    }

    async train(text, category) {
        await this.initialized;
        let release;
        this.preprocessed = false;
        this.trained = new Promise(resolve => release = resolve);
        if (category && !Array.isArray(text)) {
            text = [
                {input: text, output: category}
            ];
        }

        // check category against this.excludes
        text = text.filter(item => {
            if (typeof(item.output) === 'string') {
                return !this.excludes.has(item.output.trim().toLowerCase());
            } else if (Array.isArray(item.output)) {
                item.output = item.output.filter(output => !this.excludes.has(output.trim().toLowerCase()));
                if (item.output.length === 0) return false;
            }
            return true;
        });
        if (text.length === 0) return;
        
        // Calls the main training
        Training.trainText(text, this);
        
        // If there are more than one category, updates the co-occurrence relations
        for (const item of text) {
            if (!Array.isArray(item.output) || item.output.length < 2) {
                continue;
            }
            for (let i = 0; i < item.output.length; i++) {
                for (let j = 0; j < item.output.length; j++) {
                    if (i === j) continue;
                    const catA = this.stemmer.stem(item.output[i]);
                    const catB = this.stemmer.stem(item.output[j]);
                    if (!this.categoryRelations.has(catA)) {
                        this.categoryRelations.set(catA, new Map());
                    }
                    const relMap = this.categoryRelations.get(catA);
                    relMap.set(catB, (relMap.get(catB) || 0) + 1);
                }
            }
        }
        
        if (!this.isPurging && !this.isSaving && await this.overloaded()) { // tame the model size
            await this.purge().catch(() => {});
        }

        this.preprocessed = false;
        release();
    }

    async predict(text, options = { as: 'string', amount: 1 }) {
        await this.initialized;
        await this.trained;
        const results = Prediction.predictText(text, this);
        return Prediction.norm(results, options, this.bestVariant.bind(this), this.capitalize);
    }

    
    /**
     * Adds gravitational groups to influence predictions
     * @param {Array[]} groups - Array of arrays of related terms
     */
    addGravitationalGroups(groups) {
        for (const [groupName, terms] of Object.entries(groups)) {
          const stemmedTerms = terms.map(term => this.stemmer.stem(term.toLowerCase()));
          const strength = Math.sqrt(terms.length) * 2; // Strength based on size
          
          this.gravitationalGroups.set(groupName, {
            members: new Set(stemmedTerms),
            strength: strength
          });
        }
    }

    bestVariant(categoryStem) {
        const variationCounts = this.categoryVariations.get(categoryStem);
        if (!variationCounts) {
            return categoryStem;
        }
        let best = null;
        let bestCount = -Infinity;
        for (const [variation, count] of variationCounts.entries()) {
            if (count > bestCount) {
                best = variation;
                bestCount = count;
            }
        }
        return best;
    }

    /**
     * related
     * 
     * Given an input of the type { tag1: score1, tag2: score2 },
     * returns a list of related categories that do not contain in the input.
     * 
     * The function uses explicit relations (stored in categoryRelations) and,
     * if the candidates are insufficient, it makes fallback to predictWeightedText.
     * 
     * @param {Object} inputScores - Object with categories and their scores.
     * @param {number} amount - Limit of categories to return.
     * @returns {string[]} - List of related categories.
     */
    related(inputScores, options = { as: 'objects', amount: 5 }) {
        const relatedScores = {};
        let found = false;

        if (typeof inputScores === 'string') {
            inputScores = { [inputScores]: 1 };
        }

        // Uses explicit relations if they exist
        for (const [cat, score] of Object.entries(inputScores)) {
            const categoryStem = this.stemmer.stem(cat);
            const relations = this.categoryRelations.get(categoryStem);
            if (relations) {
                for (const [relatedCat, count] of relations.entries()) {
                    if (inputScores.hasOwnProperty(relatedCat)) continue;
                    relatedScores[relatedCat] = (relatedScores[relatedCat] || 0) + count * score;
                    found = true;
                }
            }
        }

        let candidates = [];
        if (found && Object.keys(relatedScores).length > 0) {
            candidates = Object.entries(relatedScores)
                .sort(([, aScore], [, bScore]) => bScore - aScore)
                .map(([category, score]) => ({ category, score }));
        }
        
        // Fallback: if there are not enough candidates, uses predictWeightedText
        if (candidates.length < options.amount) {
            // Uses inputScores as pseudo input for predictWeightedText
            const fallbackResults = Prediction.predictWeightedText(inputScores, this);
            // Joins explicit candidates with the fallback (without duplicates)
            candidates = candidates.concat(fallbackResults.filter(candidate => {
                const has = candidates.some(c => c.category === candidate.category);
                return !has;
            }));
        }
        
        return Prediction.norm(candidates, options, this.bestVariant.bind(this), this.capitalize);
    }

    /**
    * Reduces a list of categories to a specified number of clusters,
    * grouping them by themes based on learned co-occurrence relations.
    * @param {string[]|Object} categories - List of categories or object with categories and scores.
    * @param {Object} options - Options: { amount: desired number of clusters }.
    * @returns {Object} - Object mapping cluster names to arrays of categories.
    */
    async reduce(categories, options = { amount: 3 }) {
        await this.initialized;
        await this.trained;
        const { amount } = options;

        // Step 1: Convert input to an object with scores
        let inputScores;
        if (Array.isArray(categories)) {
            inputScores = {};
            for (const category of categories) {
                inputScores[category] = 1;
            }
        } else if (typeof categories === 'object' && categories !== null) {
            inputScores = categories;
        } else {
            throw new Error('Invalid categories type');
        }

        const candidates = {};

        // Step 2: Normalize categories to their stems and collect all relevant omens
        const stems = {};
        const allCategories = Object.keys(inputScores);
        for (const category of allCategories) {
            stems[category] = this.stemmer.tokenizeAndStem(category).map(c => this.omenMapping.get(c));
        }
        const interests = new Set(Object.values(stems).flat().filter(n => n !== undefined));

        // Step 3: Calculate scores for each category/oracleId, weighted by input scores
        for (const [categoryStem, oracleId] of this.categoryStemToId.entries()) {
            this.omenFrequencies[oracleId].forEach((freq, omenId) => {
                if (interests.has(omenId)) {
                    for (const stemId of allCategories) {
                        if (!stems[stemId].includes(omenId)) continue;
                        if (!candidates[stemId]) candidates[stemId] = {};
                        if (typeof candidates[stemId][oracleId] === 'undefined') candidates[stemId][oracleId] = 0;
                        const categoryScore = inputScores[stemId] || 0;
                        candidates[stemId][oracleId] += categoryScore * (freq / this.omenDocFreq[omenId]) / this.divinerDocCount[oracleId];
                    }
                }
            });
        }

        // Step 4: Create feature vectors for all categories
        const featureVectors = {};
        const allOracleIds = new Set();
        for (const stemId in candidates) {
            for (const oracleId in candidates[stemId]) {
                allOracleIds.add(oracleId);
            }
        }

        // Initialize vectors for all categories, even those without candidates
        for (const stemId of allCategories) {
            featureVectors[stemId] = {};
            const hasData = candidates[stemId] && Object.keys(candidates[stemId]).length > 0;
            for (const oracleId of allOracleIds) {
                if (hasData) {
                    featureVectors[stemId][oracleId] = candidates[stemId][oracleId] || 0;
                } else {
                    // Assign a small random value to avoid identical vectors
                    featureVectors[stemId][oracleId] = Math.random() * 0.01;
                }
            }
        }

        // Step 5: Normalize vectors
        for (const stemId in featureVectors) {
            const vector = featureVectors[stemId];
            const norm = Math.sqrt(Object.values(vector).reduce((sum, val) => sum + val * val, 0));
            for (const oracleId in vector) {
                vector[oracleId] = norm === 0 ? 0 : vector[oracleId] / norm;
            }
        }

        // Step 6: Implement K-means for clustering with K-means++
        function euclideanDistance(vec1, vec2) {
            let sum = 0;
            for (const key in vec1) {
                const diff = vec1[key] - (vec2[key] || 0);
                sum += diff * diff;
            }
            return Math.sqrt(sum);
        }

        function kmeansPlusPlusInit(vectors, k) {
            const centroids = [];
            const n = vectors.length;
            const firstIdx = Math.floor(Math.random() * n);
            centroids.push({ ...vectors[firstIdx] });

            for (let i = 1; i < k; i++) {
                const distances = vectors.map(vec => {
                    const minDist = Math.min(...centroids.map(centroid => euclideanDistance(vec, centroid)));
                    return minDist ** 2;
                });
                const totalDist = distances.reduce((sum, d) => sum + d, 0);
                const randVal = Math.random() * totalDist;
                let cumulative = 0;
                let nextIdx = 0;
                for (let j = 0; j < n; j++) {
                    cumulative += distances[j];
                    if (cumulative >= randVal) {
                        nextIdx = j;
                        break;
                    }
                }
                centroids.push({ ...vectors[nextIdx] });
            }
            return centroids;
        }

        function kmeans(vectors, k, maxIter = 300) {
            const n = vectors.length;
            if (n < k) return Array.from({ length: n }, (_, i) => [i]);

            const centroids = kmeansPlusPlusInit(vectors, k);

            let assignments = new Array(n).fill(0);
            for (let iter = 0; iter < maxIter; iter++) {
                const newAssignments = vectors.map((vec) => {
                    let minDist = Infinity;
                    let cluster = 0;
                    centroids.forEach((centroid, cIdx) => {
                        const dist = euclideanDistance(vec, centroid);
                        if (dist < minDist) {
                            minDist = dist;
                            cluster = cIdx;
                        }
                    });
                    return cluster;
                });

                if (newAssignments.every((val, idx) => val === assignments[idx])) {
                    break;
                }
                assignments = newAssignments;

                centroids.forEach((centroid, cIdx) => {
                    const pointsInCluster = vectors.filter((_, idx) => assignments[idx] === cIdx);
                    if (pointsInCluster.length === 0) return;
                    for (const key in centroid) {
                        centroid[key] = pointsInCluster.reduce((sum, vec) => sum + (vec[key] || 0), 0) / pointsInCluster.length;
                    }
                });
            }

            const clusters = Array.from({ length: k }, () => []);
            assignments.forEach((cluster, idx) => {
                clusters[cluster].push(idx);
            });
            return clusters.filter(cluster => cluster.length > 0);
        }

        // Execute K-means
        const vectors = Object.values(featureVectors);
        const categoryKeys = Object.keys(featureVectors);
        const numClusters = Math.min(amount || 3, categoryKeys.length);
        let clusters = kmeans(vectors, numClusters);

        // Step 7: Split large clusters if necessary
        while (clusters.length < numClusters && clusters.some(cluster => cluster.length > 1)) {
            const largestClusterIdx = clusters.reduce((maxIdx, cluster, idx, arr) => 
                cluster.length > arr[maxIdx].length ? idx : maxIdx, 0);
            const largestCluster = clusters[largestClusterIdx];
            const subVectors = largestCluster.map(idx => vectors[idx]);
            const subClusters = kmeans(subVectors, 2);
            if (subClusters.length === 2) {
                const newCluster1 = subClusters[0].map(subIdx => largestCluster[subIdx]);
                const newCluster2 = subClusters[1].map(subIdx => largestCluster[subIdx]);
                clusters.splice(largestClusterIdx, 1, newCluster1, newCluster2);
            } else {
                break;
            }
        }

        // Step 8: Use input scores to order categories
        const categoryScores = inputScores;

        // Step 9: Map indices back to categories and generate cluster names
        const result = {};
        clusters.forEach(cluster => {
            const clusterCategories = cluster.map(index => categoryKeys[index]);
            // Order categories by input score
            const sortedCategories = clusterCategories.sort((a, b) => (categoryScores[b] || 0) - (categoryScores[a] || 0));
            // Select up to 3 categories (or less, if the cluster has less than 3)
            const topCategories = sortedCategories.slice(0, Math.min(3, sortedCategories.length));
            // Create the cluster name by joining the 3 categories with commas
            const clusterName = topCategories.join(', ');
            // Assign the list of categories to the cluster in the result object
            result[clusterName] = clusterCategories;
        });

        return result;
    }

    /**
     * purge
     * 
     * Reduces the model size by removing the least frequent omens so that the total
     * number of omens does not exceed the allowed number defined by:
     * 
     *      allowedOmens = Math.floor(this.maxModelSize / this.avgOmenSize)
     * 
     * This ensures that the compressed model stays within the maximum size.
     */
    async purge() {
        const allowedOmens = Math.floor(this.maxModelSize / this.avgOmenSize);
        if (!allowedOmens || allowedOmens <= 0 || isNaN(allowedOmens) || this.omens.length <= allowedOmens) return;
    
        this.isPurging = true;
        let err = null;
    
        try {
            // Step 1: Calculate balance statistics
            const categoryStats = new Map();
            for (const [categoryId, count] of this.divinerDocCount.entries()) {
                categoryStats.set(categoryId, {
                    currentCount: count,
                    targetCount: Math.floor(allowedOmens / this.divinerGroups.length)
                });
            }
    
            // Step 2: Create balanced scoring matrix
            const scoredOmens = this.omens.map((omen, idx) => {
                const docFreq = this.omenDocFreq[idx];
                
                // Calculate category imbalance penalty
                let categoryPenalty = 0;
                for (const [categoryId, freqMap] of this.omenFrequencies.entries()) {
                    if (freqMap.has(idx)) {
                        const { currentCount, targetCount } = categoryStats.get(categoryId);
                        categoryPenalty += Math.max(0, (currentCount - targetCount) / targetCount);
                    }
                }
    
                // Score = (document frequency) / (1 + category imbalance penalty)
                return {
                    idx,
                    score: docFreq / (1 + categoryPenalty)
                };
            });
    
            // Step 3: Sort by balanced score
            scoredOmens.sort((a, b) => b.score - a.score);
            const keptIndices = new Set(scoredOmens.slice(0, allowedOmens).map(o => o.idx));
    
            // Step 4: Rebuild the model state
            const newOmens = [];
            const newOmenMapping = new Map();
            const newOmenDocFreq = [];
            const newOmenFrequencies = this.omenFrequencies.map(() => new Map());
            const newOmenCount = new Array(this.omenFrequencies.length).fill(0);
            
            for (const oldIdx of keptIndices) {
                const newIdx = newOmens.length;
                newOmens.push(this.omens[oldIdx]);
                newOmenDocFreq.push(this.omenDocFreq[oldIdx]);
                newOmenMapping.set(this.omens[oldIdx], newIdx);
    
                // Update category frequencies
                for (const categoryId of this.omenFrequencies.keys()) {
                    const freq = this.omenFrequencies[categoryId].get(oldIdx);
                    if (freq) {
                        newOmenFrequencies[categoryId].set(newIdx, freq);
                        newOmenCount[categoryId] += freq;
                    }
                }
            }
    
            // Step 5: Apply category constraints
            for (const categoryId of this.divinerGroups.keys()) {
                const { targetCount } = categoryStats.get(categoryId);
                const currentCount = newOmenCount[categoryId];
                
                if (currentCount > targetCount * 1.2) { // 20% tolerance
                    const toRemove = Math.ceil(currentCount - targetCount);
                    const freqMap = newOmenFrequencies[categoryId];
                    
                    // Remove less relevant omens from the category
                    const sorted = [...freqMap.entries()].sort((a, b) => a[1] - b[1]);
                    for (let i = 0; i < toRemove && sorted.length; i++) {
                        const [omenIdx] = sorted.pop();
                        freqMap.delete(omenIdx);
                        newOmenCount[categoryId] -= freqMap.get(omenIdx) || 0;
                    }
                }
            }
    
            // Update final state
            this.omens = newOmens;
            this.omenMapping = newOmenMapping;
            this.omenDocFreq = newOmenDocFreq;
            this.omenFrequencies = newOmenFrequencies;
            this.omenCount = newOmenCount;
    
        } catch (e) {
            err = e;
        } finally {
            this.isPurging = false;
        }
    
        if (err) throw err;
    }

    async save(force) {
        this.isSaving = true;
        let err = null;
        try {
            if(force !== true) {
                await this.initialized;
                await this.trained;
            }

            await this.purge();
            await Persistence.saveModel(this.file, this.toJSON());
            
            const { size } = await fs.promises.stat(this.file).catch(() => ({ size: 0 }));
            this.avgOmenSize = size / this.omens.length;
        } catch (e) {
            err = e;
        } finally {
            this.isSaving = false;
        }
        if (err) throw err;
    }

    reset() {
        this.categoryStemToId = new Map();
        this.categoryVariations = new Map();
        this.divinerGroups = [];
        this.omenMapping = new Map();
        this.omens = [];
        this.divinerDocCount = [];
        this.omenCount = [];
        this.omenFrequencies = [];
        this.omenDocFreq = [];
        this.totalDocuments = 0;
    }

    async destroy() {
        this.reset();
        this.initialized.ctl.reject(new Error('Trias destroyed'));
    }
}
