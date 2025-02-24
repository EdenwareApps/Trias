import { getStemmer } from './stemmer.js';
import fs from 'fs';
import zlib from 'zlib';

/**
 * Trias class
 * 
 * Inspired by the ancient Greek Trías—the three prophetic nymphs (Cleodora, Melena, and Dafnis)
 * who presided over divination via sacred stones and honey (see: Harvard Studies in Classical Philology;
 * The Mythical Creatures Bible, Bane, 2013).
 * 
 * This class functions as an oracle that learns (inscribes) prophetic texts and later predicts 
 * the most likely oracle category (prophecy outcome) from input texts using a TF-IDF approach.
 */
export class Trias {
    constructor({
        file = './model.trias', // Compressed model file (the "tome of prophecies")
        initIfMissing = true,
        n = 3,
        language = 'en',
        weightExponent = 2,
        capitalize = false,
        excludes = ['separator', 'separador', 'hd', 'hevc', 'sd', 'fullhd', 'fhd', 'channels', 'canais', 'aberto', 'abertos', 'world', 'países', 'paises', 'countries', 'ww', 'live', 'ao vivo', 'en vivo', 'directo', 'en directo', 'unknown', 'other', 'others'],
        size = 512 * 1024  // Approximate model size in bytes (limit for the prophetic tome)
    } = {}) {
        this.file = file;
        this.weightExponent = weightExponent;
        this.initIfMissing = initIfMissing;
        this.n = n;
        this.stemmer = getStemmer(language);
        this.maxModelSize = size;
        this.avgOmenSize = null;  // Average size per omen (calculated from compressed JSON)

        // Oracle (category) mapping: maps oracle names to IDs
        this.oracleMapping = new Map();
        this.oracleCategories = [];
        
        // Divine counts per oracle category (number of prophecies per category)
        this.divineDocCount = []; // Index: oracleId, Value: count
        this.omenCount = [];      // Index: oracleId, Value: total omen count
        this.omenFrequencies = []; // Index: oracleId, Value: Map<omenId, count>
        
        // Omen mapping (n-grams representing omens in the prophecy)
        this.omenMapping = new Map();
        this.omens = [];
        this.omenDocFreq = [];    // Index: omenId, Value: global frequency
        
        this.totalProphecies = 0; // Total number of prophecies inscribed
        this.capitalize = capitalize;
        this.excludes = new Set(excludes);
        // Initialize the oracle (invoke the prophetic Trías)
        this.initialized = this.init();
    }

    /**
     * init
     * 
     * Initializes the Trias oracle by cleansing the exclusion list with the stemmer
     * and loading the existing oracle tome.
     *
     * References:
     * - Basic text pre-processing and model initialization techniques.
     */
    async init() {
        this.excludes = new Set([...this.excludes].map(exclude => this.stemmer.stem(exclude)));
        await this.load();
    }

    /**
     * chant
     * 
     * Prepares the omens (n-grams) from the given text.
     * It tokenizes and stems the input text, filters out excluded terms,
     * and generates n-grams up to the specified 'n' value.
     * 
     * @param {string} text - The input text to be processed.
     * @returns {string[]} - Array of omens (n-grams).
     *
     * References:
     * - N-gram generation methods in natural language processing.
     */
    chant(text) {
        const tokens = this.stemmer.tokenizeAndStem(text).filter(token =>
            !this.excludes.has(token) && token.length > 1
        );

        const omensList = [];
        for (let i = 1; i <= this.n; i++) {
            for (let j = 0; j <= tokens.length - i; j++) {
                omensList.push(tokens.slice(j, j + i).join(' '));
            }
        }
        return omensList;
    }

