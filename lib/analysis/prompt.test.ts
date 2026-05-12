import assert from 'node:assert/strict'
import test from 'node:test'
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt'

test('analysis prompt encodes the research-weighted rubric', () => {
  const prompt = buildAnalysisPrompt('male')

  assert.match(prompt, /proportionality and averageness are the strongest structural predictors/i)
  assert.match(prompt, /Symmetry matters, but its effect is modest/i)
  assert.match(prompt, /male mode, masculinity is context-dependent/i)
  assert.match(prompt, /Do not use the golden ratio/i)
  assert.match(prompt, /never classify or imply an apparent age below 18/i)
})

test('analysis prompt blocks unsupported social and health claims', () => {
  const prompt = `${ANALYSIS_SYSTEM_PROMPT}\n${buildAnalysisPrompt('female')}`

  assert.match(prompt, /Do not infer identity, morality, intelligence, health diagnosis, ethnicity, fertility, or real-world social worth/i)
  assert.match(prompt, /Do not claim objective health, fertility, morality, competence, or intelligence/i)
})
