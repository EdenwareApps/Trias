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
        this.stemmer = getStemmer(language);
        this.maxModelSize = size;
        this.avgOmenSize = null;  // Average size per omen (calculated from condensed model file)

        // Model state variables
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
        this.totalTransmissions = 0;
        this.capitalize = capitalize;
        this.excludes = new Set(excludes);

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
            'stemmer',
            'maxModelSize',
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
            'totalTransmissions'
        ]);

        this.trained = Promise.resolve();
        this.initialized = this.init();
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
        data.omenFrequencies = data.omenFrequencies.map(item => new Map(Object.entries(item)));
        
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
          } else {
            result[p] = this[p];
          }
        }
        return JSON.stringify(result, null, 2);
    }

    async init() {
        try {
            await this.load(this.file);
        } catch (err) {
            if (err.code === 'ENOENT' && this.create) {
                this.reset();
            } else {
                throw err;
            }
        }

        // Handle auto-import if enabled and the model is empty
        if (this.autoImport && this.totalTransmissions === 0) {
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

        this.totalTransmissions = Number(model.totalTransmissions) || 0;
        this.weightExponent = Number(model.weightExponent) || 2;

        if (this.omens.length > 0) {
            const { size } = await fs.promises.stat(modelFile).catch(() => ({ size: 0 }));
            this.avgOmenSize = size / this.omens.length;

            if (size > this.maxModelSize) {
                await this.purge();
            }
        }
        return true;
    }

    get size() {
        if (this.avgOmenSize > 0) return this.omens.length * this.avgOmenSize;
        return 0;
    }

    async train(text, category) {
        await this.initialized;
        let release;
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
        
        if (!this.isPurging && !this.isSaving && this.size > (this.maxModelSize * 1.5)) { // tame the model size
            await this.purge().catch(() => {});
        }

        release();
    }

    async predict(text, options = { as: 'string', amount: 1 }) {
        await this.initialized;
        await this.trained;
        const results = Prediction.predictText(text, this);
        return Prediction.norm(results, options, this.bestVariant.bind(this), this.capitalize);
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
     * getRelatedCategories
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
    getRelatedCategories(inputScores, options = { as: 'objects', amount: 5 }) {
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
        // Calculate the allowed number of omens based on max model size and average omen size.
        const allowedOmens = Math.floor(this.maxModelSize / this.avgOmenSize);
        if (this.omens.length <= allowedOmens) return;

        this.isPurging = true; // set it after not returning
        
        let err = null;
        try {
            // Create an array of omen indices paired with their frequency (from omenCount).
            const omenFrequencyArray = this.omenCount.map((count, idx) => ({ idx, count }));

            // Sort the array in descending order based on frequency.
            omenFrequencyArray.sort((a, b) => b.count - a.count);

            // Select indices of the top allowed omens.
            const allowedIndices = new Set(omenFrequencyArray.slice(0, allowedOmens).map(item => item.idx));

            // Build new arrays for omens, omenFrequencies, and omenCount based on allowed indices.
            const newOmens = [];
            const newOmenFrequencies = [];
            const newOmenCount = [];

            for (let i = 0; i < this.omens.length; i++) {
                if (allowedIndices.has(i)) {
                    newOmens.push(this.omens[i]);
                    newOmenFrequencies.push(this.omenFrequencies[i]);
                    newOmenCount.push(this.omenCount[i]);
                }
            }

            // Update the model's omen-related properties.
            this.omens = newOmens;
            this.omenFrequencies = newOmenFrequencies;
            this.omenCount = newOmenCount;

            // Rebuild the omenMapping based on the new omens array.
            this.omenMapping = new Map(this.omens.map((omen, idx) => [omen, idx]));

            await this.save();
        } catch (e) {
            err = e;
        } finally {
            this.isPurging = false;
        }
        if (err) throw err;
    }

    async save() {
        this.isSaving = true;
        let err = null;
        try {
            await this.initialized;
            await this.trained;
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
        this.totalTransmissions = 0;
    }

    async destroy() {
        this.reset();
        this.initialized = Promise.reject(new Error('Trias destroyed'));
    }
}
