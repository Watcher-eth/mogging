import { KimiAnalysisProvider } from './providers/kimi'
import type { AnalysisProvider } from './schema'

export const analysisProvider: AnalysisProvider = new KimiAnalysisProvider()
