import assert from 'node:assert/strict'
import test from 'node:test'
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt'

test('analysis prompt encodes the research-weighted rubric', () => {
  const prompt = buildAnalysisPrompt('male')

  assert.match(prompt, /Gender scoring mode: male/i)
  assert.match(ANALYSIS_SYSTEM_PROMPT, /PSL is 0-8/i)
  assert.match(prompt, /Do not use the golden ratio/i)
  assert.match(prompt, /never classify or imply an apparent age below 18/i)
  assert.match(prompt, /"id": "facial-fat"/i)
  assert.match(prompt, /"id": "biological-age"/i)
  assert.match(prompt, /"id": "sun-damage"/i)
  assert.match(prompt, /Include a report object with exactly the 11 listed category ids/i)
  assert.match(prompt, /personalized to the visible face in this exact image/i)
  assert.match(prompt, /Facial-fat percentage must be framed as an apparent visual estimate/i)
})

test('analysis prompt blocks unsupported social and health claims', () => {
  const prompt = `${ANALYSIS_SYSTEM_PROMPT}\n${buildAnalysisPrompt('female')}`

  assert.match(prompt, /Do not infer identity, ethnicity, morality, intelligence, health diagnosis, fertility, or real-world worth/i)
  assert.match(prompt, /Do not claim objective health, fertility, morality, competence, intelligence/i)
})
