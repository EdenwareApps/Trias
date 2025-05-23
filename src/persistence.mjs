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
        try {
            zlib.gzip(data, (err, condensed) => {
                if (err) return reject(err);
                resolve(condensed);
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Decompresses the input data using gunzip.
 * @param {Buffer} data - Data to be decompressed.
 * @returns {Promise<Buffer>}
 */
export function expand(data) {
    return new Promise((resolve, reject) => {
        if (!data.length) return reject(new Error('Data is empty'));
        try {
            zlib.gunzip(data, (err, expanded) => {
                if (err) return reject(err);
                resolve(expanded);
            });
        } catch (err) {
            reject(err);
        }
    });
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
export async function saveModel(outputFile, jsonStr) {
    const condensedData = await condense(jsonStr);
    await fs.promises.mkdir(path.dirname(outputFile), { recursive: true }).catch(() => { });
    await fs.promises.writeFile(outputFile, condensedData);
}
