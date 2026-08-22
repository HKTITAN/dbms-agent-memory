import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Source_Serif_4, Nunito } from 'next/font/google'
import './globals.css'

/* The text face for print.
 *
 * The web edition is set in Geist, which is a screen face and right for a page
 * that is read on a screen. The PDF is a different document with a different
 * job: forty-odd pages read on paper at 9.5pt, where a grotesque sans gives the
 * eye nothing to hold onto between lines. Source Serif is drawn for exactly this
 * — a text face with real italics, lining figures for the tables, and enough
 * contrast to survive a laser printer.
 *
 * `next/font` downloads it at build time and self-hosts it, so the PDF embeds a
 * font it owns rather than one that happens to be installed on whoever renders
 * it. Only print consumes it; the screen never loads it. */
const serif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

/* The text face for the screen.
 *
 * Duolingo's own faces — Feather Bold and duolingo-sans — are not licensable.
 * Nunito is the substitute Duolingo names on its identity page, which makes it
 * the only legally clean route to this feel rather than an approximation of it.
 * It is also the reason the whole type scale moved up in weight: Nunito's
 * rounded terminals absorb optical weight, so 500 is its regular and 800 is what
 * reads as bold. 900 exists for display sizes only.
 *
 * Geist Sans stays loaded — the machine canvas still uses it for the record
 * views, where a rounded face would be dishonest about what it is showing. */
const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-nunito',
})

export const metadata: Metadata = {
  title: 'Persistent memory architecture for agents — a review of Notion’s Lore',
  description:
    'A review of Notion’s Lore, the open-source agent memory system backed by five Notion databases, '
    + 'analysed as a database design and reimplemented on SQLite and PostgreSQL to measure what the '
    + 'substrate cannot express or refuse.',
  authors: [
    { name: 'Harshit Khemani' },
    { name: 'Kush Ahuja' },
    { name: 'Madhav Bassi' },
    { name: 'Kushagra Agrawal' },
  ],
  keywords: [
    'DBMS', 'database management systems', 'agent memory', 'Lore', 'Notion',
    'Model Context Protocol', 'MCP', 'entity-relationship model', 'normalization', 'BCNF',
    'functional dependency', 'temporal database', 'valid time', 'transaction time',
    'bitemporal', 'exclusion constraint', 'referential integrity', 'lost update',
    'entity resolution', 'record linkage', 'provenance', 'full-text search',
    'PostgreSQL', 'SQLite', 'knowledge graph',
  ],
  openGraph: {
    title: 'Persistent memory architecture for agents',
    description:
      'Notion’s Lore answers a realistic recall workload correctly — and needs 1 447 HTTP requests '
      + 'per question to do it, where one SQL statement suffices. A review, with measurements.',
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
  themeColor: '#ffffff',
  colorScheme: 'light' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}
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
