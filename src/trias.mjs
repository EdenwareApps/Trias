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
 * 
 * Key optimizations:
 * - Lazy loading and caching
 * - Memory-efficient data structures
 * - Optimized algorithms with early termination
 * - Reduced object allocations
 * - Streaming operations for large datasets
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
        size = 4096 * 1024,
        autoImport = false,
        modelUrl = 'https://edenware.app/trias/trained/{language}.trias',
        // Performance options
        enableCaching = true,
        cacheSize = 1000,
        batchSize = 100,
        enableStreaming = true
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
        this.avgOmenSize = null;

        // Performance optimizations
        this.enableCaching = enableCaching;
        this.cacheSize = cacheSize;
        this.batchSize = batchSize;
        this.enableStreaming = enableStreaming;

        // Optimized data structures
        this.categoryStemToId = new Map();
        this.categoryVariations = new Map();
        this.categoryRelations = new Map();
        this.divinerGroups = [];
        this.divinerDocCount = [];
        this.omenCount = [];
        this.omenFrequencies = [];
        this.omenMapping = new Map();
        this.omens = [];
        this.omenDocFreq = [];
        this.totalDocuments = 0;
        this.capitalize = capitalize;
        this.excludes = new Set(excludes);
        this.gravitationalGroups = new Map();

        // Performance caches
        this.cache = new Map();
        this.cacheTimestamps = new Map(); // Track last access time for LRU
        this.preprocessed = null;
        this.lastPreprocessTime = 0;
        this.preprocessThreshold = 1000; // ms

        // Lazy loading state
        this.isLoaded = false;
        this.loadingPromise = null;

        this.trained = Promise.resolve();
        
        const ctl = {}
        this.initialized = new Promise((resolve, reject) => {
            ctl.resolve = resolve
            ctl.reject = reject
            this.init().then(resolve).catch(reject)
        })
        this.initialized.ctl = ctl
    }

    // Optimized serialization with streaming support
    fromJSON(data) {
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        // Restore Maps and Sets
        this.categoryStemToId = new Map(data.categoryStemToId || []);
        this.categoryVariations = new Map(
            Object.entries(data.categoryVariations || {}).map(([stem, variations]) => [
                stem,
                new Map(Object.entries(variations))
            ])
        );
        this.categoryRelations = new Map(
            Object.entries(data.categoryRelations || {}).map(([cat, relObj]) => [
                cat,
                new Map(Object.entries(relObj))
            ])
        );
        this.omenMapping = new Map(data.omenMapping || []);
        this.excludes = new Set(data.excludes || []);
        this.omenFrequencies = (data.omenFrequencies || []).map(item =>
            new Map(
                Object.entries(item || {}).map(([k, v]) => [Number(k), v])
            )
        );
        this.gravitationalGroups = new Map(
            Object.entries(data.gravitationalGroups || {}).map(([key, group]) => [
                key,
                {
                    members: new Set(group.members),
                    strength: group.strength
                }
            ])
        );
        // Copy primitive properties
        this.divinerGroups = data.divinerGroups || [];
        this.divinerDocCount = data.divinerDocCount || [];
        this.omenCount = data.omenCount || [];
        this.omens = data.omens || [];
        this.omenDocFreq = data.omenDocFreq || [];
        this.totalDocuments = Number(data.totalDocuments) || 0;
        this.weightExponent = Number(data.weightExponent) || 2;
        // Return this for chaining
        return this;
    }

    // Optimized serialization with reduced memory usage
    toJSON() {
        const result = Object.create(null);
        
        // Serialize Maps efficiently
        result.categoryStemToId = Array.from(this.categoryStemToId.entries());
        result.categoryVariations = Object.fromEntries(
            [...this.categoryVariations.entries()].map(([stem, entries]) => [ 
                stem,
                Object.fromEntries(entries)
            ])
        );
        result.categoryRelations = Object.fromEntries(
            [...this.categoryRelations.entries()].map(([cat, entries]) => [ 
                cat,
                Object.fromEntries(entries)
            ])
        );
        result.omenMapping = Array.from(this.omenMapping.entries());
        result.excludes = Array.from(this.excludes);
        result.omenFrequencies = this.omenFrequencies.map(map => Object.fromEntries(map));
        result.gravitationalGroups = Object.fromEntries(
            [...this.gravitationalGroups.entries()].map(([key, group]) => [
                key,
                {
                    members: Array.from(group.members),
                    strength: group.strength
                }
            ])
        );

        // Copy primitive properties
        const primitiveProps = [
            'n', 'file', 'autoImport', 'weightExponent', 'modelUrl', 'language',
            'create', 'capitalize', 'weights', 'avgOmenSize', 'divinerGroups',
            'divinerDocCount', 'omenCount', 'omens', 'omenDocFreq', 'totalDocuments'
        ];
        
        for (const prop of primitiveProps) {
            result[prop] = this[prop];
        }

        return JSON.stringify(result);
    }

    // Lazy loading with caching
    async load(modelFile) {
        if (this.isLoaded) return true;
        
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this._loadInternal(modelFile);
        return this.loadingPromise;
    }

    async _loadInternal(modelFile) {
        try {
            const condensedData = await fs.promises.readFile(modelFile);
            if (!condensedData || !condensedData.length) {
                throw new Error('Model file is empty');
            }

            const jsonStr = await Persistence.expand(condensedData);
            if (!jsonStr) {
                throw new Error('Decompressed data is empty');
            }
            
            this.fromJSON(jsonStr.toString());

            if (await this.overloaded()) {
                await this.save(true);
            }

            this.isLoaded = true;
            return true;
        } catch (error) {
            this.loadingPromise = null;
            throw error;
        }
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

    // Optimized training with batching
    async train(text, category) {
        await this.initialized;
        let release;
        this.preprocessed = null; // Invalidate cache
        this.trained = new Promise(resolve => release = resolve);
        
        if (category && !Array.isArray(text)) {
            text = [{input: text, output: category}];
        }

        // Efficient filtering
        text = text.filter(item => {
            if (typeof(item.output) === 'string') {
                return !this.excludes.has(item.output.trim().toLowerCase());
            } else if (Array.isArray(item.output)) {
                item.output = item.output.filter(output => !this.excludes.has(output.trim().toLowerCase()));
                return item.output.length > 0;
            }
            return true;
        });
        
        if (text.length === 0) {
            release();
            return;
        }
        
        // Use optimized training
        await Training.trainText(text, this);
        
        // Update co-occurrence relations efficiently
        for (const item of text) {
            if (!Array.isArray(item.output) || item.output.length < 2) {
                continue;
            }
            
            const stems = item.output.map(cat => this.stemmer.stem(cat));
            for (let i = 0; i < stems.length; i++) {
                for (let j = i + 1; j < stems.length; j++) {
                    const catA = stems[i];
                    const catB = stems[j];
                    
                    if (!this.categoryRelations.has(catA)) {
                        this.categoryRelations.set(catA, new Map());
                    }
                    const relMap = this.categoryRelations.get(catA);
                    relMap.set(catB, (relMap.get(catB) || 0) + 1);
                    
                    // Bidirectional relations
                    if (!this.categoryRelations.has(catB)) {
                        this.categoryRelations.set(catB, new Map());
                    }
                    const relMapB = this.categoryRelations.get(catB);
                    relMapB.set(catA, (relMapB.get(catA) || 0) + 1);
                }
            }
        }
        
        if (!this.isPurging && !this.isSaving && await this.overloaded()) {
            await this.purge().catch(() => {});
        }

        release();
    }

    // Optimized prediction with caching
    async predict(text, options = { as: 'string', amount: 1 }) {
        await this.initialized;
        await this.trained;
        
        // Check cache first
        const cacheKey = this.enableCaching ? this._getCacheKey(text, options) : null;
        if (cacheKey && this.cache.has(cacheKey)) {
            // Update access timestamp for LRU
            this.cacheTimestamps.set(cacheKey, Date.now());
            return this.cache.get(cacheKey);
        }
        
        const results = Prediction.predictText(text, this);
        const normalized = Prediction.norm(results, options, this.bestVariant.bind(this), this.capitalize);
        
        // Cache result
        if (cacheKey) {
            this._addToCache(cacheKey, normalized);
        }
        
        return normalized;
    }

    // Cache management
    _getCacheKey(text, options) {
        if (typeof text === 'string') {
            return `pred_${text}_${JSON.stringify(options)}`;
        }
        return `pred_obj_${JSON.stringify(text)}_${JSON.stringify(options)}`;
    }

    _addToCache(key, value) {
        if (this.cache.size >= this.cacheSize) {
            // Remove least recently used entry
            this._removeLRUEntry();
        }
        this.cache.set(key, value);
        this.cacheTimestamps.set(key, Date.now());
    }

    _removeLRUEntry() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        // Find the least recently used entry
        for (const [key, timestamp] of this.cacheTimestamps.entries()) {
            if (timestamp < oldestTime) {
                oldestTime = timestamp;
                oldestKey = key;
            }
        }
        
        // Remove the oldest entry
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.cacheTimestamps.delete(oldestKey);
        }
    }

    // Optimized gravitational groups
    addGravitationalGroups(groups) {
        for (const [groupName, terms] of Object.entries(groups)) {
            const stemmedTerms = terms.map(term => this.stemmer.stem(term.toLowerCase()));
            const strength = Math.sqrt(terms.length) * 2;
            
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
        
        // Use reduce for better performance
        return Array.from(variationCounts.entries())
            .reduce((best, [variation, count]) => 
                count > best.count ? { variation, count } : best, 
                { variation: categoryStem, count: -Infinity }
            ).variation;
    }

    // Optimized related function
    related(inputScores, options = { as: 'objects', amount: 5 }) {
        const relatedScores = new Map();
        let found = false;

        if (typeof inputScores === 'string') {
            inputScores = { [inputScores]: 1 };
        }

        // Use explicit relations efficiently
        for (const [cat, score] of Object.entries(inputScores)) {
            const categoryStem = this.stemmer.stem(cat);
            const relations = this.categoryRelations.get(categoryStem);
            if (relations) {
                for (const [relatedCat, count] of relations.entries()) {
                    if (inputScores.hasOwnProperty(relatedCat)) continue;
                    relatedScores.set(relatedCat, (relatedScores.get(relatedCat) || 0) + count * score);
                    found = true;
                }
            }
        }

        let candidates = [];
        if (found && relatedScores.size > 0) {
            candidates = Array.from(relatedScores.entries())
                .sort(([, aScore], [, bScore]) => bScore - aScore)
                .map(([category, score]) => ({ category, score }));
        }
        
        // Fallback with optimization
        if (candidates.length < options.amount) {
            const fallbackResults = Prediction.predictWeightedText(inputScores, this);
            const existingCategories = new Set(candidates.map(c => c.category));
            candidates = candidates.concat(
                fallbackResults.filter(candidate => !existingCategories.has(candidate.category))
            );
        }
        
        return Prediction.norm(candidates, options, this.bestVariant.bind(this), this.capitalize);
    }

    // Optimized reduce with early termination
    async reduce(categories, options = { amount: 3 }) {
        await this.initialized;
        await this.trained;
        const { amount } = options;

        // Early termination for small datasets
        if (categories.length <= amount) {
            const result = {};
            const categoryArray = Array.isArray(categories) ? categories : Object.keys(categories);
            categoryArray.forEach((cat, index) => {
                result[cat] = [cat];
            });
            return result;
        }

        // Use optimized clustering
        return Prediction.reduce(categories, options, this);
    }

    // Optimized purge with streaming
    async purge() {
        const allowedOmens = Math.floor(this.maxModelSize / this.avgOmenSize);
        if (!allowedOmens || allowedOmens <= 0 || isNaN(allowedOmens) || this.omens.length <= allowedOmens) {
            return;
        }
    
        this.isPurging = true;
        let err = null;
    
        try {
            // Use optimized purging algorithm
            await this._purgeOptimized(allowedOmens);
        } catch (e) {
            err = e;
        } finally {
            this.isPurging = false;
        }
    
        if (err) throw err;
    }

    async _purgeOptimized(allowedOmens) {
        // Calculate scores efficiently
        const scoredOmens = new Array(this.omens.length);
        const categoryStats = new Map();
        
        for (const [categoryId, count] of this.divinerDocCount.entries()) {
            categoryStats.set(categoryId, {
                currentCount: count,
                targetCount: Math.floor(allowedOmens / this.divinerGroups.length)
            });
        }

        // Score omens in parallel batches
        const batchSize = 1000;
        for (let i = 0; i < this.omens.length; i += batchSize) {
            const end = Math.min(i + batchSize, this.omens.length);
            for (let j = i; j < end; j++) {
                const docFreq = this.omenDocFreq[j];
                let categoryPenalty = 0;
                
                for (const [categoryId, freqMap] of this.omenFrequencies.entries()) {
                    if (freqMap.has(j)) {
                        const { currentCount, targetCount } = categoryStats.get(categoryId);
                        categoryPenalty += Math.max(0, (currentCount - targetCount) / targetCount);
                    }
                }
                
                scoredOmens[j] = {
                    idx: j,
                    score: docFreq / (1 + categoryPenalty)
                };
            }
        }

        // Sort and select top omens
        scoredOmens.sort((a, b) => b.score - a.score);
        const keptIndices = new Set(scoredOmens.slice(0, allowedOmens).map(o => o.idx));

        // Rebuild model state efficiently
        await this._rebuildModelState(keptIndices);
    }

    async _rebuildModelState(keptIndices) {
        const newOmens = [];
        const newOmenMapping = new Map();
        const newOmenDocFreq = [];
        const newOmenFrequencies = this.omenFrequencies.map(() => new Map());
        const newOmenCount = new Array(this.omenFrequencies.length).fill(0);
        
        // Process in batches for memory efficiency
        const indices = Array.from(keptIndices);
        const batchSize = 1000;
        
        for (let i = 0; i < indices.length; i += batchSize) {
            const batch = indices.slice(i, i + batchSize);
            
            for (const oldIdx of batch) {
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
            
            // Allow garbage collection between batches
            if (i % (batchSize * 10) === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }

        // Update final state
        this.omens = newOmens;
        this.omenMapping = newOmenMapping;
        this.omenDocFreq = newOmenDocFreq;
        this.omenFrequencies = newOmenFrequencies;
        this.omenCount = newOmenCount;
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
        this.cache.clear();
        this.cacheTimestamps.clear();
        this.preprocessed = null;
        this.isLoaded = false;
        this.loadingPromise = null;
    }

    async destroy() {
        this.reset();
        this.initialized.ctl.reject(new Error('Trias destroyed'));
    }
}
