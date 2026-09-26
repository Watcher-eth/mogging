import assert from 'node:assert/strict'
import test from 'node:test'
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt'

test('analysis prompt encodes the research-weighted rubric', () => {
  const prompt = buildAnalysisPrompt('male')

  assert.match(prompt, /Gender scoring mode: male/i)
  assert.match(ANALYSIS_SYSTEM_PROMPT, /PSL is internally calibrated on 1-8/i)
  assert.match(prompt, /Do not use the golden ratio/i)
  assert.match(prompt, /never classify or imply an apparent age below 18/i)
  assert.match(prompt, /"id": "facial-fat"/i)
  assert.match(prompt, /"id": "biological-age"/i)
  assert.match(prompt, /"id": "sun-damage"/i)
  assert.match(prompt, /Include a report object with exactly the 11 listed category ids/i)
  assert.match(prompt, /Every category must have at least 4 and at most 6 features/i)
  assert.match(prompt, /report\.potential must estimate/i)
  assert.match(prompt, /never more than 1\.2 points above pslScore/i)
  assert.match(prompt, /personalized to the visible face in this exact image/i)
  assert.match(prompt, /title it "Facial definition"/i)
  assert.match(prompt, /overall category features must be exactly these six scored facial qualities/i)
  assert.match(prompt, /Never include market fit, approachability, distinctiveness, versatility/i)
  assert.match(prompt, /canthal tilt, eye spacing/i)
  assert.match(prompt, /gonial angle, chin projection/i)
})

test('analysis prompt blocks unsupported social and health claims', () => {
  const prompt = `${ANALYSIS_SYSTEM_PROMPT}\n${buildAnalysisPrompt('female')}`

  assert.match(prompt, /Do not infer identity, ethnicity, morality, intelligence, health diagnosis, fertility, or real-world worth/i)
  assert.match(prompt, /Do not claim objective health, fertility, morality, competence, intelligence/i)
})

test('both prompt modes require finding-specific, score-aware category actions', () => {
  for (const compact of [true, false]) {
    const prompt = buildAnalysisPrompt('female', { compact })
    assert.match(prompt, /BOTH the category score and its feature findings/)
    assert.match(prompt, /Different findings must produce different advice even at identical scores/)
    assert.match(prompt, /SPF 50\+/)
    assert.match(prompt, /every two hours outdoors/)
    assert.doesNotMatch(prompt, /Do not recommend[^\n]*SPF/)
    assert.doesNotMatch(prompt, /recommendation under 12 words/)
    for (const id of ['eyes', 'nose', 'mouth', 'jaw', 'dimorphism', 'face-shape', 'facial-fat', 'biological-age', 'sun-damage', 'symmetry', 'overall']) {
      assert.ok(prompt.includes(`* ${id}:`), id)
    }
  }
})
