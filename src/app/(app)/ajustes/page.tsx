import { PageHeader } from '@/components/page-header'
import { ThemeSelector } from './theme-selector'
import { AccountSection } from './account-section'

export const metadata = { title: 'Ajustes · Filoverde' }

export default function Page() {
  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-6 px-4 pt-2">
        <ThemeSelector />
        <AccountSection />
      </div>
    </>
  )
}
