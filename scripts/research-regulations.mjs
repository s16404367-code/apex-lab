// research:regs — scaffolds a MANUAL verification entry (spec §6, §109).
// This tool performs NO network access. The human reads the official document
// and transcribes values; this script only generates the record skeleton.
import { writeFileSync } from 'node:fs';

const template = {
  howToUse: [
    '1. Open the official FIA Technical Regulations PDF (document version + issue date from the FIA website).',
    '2. For each value you transcribe, fill in article, page, documentVersion, issueDate.',
    '3. Sign it: verifiedBy = your name, verificationDate = today.',
    '4. Move the rule tier from game-default to verified ONLY with all fields present.',
    '5. Run npm run verify:regs — CI enforces the schema.'
  ],
  rulesToVerify: [
    { id: 'width-max', article: 'Art. 3.2', page: null, documentVersion: null, issueDate: null, verifiedBy: null, verificationDate: null },
    { id: 'height-max', article: 'Art. 3.3', page: null, documentVersion: null, issueDate: null, verifiedBy: null, verificationDate: null },
    { id: 'wheelbase-min', article: 'Art. 3.5', page: null, documentVersion: null, issueDate: null, verifiedBy: null, verificationDate: null },
    { id: 'mass-min', article: 'Art. 4.1', page: null, documentVersion: null, issueDate: null, verifiedBy: null, verificationDate: null },
    { id: 'rw-span-max', article: 'Art. 3.10.2', page: null, documentVersion: null, issueDate: null, verifiedBy: null, verificationDate: null }
  ]
};

writeFileSync('data/regulations/verification-worksheet.json.txt', JSON.stringify(template, null, 2));
console.log('Wrote data/regulations/verification-worksheet.json.txt');
console.log('Fill it in manually from the official document — no scraping, per spec §109.');
