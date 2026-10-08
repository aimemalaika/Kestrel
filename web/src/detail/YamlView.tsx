import { useMemo } from 'react'
import yaml from 'js-yaml'
import hljs from 'highlight.js/lib/core'
import yamlLang from 'highlight.js/lib/languages/yaml'
import type { K8sObject } from '../contract/types'

hljs.registerLanguage('yaml', yamlLang)

export function YamlView({ object }: { object: K8sObject }) {
  const html = useMemo(() => {
    const text = yaml.dump(object, { noRefs: true, sortKeys: false, skipInvalid: true })
    return hljs.highlight(text, { language: 'yaml' }).value
  }, [object])
  return (
    <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.5, overflow: 'auto' }}>
      <code className="hljs language-yaml" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
