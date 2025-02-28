// test/trias.test.mjs

import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// Configuração do __dirname para módulos ES
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'model.trias');

// Função para limpar o arquivo de modelo de teste
async function cleanup() {
  await fs.unlink(modelFile).catch(() => {});
}

async function testTrainingAndPrediction() {
  console.log("Executando: testTrainingAndPrediction");

  await cleanup();
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024
  });
  await oracle.initialized;

  // Treina com amostras para diferentes categorias
  await oracle.train([
    {input: 'Weather forecast with sunny skies', output: 'Weather'},
    {input: 'Stock market analysis with financial news', output: 'Finance'},
    {input: 'Culinary recipes and cooking tips', output: 'Cooking'}
  ]);

  // Testa predições com textos semelhantes
  let prediction = await oracle.predict('Sunny forecast');
  assert.strictEqual(prediction.toLowerCase(), 'weather', "A predição para 'Sunny forecast' deve ser 'Weather'");

  prediction = await oracle.predict('Latest financial updates');
  assert.strictEqual(prediction.toLowerCase(), 'finance', "A predição para 'Latest financial updates' deve ser 'Finance'");

  prediction = await oracle.predict('Cooking tips and recipes');
  assert.strictEqual(prediction.toLowerCase(), 'cooking', "A predição para 'Cooking tips and recipes' deve ser 'Cooking'");

  console.log("testTrainingAndPrediction passou.");
}

async function testSaveAndLoad() {
  console.log("Executando: testSaveAndLoad");

  // Cria uma instância e treina
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024
  });
  await oracle.initialized;

  await oracle.train([
    {input: 'Tech innovations and latest gadgets', output: 'Technology'}
  ]);
  
  // Salva o modelo
  await oracle.save();

  // Cria nova instância para carregar o modelo salvo
  const oracleReloaded = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024
  });
  await oracleReloaded.initialized;

  const prediction = await oracleReloaded.predict('Innovative gadgets');
  assert.strictEqual(prediction.toLowerCase(), 'technology', "Após carregar, a predição deve ser 'Technology'");

  console.log("testSaveAndLoad passou.");
}

async function testBestVariant() {
  console.log("Executando: testBestVariant");

  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: false,
    autoImport: false,
    size: 512 * 1024
  });
  await oracle.initialized;

  // Configura variações para uma categoria customizada
  oracle.categoryVariations.set('tech', new Map([['Technology', 10], ['Tech', 5]]));
  const best = oracle.bestVariant('tech');
  assert.strictEqual(best, 'Technology', "A melhor variação para 'tech' deve ser 'Technology'");

  console.log("testBestVariant passou.");
}

async function testResetAndDestroy() {
  console.log("Executando: testResetAndDestroy");

  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024
  });
  await oracle.initialized;

  // Treina uma amostra e testa a predição
  await oracle.train([
    {input: 'Political debate and news', output: 'Politics'}
  ]);
  let prediction = await oracle.predict('Political debate');
  assert.strictEqual(prediction.toLowerCase(), 'politics', "Antes do reset, a predição deve ser 'Politics'");

  // Reseta o modelo
  oracle.reset();
  // Após o reset, a predição pode retornar undefined ou valor nulo
  prediction = await oracle.predict('Political debate').catch(() => null);
  assert.ok(!prediction, "Após o reset, não deve haver predição válida");

  // Treina novamente para confirmar que o modelo continua funcional
  await oracle.train([
    {input: 'Health and wellness tips', output: 'Health'}
  ]);
  prediction = await oracle.predict('Wellness tips');
  assert.strictEqual(prediction.toLowerCase(), 'health', "Após novo treinamento, a predição deve ser 'Health'");

  // Testa destroy: após destroy, métodos devem lançar erro
  await oracle.destroy().catch(() => {}); // destroy rejeita a promise
  try {
    await oracle.predict('Any text');
    assert.fail("Não deve ser possível predit após destroy");
  } catch (err) {
    assert.ok(err, "Erro esperado após destroy");
  }

  console.log("testResetAndDestroy passou.");
}

async function testWeightedPrediction() {
  console.log("Executando: testWeightedPrediction");

  await cleanup();
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024
  });
  await oracle.initialized;

  await oracle.train([
    {input: 'News report and current events', output: 'News'},
    {input: 'Exciting football match highlights', output: 'Sports'}
  ]);

  // Testa predição ponderada utilizando objeto com pesos
  const weightedResults = await oracle.predict({
    'News report and current events': 0.3,
    'Exciting football match highlights': 0.7
  }, {as: 'objects', amount: 2});
  
  assert.ok(Array.isArray(weightedResults), "A predição ponderada deve retornar um array");
  assert.ok(weightedResults.length > 0, "Deve haver pelo menos um resultado na predição ponderada");

  weightedResults.forEach(result => {
    // Cada resultado deve conter a propriedade 'score'
    assert.ok(result.score, "Cada resultado deve possuir a propriedade 'score'");
  });

  console.log("testWeightedPrediction passou.");
}

async function testCategoryRelations() {
  console.log("Executando: testCategoryRelations");

  await cleanup();
  const oracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024
  });
  await oracle.initialized;

  await oracle.train([
    {input: 'News report and current events', output: ['Soccer', 'News']},
    {input: 'Exciting football match highlights', output: ['Soccer', 'Sports']}
  ]);
  
  const related = await oracle.getRelatedCategories('News', {as: 'array', amount: 2});
  assert.ok(Array.isArray(related), "getRelatedCategories deve retornar um array");
  assert.ok(related.length > 0, "Deve haver pelo menos um resultado na predição ponderada");
  assert.ok(related[0] === 'Soccer', 'A primeira categoria relacionada deve ser "Soccer"');

  console.log("testCategoryRelations passou.");
}

async function runAllTests() {
  try {
    await testTrainingAndPrediction();
    await testSaveAndLoad();
    await testBestVariant();
    await testResetAndDestroy();
    await testWeightedPrediction();
    await testCategoryRelations();
    console.log("Todos os testes passaram com sucesso.");
  } catch (err) {
    console.error("Falha nos testes:", err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runAllTests();