    /**
     * load
     * 
     * Loads the oracle tome (model) from a compressed file, reconstructing all oracle categories
     * and omen mappings. If the file does not exist and initialization is allowed, it resets the model.
     *
     * References:
     * - Model persistence using JSON serialization and zlib compression.
     */
    async load() {
        try {
            const compressedData = await fs.promises.readFile(this.file);
            const jsonStr = zlib.gunzipSync(compressedData).toString('utf8');
            const oracleTome = JSON.parse(jsonStr);

            // Load oracle category mapping
            this.oracleCategories = oracleTome.idToCategory || [];
            this.oracleMapping = new Map(this.oracleCategories.map((cat, id) => [cat, id]));

            // Load omen mapping
            this.omens = oracleTome.idToWord || [];
            this.omenMapping = new Map(this.omens.map((omen, id) => [omen, id]));

            // Convert numerical structures
            this.divineDocCount = oracleTome.docCount ? Array(oracleTome.docCount.length).fill(0).map(Number) : [];
            this.omenCount = oracleTome.wordCount ? Array(oracleTome.wordCount.length).fill(0).map(Number) : [];
            this.omenDocFreq = oracleTome.docFreq ? Array(oracleTome.docFreq.length).fill(0).map(Number) : [];

            // Convert omen frequencies to Map
            this.omenFrequencies = [];
            if (oracleTome.wordFreq) {
                for (let i = 0; i < oracleTome.wordFreq.length; i++) {
                    const map = new Map(Object.entries(oracleTome.wordFreq[i]).map(([k, v]) => [Number(k), v]));
                    this.omenFrequencies[i] = map;
                }
            }

            this.totalProphecies = Number(oracleTome.totalDocs) || 0;
            this.weightExponent = Number(oracleTome.weightExponent) || 2;

            // Update average omen size
            if (this.omens.length > 0) {
                this.avgOmenSize = compressedData.length / this.omens.length;
            }
        } catch (err) {
            if (err.code === 'ENOENT' && this.initIfMissing) {
                this.reset();
            } else {
                throw new Error(`Failed to load oracle tome: ${err.message}`);
            }
        }
    }

    /**
     * purgeLesserOmens
     * 
     * Reduces the model size by removing the least frequent omens if the compressed model exceeds maxModelSize.
     * The estimation is performed by compressing the JSON representation.
     *
     * References:
     * - Model size reduction techniques in text classification.
     */
    async purgeLesserOmens() {
        const oracleTome = {
            idToCategory: this.oracleCategories,
            idToWord: this.omens,
            docCount: this.divineDocCount,
            wordCount: this.omenCount,
            docFreq: this.omenDocFreq,
            wordFreq: this.omenFrequencies.map(map => Object.fromEntries(map)),
            totalDocs: this.totalProphecies,
            weightExponent: this.weightExponent,
            avgWordSize: this.avgOmenSize
        };

        const currentSize = await this.size();
        if (currentSize < this.maxModelSize) return;

        const totalOmens = this.omens.length;
        const targetOmenCount = Math.floor(totalOmens * (this.maxModelSize / currentSize));
        const removalCount = totalOmens - targetOmenCount;
        if (removalCount <= 0) return;

        const indices = Array.from({ length: totalOmens }, (_, i) => i);
        indices.sort((a, b) => (this.omenDocFreq[a] || 0) - (this.omenDocFreq[b] || 0));
        const removeSet = new Set(indices.slice(0, removalCount));

        const newOmens = [];
        const newOmenMapping = new Map();
        const newDocFreq = [];
        const mapping = new Map(); // Map old index to new index
        for (let i = 0; i < totalOmens; i++) {
            if (removeSet.has(i)) continue;
            const newIndex = newOmens.length;
            mapping.set(i, newIndex);
            newOmens.push(this.omens[i]);
            newDocFreq.push(this.omenDocFreq[i]);
            newOmenMapping.set(this.omens[i], newIndex);
        }

        // Update each oracle category's omen frequencies
        for (let oracleId = 0; oracleId < this.omenFrequencies.length; oracleId++) {
            const oldMap = this.omenFrequencies[oracleId];
            const newMap = new Map();
            for (const [omenId, count] of oldMap.entries()) {
                if (mapping.has(omenId)) {
                    newMap.set(mapping.get(omenId), count);
                }
            }
            this.omenFrequencies[oracleId] = newMap;
            let newTotal = 0;
            for (const count of newMap.values()) {
                newTotal += count;
            }
            this.omenCount[oracleId] = newTotal;
        }

        // Update global omen structures
        this.omens = newOmens;
        this.omenMapping = newOmenMapping;
        this.omenDocFreq = newDocFreq;
    }

    /**
     * save
     * 
     * Serializes and writes the oracle tome (model) to the compressed file.
     * It first purges lesser omens if necessary.
     *
     * References:
     * - Data serialization and persistence using JSON and zlib.
     */
    async save() {
        await this.initialized;
        this.purgeLesserOmens();

        const oracleTome = {
            idToCategory: this.oracleCategories,
            idToWord: this.omens,
            docCount: this.divineDocCount,
            wordCount: this.omenCount,
            docFreq: this.omenDocFreq,
            wordFreq: this.omenFrequencies.map(map => Object.fromEntries(map)),
            totalDocs: this.totalProphecies,
            weightExponent: this.weightExponent
        };

        if (this.avgOmenSize !== null && this.omens.length > 0) {
            oracleTome.avgWordSize = this.avgOmenSize;
        }

        const jsonStr = JSON.stringify(oracleTome);
        const compressedData = zlib.gzipSync(jsonStr);
        await fs.promises.writeFile(this.file, compressedData);
        this.avgOmenSize = compressedData.length / this.omens.length;
    }

