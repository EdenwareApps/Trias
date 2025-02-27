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
            'divinerGroups',
            'divinerDocCount',
            'omenCount',
            'omenFrequencies',
            'omenMapping',
            'omens',
            'omenDocFreq',
            'totalTransmissions'
        ]);

        this.initialized = this.init();
    }

    toJSON() {
        const result = {};
        for (const p of this.contextProperties) {
            result[p] = this[p];
        }
        return result;
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
        const model = await Persistence.loadModel(modelFile);

        this.divinerGroups = model.divinerGroups || [];
        this.categoryStemToId = new Map(this.divinerGroups.map((stem, id) => [stem, id]));

        // Restore categoryVariations, converting inner values to numbers
        this.categoryVariations = new Map();
        if (model.categoryVariations instanceof Map) {
            for (const [stem, variations] of model.categoryVariations) {
                const converted = new Map();
                for (const [k, v] of variations) {
                    converted.set(k, Number(v));
                }
                this.categoryVariations.set(stem, converted);
            }
        } else if (model.categoryVariations) {
            for (const [stem, variations] of Object.entries(model.categoryVariations)) {
                const converted = new Map();
                for (const [k, v] of Object.entries(variations)) {
                    converted.set(k, Number(v));
                }
                this.categoryVariations.set(stem, converted);
            }
        }

        this.omens = model.omens || [];
        this.omenMapping = new Map(this.omens.map((omen, id) => [omen, id]));
        this.divinerDocCount = model.divinerDocCount ? model.divinerDocCount.map(Number) : [];
        this.omenCount = model.omenCount ? model.omenCount.map(Number) : [];
        this.omenDocFreq = model.omenDocFreq ? model.omenDocFreq.map(Number) : [];

        // Restore omenFrequencies as an array of Maps, converting keys to numbers
        this.omenFrequencies = [];
        if (model.omenFrequencies && Array.isArray(model.omenFrequencies)) {
            for (let entry of model.omenFrequencies) {
                let newMap = new Map();
                if (entry instanceof Map) {
                    for (const [k, v] of entry) {
                        newMap.set(Number(k), v);
                    }
                } else {
                    for (const [k, v] of Object.entries(entry)) {
                        newMap.set(Number(k), v);
                    }
                }
                this.omenFrequencies.push(newMap);
            }
        }

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
        // check category agains this.excludes
        if (category && this.excludes.has(category.trim().toLowerCase())) {
            return;
        } else if(Array.isArray(text)) {
            text = text.filter(item => !this.excludes.has(item.output.trim().toLowerCase()));
            if(text.length === 0) return;
        }
        Training.trainText(text, category, this);
        if (this.size > (this.maxModelSize * 1.5)) {
            await this.purge();
        }
    }

    async predict(text, options = { as: 'string', limit: 1 }) {
        await this.initialized;
        const results = Prediction.predictText(text, this);
        return Prediction.norm(results, options, this.bestVariant.bind(this), this.capitalize);
    }

    bestVariant(stemmedCategory) {
        const variationCounts = this.categoryVariations.get(stemmedCategory);
        if (!variationCounts) return stemmedCategory;
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
    }

    async save() {
        await this.initialized;
        await this.purge();
        await Persistence.saveModel(this.file, this);
        const { size } = await fs.promises.stat(this.file).catch(() => ({ size: 0 }));
        this.avgOmenSize = size / this.omens.length;
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
