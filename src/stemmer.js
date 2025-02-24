import { 
  PorterStemmer, PorterStemmerFa, PorterStemmerFr, 
  PorterStemmerDe, PorterStemmerUk, PorterStemmerRu, PorterStemmerEs, 
  PorterStemmerIt, PorterStemmerNo, PorterStemmerSv, PorterStemmerPt, 
  PorterStemmerNl, StemmerJa, StemmerId
} from 'natural/lib/natural/stemmers/index.js';

export function getStemmer(language) {
  switch (language) {
    case 'fr':
      return PorterStemmerFr;
    case 'de':
      return PorterStemmerDe;
    case 'es':
      return PorterStemmerEs;
    case 'it':
      return PorterStemmerIt;
    case 'no':
      return PorterStemmerNo;
    case 'sv':
      return PorterStemmerSv;
    case 'pt':
      return PorterStemmerPt;
    case 'nl':
      return PorterStemmerNl;
    case 'ru':
      return PorterStemmerRu;
    case 'uk':
      return PorterStemmerUk;
    case 'fa':
      return PorterStemmerFa;
    case 'ja':
      return StemmerJa;
    case 'id':
      return StemmerId;
    case 'en':
    default:
      return PorterStemmer;
  }
} 

export function stem(word, language) {
  return getStemmer(language).stem(word);
};

export function tokenizeAndStem(text, language) {
  return getStemmer(language).tokenizeAndStem(text);
};