    /**
     * reset
     * 
     * Resets the oracle tome (model) to an empty state.
     */
    reset() {
        this.oracleMapping = new Map();
        this.oracleCategories = [];
        this.omenMapping = new Map();
        this.omens = [];
        this.divineDocCount = [];
        this.omenCount = [];
        this.omenFrequencies = [];
        this.omenDocFreq = [];
        this.totalProphecies = 0;
        this.avgOmenSize = null;
    }

    /**
     * learn
     * 
     * Records a new prophecy (text) under a specified oracle category.
     * It registers new categories as needed, extracts omens from the text,
     * and updates frequencies and counts.
     * 
     * @param {string} text - The prophetic text.
     * @param {string} category - The oracle category for the prophecy.
     *
     * References:
     * - Techniques for supervised text classification using TF-IDF.
     */
    async learn(text, category) {
        await this.initialized;
        if (!this.oracleMapping.has(category)) {
            const oracleId = this.oracleCategories.length;
            this.oracleMapping.set(category, oracleId);
            this.oracleCategories.push(category);
            this.divineDocCount[oracleId] = 0;
            this.omenCount[oracleId] = 0;
            this.omenFrequencies[oracleId] = new Map();
        }
        const oracleId = this.oracleMapping.get(category);

        const omensList = this.chant(text);
        const uniqueOmens = new Set(omensList);

        // Register new omens
        for (const omen of uniqueOmens) {
            if (!this.omenMapping.has(omen)) {
                const omenId = this.omens.length;
                this.omenMapping.set(omen, omenId);
                this.omens.push(omen);
                this.omenDocFreq[omenId] = 0;
            }
        }

        // Update global omen frequency
        for (const omen of uniqueOmens) {
            const omenId = this.omenMapping.get(omen);
            this.omenDocFreq[omenId]++;
        }

        // Update oracle category counts
        this.divineDocCount[oracleId]++;
        for (const omen of omensList) {
            const omenId = this.omenMapping.get(omen);
            const current = this.omenFrequencies[oracleId].get(omenId) || 0;
            this.omenFrequencies[oracleId].set(omenId, current + 1);
            this.omenCount[oracleId]++;
        }
        this.totalProphecies++;
    }

    /**
     * size
     * 
     * Computes the estimated size of the compressed oracle tome (model).
     * Forces recalculation if necessary.
     * 
     * @param {boolean} force - If true, force recalculation of the average omen size.
     * @returns {number} - Estimated total size in bytes.
     *
     * References:
     * - Model size estimation techniques in data compression.
     */
    async size(force = false) {
        await this.initialized;
        if (typeof this.avgOmenSize !== 'number' || this.avgOmenSize <= 0 || force) {
            const oracleTome = {
                idToCategory: this.oracleCategories,
                idToWord: this.omens,
                docCount: this.divineDocCount,
                wordCount: this.omenCount,
                docFreq: this.omenDocFreq,
                wordFreq: this.omenFrequencies.map(map => Object.fromEntries(map)),
                totalDocs: this.totalProphecies,
                weightExponent: this.weightExponent
            };
            const jsonStr = JSON.stringify(oracleTome);
            const compressedData = zlib.gzipSync(jsonStr);
            this.avgOmenSize = compressedData.length / this.omens.length;
        }
        return this.avgOmenSize * this.omens.length;
    }

