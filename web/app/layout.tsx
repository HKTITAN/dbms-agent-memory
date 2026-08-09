import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Persistent Memory Architecture in Agents Using DBMS',
  description:
    'A review paper on persistent memory for AI agents, measured across ten storage architectures — '
    + 'file stores, SQLite 3.53 and PostgreSQL 18.3 with pgvector — over a labelled corpus of agent memories.',
  authors: [
    { name: 'Harshit Khemani' },
    { name: 'Kush Ahuja' },
    { name: 'Madhav Bassi' },
    { name: 'Kushagra Agrawal' },
  ],
  keywords: [
    'DBMS', 'database management systems', 'agent memory', 'persistent memory',
    'entity-relationship model', 'normalization', 'BCNF', 'indexing', 'B-tree',
    'inverted index', 'HNSW', 'pgvector', 'full-text search', 'ACID', 'transactions',
    'concurrency control', 'query optimization', 'retrieval-augmented generation',
    'PostgreSQL', 'SQLite', 'vector database',
  ],
  openGraph: {
    title: 'Persistent Memory Architecture in Agents Using DBMS',
    description:
      'Ten storage architectures for agent memory, measured on one labelled corpus. '
      + '61.7% of a realistic recall workload cannot be expressed as similarity search.',
    type: 'article',
  },
}

/* Light only. Declaring a dark theme-color would let the browser tint its own
   chrome to a colour this page never paints.

   This is the one literal colour in the codebase and it has to be: `theme-color`
   is read before any stylesheet applies, so it cannot reference a custom
   property. The value is `--bg` from globals.css; changing one without the other
   is the only way the two can drift. */
export const viewport = {
  themeColor: '#fcfcfb',
  colorScheme: 'light' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      style={{ colorScheme: 'light' }}
    >
      <head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  )
}
