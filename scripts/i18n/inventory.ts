import ts from 'typescript'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dir, '../..')
const workspace = resolve(root, '..')
const candidates: { file: string; line: number; kind: string; text: string }[] = []
const usages: Record<string, { file: string; line: number }[]> = {}
const mobileCandidates: { file: string; line: number; kind: string; text: string; context: string; sourceHash: string }[] = []
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex')
async function scan(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) { if (!['i18n', '__tests__'].includes(entry.name)) await scan(path); continue }
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\./.test(entry.name) || entry.name.endsWith('.d.ts')) continue
    const content = await readFile(path, 'utf8')
    const lines = content.split('\n')
    const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const location = (node: ts.Node) => ({ file: relative(workspace, path), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 })
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        (usages[node.arguments[0].text] ??= []).push(location(node))
      }
      let kind = ''
      let text = ''
      if (ts.isJsxText(node)) { kind = 'jsx'; text = node.text.replace(/\s+/g, ' ').trim() }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent
        if (ts.isJsxAttribute(parent) && /^(title|label|placeholder|description|alt|accessibilityLabel|aria-label)$/.test(parent.name.getText(file))) kind = 'attribute'
        else if (ts.isPropertyAssignment(parent) && /^(title|label|description|subtitle|message|text)$/.test(parent.name.getText(file).replaceAll(/["']/g, ''))) kind = 'copy-property'
        else if (ts.isCallExpression(parent) && /^(Alert\.alert|toast(?:\.[a-z]+)?|new Error)$/.test(parent.expression.getText(file))) kind = 'message'
        if (kind) text = node.text
      }
      if (kind && /[A-Za-z]{2}/.test(text)) candidates.push({ ...location(node), kind, text })
      if (path.includes('/mogging-mobile/')) {
        let copy = text
        let mobileKind = kind
        if (!mobileKind && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
          const value = node.text
          const parent = node.parent
          if (ts.isArrayLiteralExpression(parent) && /[A-Za-z]/.test(value)) mobileKind = 'array-value'
          else if (ts.isPropertyAssignment(parent) && /^(detail|tips|recommendation|explanation|reason|evidence|priceString|displayName|.*UsageDescription)$/.test(parent.name.getText(file).replaceAll(/["']/g, ''))) mobileKind = 'copy-property'
          else if (ts.isNewExpression(parent) && parent.expression.getText(file).endsWith('Error')) mobileKind = 'error'
          else if (/[A-Za-z]{2}[^\n]*\s+[A-Za-z]{2}/.test(value) && !/^(https?:|@\/|\.\/|\.\.\/)/.test(value)) mobileKind = 'literal-review'
          if (mobileKind) copy = value
        }
        if (ts.isTemplateExpression(node)) { mobileKind = 'computed-text'; copy = node.getText(file) }
        if (mobileKind && copy) mobileCandidates.push({ ...location(node), kind: mobileKind, text: copy,
          context: lines[location(node).line - 1].trim(), sourceHash: fingerprint(copy) })
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
}
for (const directory of ['moggingnew/pages', 'moggingnew/components', 'moggingnew/lib', 'mogging-mobile/src']) await scan(resolve(workspace, directory))
for (const name of ['app.config.js', 'app.json']) {
  const path = resolve(workspace, 'mogging-mobile', name)
  const content = await readFile(path, 'utf8')
  content.split('\n').forEach((context, index) => {
    if (!/UsageDescription|"description"|"displayName"/.test(context)) return
    const match = context.match(/:\s*"([^"]+)"/)
    if (match) mobileCandidates.push({ file: relative(workspace, path), line: index + 1, kind: 'native-config', text: match[1], context: context.trim(), sourceHash: fingerprint(match[1]) })
  })
}
for (const native of ['modules/mogging-push/ios/NotificationPermissionView.swift', 'ios/ExpoWidgetsTarget/MoggingPaywallActivity.swift']) {
  const path = resolve(workspace, 'mogging-mobile', native)
  const content = await readFile(path, 'utf8')
  content.split('\n').forEach((context, index) => {
    if (!/Text\(|Button\(|benefit\(|notification\(|\.description\(|configurationDisplayName\(|accessibilityLabel\(|errorMessage\s*=/.test(context)) return
    for (const match of context.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
      mobileCandidates.push({ file: relative(workspace, path), line: index + 1, kind: 'native-swift', text: match[1], context: context.trim(), sourceHash: fingerprint(match[1]) })
    }
  })
}
mobileCandidates.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind))
const mobileReview = mobileCandidates.map(candidate => {
  const codeValue = candidate.file.includes('/analytics/')
    || (candidate.kind === 'array-value' && /^[a-z][a-z\d_.:/-]*$/.test(candidate.text))
    || (candidate.kind === 'native-swift' && /^[a-z][a-z\d.]*$/.test(candidate.text))
    || /^\[\w+\]|^Bearer |^https?:/.test(candidate.text)
    || /console\.(info|warn|error|log)/.test(candidate.context)
    || (candidate.kind === 'computed-text' && !/[A-Za-z]{2}\s+[A-Za-z]{2}/.test(candidate.text.replace(/\$\{[^}]*\}/g, ' ')))
  return { ...candidate, triage: codeValue ? 'likely-code-value' : 'needs-context-review' }
})
await writeFile(resolve(root, 'localization/mobile-inventory.json'), JSON.stringify({
  note: 'Review candidates, including arrays, computed text and native resources. Contains code values and false positives; not a translation list or coverage percentage. Reconcile against the journey checklist and media/device review before release.',
  candidates: mobileReview,
  externalSources: ['moggingnew/lib/analysis/prompt.ts', 'moggingnew/lib/analysis/report.ts', 'moggingnew/lib/push/schedule.ts', 'moggingnew/pages/api/push/device.ts', 'moggingnew/lib/payments/activation-email.ts', 'App Store Connect product metadata', 'RevenueCat offerings', 'Linked support/privacy pages', 'Embedded media text'],
}, null, 2) + '\n')
await writeFile(resolve(root, 'localization/inventory.json'), JSON.stringify({
  note: 'Candidate inventory, not an exhaustive or reviewed coverage measure. Manually audit arrays, computed strings, native resources, media, emails, notifications, courses and generated report content.',
  candidates, usages,
}, null, 2) + '\n')
console.log(`Inventoried ${candidates.length} remaining text candidates and ${Object.keys(usages).length} explicit message IDs.`)
console.log(`Mobile reconciliation: ${mobileCandidates.length} candidates, including computed text and native resources.`)
