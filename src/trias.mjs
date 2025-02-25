import { getStemmer } from './stemmer.mjs';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

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
        initIfMissing = true,
        n = 3,
        language = 'en',
        weightExponent = 2,
        capitalize = false,
        excludes = ['separator', 'separador', 'hd', 'hevc', 'sd', 'fullhd', 'fhd', 'channels', 'canais', 'aberto', 'abertos', 'world', 'países', 'paises', 'countries', 'ww', 'live', 'ao vivo', 'en vivo', 'directo', 'en directo', 'unknown', 'other', 'others'],
        size = 4096 * 1024  // Approximate model size in bytes (limit for the prophetic tome)
    } = {}) {
        this.file = file;
        this.weightExponent = weightExponent;
        this.initIfMissing = initIfMissing;
        this.n = n;
        this.stemmer = getStemmer(language);
        this.maxModelSize = size;
        this.avgOmenSize = null;  // Average size per omen (calculated from condensed model file)

        // Diviner mapping: maps diviner names to IDs
        this.divinerMapping = new Map();
        this.divinerGroups = [];
        
        // Divine document count per diviner category (number of prophecies per category)
        this.divinerDocCount = []; // Index: divinerId, Value: count
        this.omenCount = [];      // Index: divinerId, Value: total omen count
        this.omenFrequencies = []; // Index: divinerId, Value: Map<omenId, count>
        
        // Omen mapping (n-grams representing omens in the prophecy)
        this.omenMapping = new Map();
        this.omens = [];
        this.omenDocFreq = [];    // Index: omenId, Value: global frequency
        
        this.totalTransmissions = 0; // Total number of recorded prophecies
        this.capitalize = capitalize;
        this.excludes = new Set(excludes);
        // Initialize the oracle (invoke the prophetic Trias)
        this.initialized = this.init();
    }

    async condense(data) {
        return await new Promise((resolve, reject) => {
            zlib.gzip(data, (err, condensed) => {
                if (err) reject(err);
                resolve(condensed);
            });
        });
    }

    async expand(data) {
        return await new Promise((resolve, reject) => {
            zlib.gunzip(data, (err, expanded) => {
                if (err) reject(err);
                resolve(expanded);
            });
        });
    }

    /**
     * init
     * 
     * Initializes the Trias oracle by cleansing the exclusion list with the stemmer
     * and loading the existing oracle tome.
     */
    async init() {
        this.excludes = new Set([...this.excludes].map(exclude => this.stemmer.stem(exclude)));
        await this.load();
    }

    /**
     * chant
     * 
     * Prepares the omens (n-grams) from the provided text.
     * It tokenizes the text, applies the stemmer, filters out excluded terms,
     * and generates n-grams up to the specified 'n' value.
     * 
     * @param {string} text - The input text to be processed.
     * @returns {string[]} - Array of omens (n-grams).
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
     * Loads the oracle tome (model) from a condensed file, reconstructing
     * all diviner categories and omen mappings. If the file does not exist
     * and initialization is allowed, the model is reset.
     */
    async load() {
        try {
            const condensedData = await fs.promises.readFile(this.file);
            const jsonStr = await this.expand(condensedData);
            const oracleTome = JSON.parse(jsonStr);

            // Load the mapping of diviner categories
            this.divinerGroups = oracleTome.idToCategory || [];
            this.divinerMapping = new Map(this.divinerGroups.map((cat, id) => [cat, id]));

            // Load the mapping of omens
            this.omens = oracleTome.idToWord || [];
            this.omenMapping = new Map(this.omens.map((omen, id) => [omen, id]));

            // Convert numerical structures
            this.divinerDocCount = oracleTome.docCount ? Array(oracleTome.docCount.length).fill(0).map(Number) : [];
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

            this.totalTransmissions = Number(oracleTome.totalDocs) || 0;
            this.weightExponent = Number(oracleTome.weightExponent) || 2;

            // Update average omen size
            if (this.omens.length > 0) {
                this.avgOmenSize = condensedData.length / this.omens.length;
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
     * Reduces the model size by removing the least frequent omens if the condensed model exceeds maxModelSize.
     */
    async purgeLesserOmens() {
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

        // Update each diviner category's omen frequencies
        for (let divinerId = 0; divinerId < this.omenFrequencies.length; divinerId++) {
            const oldMap = this.omenFrequencies[divinerId];
            const newMap = new Map();
            for (const [omenId, count] of oldMap.entries()) {
                if (mapping.has(omenId)) {
                    newMap.set(mapping.get(omenId), count);
                }
            }
            this.omenFrequencies[divinerId] = newMap;
            let newTotal = 0;
            for (const count of newMap.values()) {
                newTotal += count;
            }
            this.omenCount[divinerId] = newTotal;
        }

        // Update global omen structures
        this.omens = newOmens;
        this.omenMapping = newOmenMapping;
        this.omenDocFreq = newDocFreq;
    }

    /**
     * save
     * 
     * Serializes and writes the oracle tome (model) to the condensed file.
     * It first purges lesser omens if necessary.
     */
    async save() {
        await this.initialized;
        await this.purgeLesserOmens();

        const oracleTome = {
            idToCategory: this.divinerGroups,
            idToWord: this.omens,
            docCount: this.divinerDocCount,
            wordCount: this.omenCount,
            docFreq: this.omenDocFreq,
            wordFreq: this.omenFrequencies.map(map => Object.fromEntries(map)),
            totalDocs: this.totalTransmissions,
            weightExponent: this.weightExponent
        };

        if (this.avgOmenSize !== null && this.omens.length > 0) {
            oracleTome.avgWordSize = this.avgOmenSize;
        }

        const jsonStr = JSON.stringify(oracleTome);
        const condensedData = await this.condense(jsonStr);
        
        await fs.promises.mkdir(path.dirname(this.file), { recursive: true }).catch(() => {});
        await fs.promises.writeFile(this.file, condensedData);
        this.avgOmenSize = condensedData.length / this.omens.length;
    }

    /**
     * reset
     * 
     * Resets the oracle tome (model) to an empty state.
     */
    reset() {
        this.divinerMapping = new Map();
        this.divinerGroups = [];
        this.omenMapping = new Map();
        this.omens = [];
        this.divinerDocCount = [];
        this.omenCount = [];
        this.omenFrequencies = [];
        this.omenDocFreq = [];
        this.totalTransmissions = 0;
        this.avgOmenSize = null;
    }

    /**
     * learn
     * 
     * Records a new prophecy (text) under a specified diviner category.
     * Registers new categories as needed, extracts omens from the text,
     * and updates frequencies and counts.
     * 
     * @param {string | object} text - The prophetic text. You can also provide an object with an `input` property (string) and an `output` property (string).
     * @param {string} category - The diviner category for the prophecy.
     */
    async learn(text, category) {
        if (Array.isArray(text)) {
            for (const t of text) {
                if(category) {
                    await this.learn(t, category);
                } else {
                    await this.learn(t.input, t.output);
                }
            }
            return;
        }

        if (typeof(text) === 'object' && typeof(text.input) === 'string') {
            text = text.input;
            category = text.output;
        }

        await this.initialized;
        if (!this.divinerMapping.has(category)) {
            const oracleId = this.divinerGroups.length;
            this.divinerMapping.set(category, oracleId);
            this.divinerGroups.push(category);
            this.divinerDocCount[oracleId] = 0;
            this.omenCount[oracleId] = 0;
            this.omenFrequencies[oracleId] = new Map();
        }
        const oracleId = this.divinerMapping.get(category);

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

        // Update the diviner category counts
        this.divinerDocCount[oracleId]++;
        for (const omen of omensList) {
            const omenId = this.omenMapping.get(omen);
            const current = this.omenFrequencies[oracleId].get(omenId) || 0;
            this.omenFrequencies[oracleId].set(omenId, current + 1);
            this.omenCount[oracleId]++;
        }
        this.totalTransmissions++;
    }

    /**
     * size
     * 
     * Computes the estimated size of the condensed oracle tome (model).
     * Forces recalculation if necessary.
     * 
     * @param {boolean} force - If true, forces recalculation of the average omen size.
     * @returns {number} - Estimated total size in bytes.
     */
    async size(force = false) {
        await this.initialized;
        if (typeof this.avgOmenSize !== 'number' || this.avgOmenSize <= 0 || force) {
            const oracleTome = {
                idToCategory: this.divinerGroups,
                idToWord: this.omens,
                docCount: this.divinerDocCount,
                wordCount: this.omenCount,
                docFreq: this.omenDocFreq,
                wordFreq: this.omenFrequencies.map(map => Object.fromEntries(map)),
                totalDocs: this.totalTransmissions,
                weightExponent: this.weightExponent
            };
            const jsonStr = JSON.stringify(oracleTome);
            const condensedData = await this.condense(jsonStr);
            this.avgOmenSize = condensedData.length / this.omens.length;
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
     * @param {Object} options - Options object with:
     *   - `as` (string): Desired output format ('string', 'array', or 'objects').
     *   - `limit` (number): Maximum number of results to return.
     * @returns {Object[]} - Normalized and sorted results.
     */
    norm(results, options = {as: 'string', limit: 5}) {
        if (results.length) {
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
            results = results.sort((a, b) => b.score - a.score);
            if (options.limit) {
                results = results.slice(0, options.limit);
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
     * predict
     * 
     * Predicts the diviner category (prophecy outcome) for the input text using a TF-IDF-based approach.
     * Returns a list of predicted categories with normalized probability scores.
     * 
     * @param {string} text - The input text for which to predict a category.
     * @param {Object} options - Options object with:
     *   - `as` (string): Desired output format ('string', 'array', or 'objects').
     *   - `limit` (number): Maximum number of results to return.
     * @returns {Object[]} - Array of objects: { category, score }.
     */
    async predict(text, options = {as: 'string', limit: 1}) {
        await this.initialized;
        if (this.totalTransmissions === 0) return this.norm([], options);

        if (typeof text === 'object') {
            return this.predictWeighted(text, options);
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
        const totalTransmissions = this.totalTransmissions;
        for (const [category, oracleId] of this.divinerMapping) {
            const docsInCategory = this.divinerDocCount[oracleId];
            if (docsInCategory === 0) continue;

            const logPrior = Math.log(docsInCategory / totalTransmissions);
            let logLikelihood = 0;
            idFreq.forEach((tf, omenId) => {
                const df = this.omenDocFreq[omenId] || 0;
                const idf = Math.log((totalTransmissions + 1) / (df + 1)); // Smoothing applied
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
            options
        );
    }

    /**
     * predictWeighted
     * 
     * Similar to predict but processes multiple texts with associated weights.
     * It computes a weighted TF-IDF and predicts the diviner category accordingly.
     * 
     * @param {Object} inputObj - An object mapping texts to their weights.
     * @param {Object} options - Options object with:
     *   - `as` (string): Desired output format ('string', 'array', or 'objects').
     *   - `limit` (number): Maximum number of results to return.
     * @returns {Object[]} - Array of predicted categories with normalized scores.
     */
    async predictWeighted(inputObj, options) {
        await this.initialized;
        if (this.totalTransmissions === 0 || this.divinerGroups.length === 0) return [];
    
        const idFreq = new Map();
        const weightExponent = this.weightExponent;
        const totalTransmissions = this.totalTransmissions;
    
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
            const idf = Math.log((totalTransmissions + 1) / (df + 1));
            tfIdf.set(omenId, tf * idf);
        });
    
        // Calculate scores for each diviner category
        const scores = new Map();
        let maxScore = -Infinity;
        for (const [category, oracleId] of this.divinerMapping) {
            const docsInCategory = this.divinerDocCount[oracleId];
            if (docsInCategory === 0) continue;
            const logPrior = Math.log(docsInCategory / totalTransmissions);
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
            options
        );
    }
}
