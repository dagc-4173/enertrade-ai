import type { PageKey } from '../../types/domain'
export function NavigationIcon({ page }: { page: PageKey | 'menu' }) {
 const paths = {
 dashboard: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
 marketplace: 'M3 9h18l-2-6H5L3 9Zm2 0v12h14V9M9 21v-7h6v7M3 9c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0',
 predictions: 'M4 3v17h17M7 15l4-5 4 3 5-7',
 transactions: 'M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4',
 patterns: 'M3 15l4-8 5 12 5-12 4 8',
 profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
 menu: 'M4 6h16M4 12h16M4 18h16',
 }
 return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[page]} /></svg>
}
