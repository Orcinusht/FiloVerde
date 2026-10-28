import { PageHeader } from '@/components/page-header'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Apuestas · Filoverde' }

export default function Page() {
  return (
    <>
      <PageHeader title="Apuestas" />
      <ComingSoon text="Aquí verás y registrarás tus apuestas a partir de capturas." />
    </>
  )
}
