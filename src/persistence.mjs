import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import axios from 'axios';

/**
 * Compresses the input data using gzip.
 * @param {string} data - Data to be compressed.
 * @returns {Promise<Buffer>}
 */
export function condense(data) {
    return new Promise((resolve, reject) => {
        zlib.gzip(data, (err, condensed) => {
            if (err) return reject(err);
            resolve(condensed);
        });
    });
}

/**
 * Decompresses the input data using gunzip.
 * @param {Buffer} data - Data to be decompressed.
 * @returns {Promise<Buffer>}
 */
export function expand(data) {
    return new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, expanded) => {
            if (err) return reject(err);
            resolve(expanded);
        });
    });
}

/**
 * Loads the model from a file, decompresses it, and restores its structure.
 * @param {string} file - File path.
 * @returns {Promise<Object>}
 */
export async function loadModel(file) {
    // Read and decompress the file content
    const condensedData = await fs.promises.readFile(file);
    const jsonStr = await expand(condensedData);
    if (!jsonStr) throw new Error('Decompressed data is empty');
    
    // Parse the JSON data
    const data = JSON.parse(jsonStr.toString('utf-8'));
    
    // Restore Maps from serialized arrays/objects
    data.categoryStemToId = new Map(data.categoryStemToId);
    data.categoryVariations = new Map(
        Object.entries(data.categoryVariations || {}).map(([stem, variations]) => [
            stem,
            new Map(Object.entries(variations))
        ])
    );
    
    // Restore omenFrequencies as an array of Maps
    if (data.omenFrequencies) {
        data.omenFrequencies = data.omenFrequencies.map(item => new Map(Object.entries(item)));
    }
    // 'omens' is expected to remain an array
    return data;
}

/**
 * Imports a model from a remote URL and saves it to the specified file.
 * @param {string} url - Remote URL.
 * @param {string} file - Destination file path.
 */
export async function importModel(url, file) {
    // Ensure the directory exists
    await fs.promises.mkdir(path.dirname(file), { recursive: true }).catch(() => { });
    const writer = fs.createWriteStream(file);
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: { 'Accept-Encoding': 'gzip,deflate' }
    });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

/**
 * Saves the model data to a file after compressing it.
 * @param {string} outputFile - Destination file path.
 * @param {Object} data - Model data.
 */
export async function saveModel(outputFile, data) {
    // Normalize the data by converting Maps into serializable arrays/objects.
    const normalizedData = {
        ...data,
        categoryStemToId: Array.from(data.categoryStemToId.entries()),
        categoryVariations: Object.fromEntries(
            [...data.categoryVariations.entries()].map(([stem, variations]) => [
                stem,
                Object.fromEntries(variations)
            ])
        ),
        // Normalize omenFrequencies: convert each Map in the array to an object.
        omenFrequencies: data.omenFrequencies
            ? data.omenFrequencies.map(map => Object.fromEntries(map))
            : undefined
        // 'omens' remains as an array.
    };
    const jsonStr = JSON.stringify(normalizedData);
    const condensedData = await condense(jsonStr);
    await fs.promises.mkdir(path.dirname(outputFile), { recursive: true }).catch(() => { });
    await fs.promises.writeFile(outputFile, condensedData);
}
