import { PageHeader } from '@/components/page-header'
import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Gráficas · Filoverde' }

export default function Page() {
  return (
    <>
      <PageHeader title="Gráficas" />
      <ComingSoon text="Aquí verás tu rendimiento por mercado, casa y estrategia." />
    </>
  )
}
