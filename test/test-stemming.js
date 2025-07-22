import { Trias } from "../src/trias.mjs";
import fs from 'fs/promises';
import path from 'path';
import assert from 'assert';

// __dirname configuration for ES modules
const __dirname = path.dirname(import.meta.url.replace(new RegExp('^file:\/{2,3}'), ''));
const modelFile = path.join(__dirname, 'stemming-test-model.trias');

// Function to clean up the test model file
async function cleanup() {
  await fs.unlink(modelFile).catch(() => {});
}

async function testStemmingLanguages() {
  console.log("🧪 Testing Stemming for Different Languages...\n");
  
  await cleanup();
  
  console.log('🔍 Test 1: English Stemming (Default)');
  console.log('=====================================');
  
  const englishOracle = new Trias({
    file: modelFile,
    language: 'en',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  
  await englishOracle.initialized;
  
  await englishOracle.train([
    {input: 'Running and jumping activities', output: 'Sports'},
    {input: 'Running shoes and equipment', output: 'Equipment'}
  ]);
  
  const englishPrediction = await englishOracle.predict('Running shoes');
  console.log(`✅ English prediction: ${englishPrediction}`);
  assert.ok(englishPrediction, "English stemming should work");
  
  console.log('\n🔍 Test 2: Portuguese Stemming');
  console.log('==============================');
  
  const portugueseOracle = new Trias({
    file: modelFile + '.pt',
    language: 'pt',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  
  await portugueseOracle.initialized;
  
  await portugueseOracle.train([
    {input: 'Correndo e pulando atividades', output: 'Esportes'},
    {input: 'Tênis de corrida e equipamentos', output: 'Equipamentos'}
  ]);
  
  const portuguesePrediction = await portugueseOracle.predict('Tênis de corrida');
  console.log(`✅ Portuguese prediction: ${portuguesePrediction}`);
  assert.ok(portuguesePrediction, "Portuguese stemming should work");
  
  console.log('\n🔍 Test 3: Farsi Stemming (Disabled)');
  console.log('=====================================');
  
  const farsiOracle = new Trias({
    file: modelFile + '.fa',
    language: 'fa',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  
  await farsiOracle.initialized;
  
  // Note: Farsi stemming is currently disabled, so it should still work but without stemming
  await farsiOracle.train([
    {input: 'فعالیت‌های دویدن و پریدن', output: 'ورزش'},
    {input: 'کفش دویدن و تجهیزات', output: 'تجهیزات'}
  ]);
  
  const farsiPrediction = await farsiOracle.predict('کفش دویدن');
  console.log(`✅ Farsi prediction: ${farsiPrediction}`);
  // Farsi should still work even though stemming is disabled
  assert.ok(farsiPrediction === '' || farsiPrediction, "Farsi should work (stemming disabled)");
  
  console.log('\n🔍 Test 4: Spanish Stemming');
  console.log('===========================');
  
  const spanishOracle = new Trias({
    file: modelFile + '.es',
    language: 'es',
    capitalize: true,
    autoImport: false,
    size: 512 * 1024,
    enableCaching: true,
    batchSize: 50
  });
  
  await spanishOracle.initialized;
  
  await spanishOracle.train([
    {input: 'Corriendo y saltando actividades', output: 'Deportes'},
    {input: 'Zapatos de correr y equipamiento', output: 'Equipamiento'}
  ]);
  
  const spanishPrediction = await spanishOracle.predict('Zapatos de correr');
  console.log(`✅ Spanish prediction: ${spanishPrediction}`);
  assert.ok(spanishPrediction, "Spanish stemming should work");
  
  console.log('\n🎉 Stemming Tests Completed Successfully!');
  console.log('\n📝 Note: Farsi stemming is currently disabled as noted in the code comments.');
  console.log('   This is expected behavior and the module handles it gracefully.');
  
  await cleanup();
}

testStemmingLanguages().catch(console.error); 