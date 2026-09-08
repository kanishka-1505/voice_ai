import assert from 'assert';
import { evaluateEndpointing } from '../src/endpointing.js';

console.log('🧪 Testing Natural Phrasing Sentences with "so", "and", "for" (Item 4)...\n');

const testCases = [
  {
    sentence: "I'll take the seven PM slot, so that works.",
    expected: 'short',
    desc: 'Sentence with "so" followed by complete clause + terminal period'
  },
  {
    sentence: "I'll take the seven PM slot, so that works",
    expected: 'short',
    desc: 'Sentence with "so" followed by complete clause (no period)'
  },
  {
    sentence: "Book a table for four and that is all.",
    expected: 'short',
    desc: 'Sentence with "and" followed by complete clause'
  },
  {
    sentence: "I think so.",
    expected: 'short',
    desc: 'Complete idiom ending in "so" with terminal period'
  },
  {
    sentence: "I hope so",
    expected: 'short',
    desc: 'Complete idiom ending in "so" without period'
  },
  {
    sentence: "That's what I was looking for.",
    expected: 'short',
    desc: 'Complete idiom ending in "for" with terminal period'
  },
  {
    sentence: "That's all for now",
    expected: 'short',
    desc: 'Complete idiom ending in "for now"'
  },
  {
    sentence: "Book a table for, uh...",
    expected: 'long',
    desc: 'Genuinely trailing off on filler "uh"'
  },
  {
    sentence: "Book a table for",
    expected: 'long',
    desc: 'Dangling preposition "for" with missing slot'
  },
  {
    sentence: "I need a booth and",
    expected: 'long',
    desc: 'Dangling conjunction "and" with missing clause'
  }
];

let allPassed = true;

for (const t of testCases) {
  const res = evaluateEndpointing(t.sentence);
  const pass = res.windowType === t.expected;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] "${t.sentence}"`);
  console.log(`       Window: ${res.windowType.toUpperCase()} (${res.windowMs}ms) | Reason: ${res.reason}`);
  if (!pass) allPassed = false;
}

console.log('\n========================================');
if (allPassed) {
  console.log('🎉 100% OF NATURAL PHRASING ENDPOINTING TESTS PASSED!');
  console.log('Confirmed: 1800ms long window does NOT fire on natural complete phrasing ending in so/and/for.');
  console.log('========================================\n');
  process.exit(0);
} else {
  console.error('✗ Some tests failed!');
  process.exit(1);
}
