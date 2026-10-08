import { useMemo } from 'react'
import yaml from 'js-yaml'
import hljs from 'highlight.js/lib/core'
import yamlLang from 'highlight.js/lib/languages/yaml'
import { Card } from '../ui'
import type { K8sObject } from '../contract/types'

hljs.registerLanguage('yaml', yamlLang)

export function YamlView({ object }: { object: K8sObject }) {
  const html = useMemo(() => {
    const text = yaml.dump(object, { noRefs: true, sortKeys: false, skipInvalid: true })
    return hljs.highlight(text, { language: 'yaml' }).value
  }, [object])
  return (
    <Card className="overflow-hidden">
      <pre className="m-0 overflow-auto text-xs leading-relaxed font-mono bg-[#0f1420] text-zinc-300">
        <code
          className="hljs language-yaml !bg-transparent !p-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </Card>
  )
}