    /**
     * norm
     * 
     * Normalizes and sorts the oracle prediction results.
     * Adjusts scores to prevent distortions.
     * 
     * @param {Object[]} results - Array of result objects with { category, score }.
     * @param {number} limit - Maximum number of results to return.
     * @returns {Object[]} - Normalized and sorted results.
     *
     * References:
     * - Output normalization in probabilistic text classification.
     */
    norm(results, limit = 5) {
        if (results.length === 0) return [];
        if (this.capitalize) {
            results.forEach(result => {
                result.category = result.category.charAt(0).toUpperCase() + result.category.slice(1);
            });
        }
        const minScore = Math.min(...results.map(r => r.score));
        const maxScore = Math.max(...results.map(r => r.score));
        const range = maxScore - minScore || 1;
        results.forEach(result => {
            result.score = ((result.score - minScore) / range) * 0.99 + 0.01;
        });
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    /**
     * predict
     * 
     * Predicts the oracle category (prophecy outcome) for the input text using a TF-IDF-based approach.
     * Returns a list of predicted categories with normalized probability scores.
     * 
     * @param {string} text - The input text for which to predict a category.
     * @param {number} limit - Maximum number of output categories.
     * @returns {Object[]} - Array of objects: { category, score }.
     *
     * References:
     * - TF-IDF and probabilistic classification methods.
     */
    async predict(text, limit = 5) {
        await this.initialized;
        if (this.totalProphecies === 0) return [];

        if(typeof text === 'object') {
            return this.predictW(text, limit);
        }

        const omensList = this.chant(text);
        const idFreq = new Map();
        for (const omen of omensList) {
            const omenId = this.omenMapping.get(omen);
            if (omenId !== undefined) {
                idFreq.set(omenId, (idFreq.get(omenId) || 0) + 1);
            }
        }

        const scores = new Map();
        let maxScore = -Infinity;
        const totalProphecies = this.totalProphecies;
        for (const [category, oracleId] of this.oracleMapping) {
            const docsInCategory = this.divineDocCount[oracleId];
            if (docsInCategory === 0) continue;

            const logPrior = Math.log(docsInCategory / totalProphecies);
            let logLikelihood = 0;
            idFreq.forEach((tf, omenId) => {
                const df = this.omenDocFreq[omenId] || 0;
                const idf = Math.log((totalProphecies + 1) / (df + 1)); // Smoothing applied
                const tfidf = tf * idf;
                const freq = this.omenFrequencies[oracleId].get(omenId) || 0;
                const totalOmens = this.omenCount[oracleId];
                const pOmen = (freq + 1) / (totalOmens + this.omens.length);
                logLikelihood += tfidf * Math.log(pOmen);
            });
            const score = logPrior + logLikelihood;
            scores.set(category, score);
            maxScore = Math.max(maxScore, score);
        }

        let sumExp = 0;
        const results = [];
        scores.forEach((score, category) => {
            const expScore = Math.exp(score - maxScore);
            sumExp += expScore;
            results.push({ category, score: expScore });
        });

        return this.norm(
            results.map(r => ({ ...r, score: r.score / sumExp })),
            limit
        );
    }

    /**
     * predictW
     * 
     * Similar to predict but processes multiple texts with associated weights.
     * It computes a weighted TF-IDF and predicts the oracle category accordingly.
     * 
     * @param {Object} inputObj - An object mapping texts to their weights.
     * @param {number} limit - Maximum number of output categories.
     * @returns {Object[]} - Array of predicted categories with weighted normalized scores.
     *
     * References:
     * - Weighted TF-IDF approaches in multi-document classification.
     */
    async predictW(inputObj, limit = 5) {
        await this.initialized;
        if (this.totalProphecies === 0 || this.oracleCategories.length === 0) return [];
    
        const idFreq = new Map();
        const weightExponent = this.weightExponent;
        const totalProphecies = this.totalProphecies;
    
        // Process each entry with its weight
        for (const [rawText, weight] of Object.entries(inputObj)) {
            const omensList = this.chant(rawText);
            for (const omen of omensList) {
                const omenId = this.omenMapping.get(omen);
                if (omenId === undefined) continue;
                const weightedCount = Math.pow(weight, weightExponent);
                idFreq.set(omenId, (idFreq.get(omenId) || 0) + weightedCount);
            }
        }
    
        // Calculate weighted TF-IDF
        const tfIdf = new Map();
        idFreq.forEach((tf, omenId) => {
            const df = this.omenDocFreq[omenId] || 0;
            const idf = Math.log((totalProphecies + 1) / (df + 1));
            tfIdf.set(omenId, tf * idf);
        });
    
        // Calculate scores for each oracle category
        const scores = new Map();
        let maxScore = -Infinity;
        for (const [category, oracleId] of this.oracleMapping) {
            const docsInCategory = this.divineDocCount[oracleId];
            if (docsInCategory === 0) continue;
            const logPrior = Math.log(docsInCategory / totalProphecies);
            let logLikelihood = 0;
            tfIdf.forEach((weight, omenId) => {
                const freq = this.omenFrequencies[oracleId].get(omenId) || 0;
                const totalOmens = this.omenCount[oracleId];
                const pOmen = (freq + 1) / (totalOmens + this.omens.length);
                logLikelihood += weight * Math.log(pOmen);
            });
            const score = logPrior + logLikelihood;
            scores.set(category, score);
            maxScore = Math.max(maxScore, score);
        }
    
        let sumExp = 0;
        const results = [];
        scores.forEach((score, category) => {
            const expScore = Math.exp(score - maxScore);
            sumExp += expScore;
            results.push({ category, score: expScore });
        });
    
        return this.norm(
            results.map(r => ({ ...r, score: r.score / sumExp })),
            limit
        );
    }
}
